"""Pipeline end-to-end: lee datos -> calcula indices -> escribe exports/metrics.json.

Uso:
    # Desde el endpoint Apps Script
    python build_metrics.py --url "https://script.google.com/macros/s/.../exec"

    # Desde un xlsx local (modo fallback / desarrollo)
    python build_metrics.py --xlsx ../Guarne_DILIGENCIADO.xlsx

Parametros metodologicos (con defaults conservadores documentados en docs/metodologia.md):
    --rol Proponente,Ponente    qué Rol(es) cuentan para atribuir un tema (lista separada por comas)
    --tema Tematica             columna de tema (Sector | Tematica | Tema segun Concejo)
    --min-instrumentos 3        excluir concejales con menos instrumentos del Jaccard
    --municipios "LA CEJA,GUARNE"  filtrar a municipios (nombres o codigos DANE). Vacio = todos
"""

from __future__ import annotations

import argparse
import itertools
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from agendapp.indices import (
    convergencia_agendas,
    jaccard_pairwise_mean,
    party_correlation,
    shannon_norm,
)
from agendapp.io import fetch_endpoint, load_xlsx_municipio
from agendapp.transform import (
    binarizar,
    canonicalizar_serie,
    clave_norm,
    filtrar_min_instrumentos,
    filtrar_municipios,
    matriz_concejal_tema,
    perfil_partido,
)

UMBRAL_JACCARD = 0.5
# Pares "grandes" para el resumen interpartidista: ambos partidos con >= N
# concejales. Con menos casos el perfil no es estimable y el promedio global
# se contamina (ver Documentacion_Convergencia_Agendas, seccion 5.2).
UMBRAL_N_CONCEJALES = 10


def cargar(args) -> tuple[pd.DataFrame, dict]:
    """Devuelve (df_instrumentos, dict mapeo ID_Concejal -> Nombre completo)."""
    if args.url:
        data = fetch_endpoint(args.url, recurso="todo")
        df = pd.DataFrame(data["instrumentos"])
        nombres = {c["ID_Concejal"]: c.get("Nombre completo", "") for c in data.get("concejales", []) if c.get("ID_Concejal")}
    elif args.xlsx:
        d = load_xlsx_municipio(args.xlsx)
        df = d["instrumentos"]
        nombres = dict(zip(d["concejales"]["ID_Concejal"], d["concejales"]["Nombre completo"]))
    else:
        raise SystemExit("Debe especificar --url o --xlsx")

    # Normalizacion de columnas
    df.columns = [str(c).strip() for c in df.columns]
    if "Partido / Movimiento" in df.columns:
        df["Partido / Movimiento"] = df["Partido / Movimiento"].astype(str).str.strip().str.upper()

    # ID canonico unico cross-municipio: <DANE>-<Identificador>
    # Si Apps Script ya lo trae, respetarlo; si no, computarlo.
    if "id_instrumento" not in df.columns or df["id_instrumento"].isna().all():
        dane_norm = df.get("Codigo DANE", pd.Series(dtype=str)).astype(str).str.zfill(5)
        ident = df["Identificador"].astype(str).str.strip()
        df["id_instrumento"] = dane_norm + "-" + ident

    # Higiene: una fila por (id_instrumento, Rol, ID_Concejal). Evita doble conteo
    # si por error una persona aparece dos veces como mismo Rol en el mismo instrumento.
    df = df.drop_duplicates(subset=["id_instrumento", "Rol", "ID_Concejal"])

    return df, nombres


def construir_metrics(df: pd.DataFrame, nombres: dict, args) -> dict:
    roles = tuple(r.strip() for r in args.rol.split(","))
    col_tema = args.tema

    # Filtro de municipios (por nombre o codigo DANE). Vacio = todos.
    municipios_filtro = [m.strip() for m in args.municipios.split(",")] if args.municipios else []
    if municipios_filtro:
        df = filtrar_municipios(df, municipios_filtro)

    # Filtro de clasificacion legal (Acuerdo / Proyecto de Acuerdo / ...). Vacio = todas.
    clasif_filtro = [c.strip() for c in args.clasificacion.split(",")] if args.clasificacion else []
    if clasif_filtro and "Clasificacion legal" in df.columns:
        sel = {c.lower() for c in clasif_filtro}
        df = df[df["Clasificacion legal"].astype(str).str.strip().str.lower().isin(sel)]

    df = df.copy()

    # Excluir ADMINISTRACION (iniciativas del ejecutivo) de todos los conteos.
    es_admin = pd.Series(False, index=df.index)
    if "Partido / Movimiento" in df.columns:
        es_admin |= df["Partido / Movimiento"].map(clave_norm).str.startswith("ADMINISTRAC")
    if "ID_Concejal" in df.columns:
        es_admin |= df["ID_Concejal"].map(clave_norm).str.startswith("ADMINISTRAC")
    df = df[~es_admin]

    # Canonizar categorias para que variantes por mayusculas/tildes no fragmenten.
    if col_tema in df.columns:
        df[col_tema] = canonicalizar_serie(df[col_tema])
    if "Sector" in df.columns:
        df["Sector"] = canonicalizar_serie(df["Sector"])

    # Mapa DANE -> nombre de municipio (para etiquetar concejales y listar disponibles)
    dane_a_municipio: dict[str, str] = {}
    if "Codigo DANE" in df.columns:
        col_mun = next((c for c in ("municipio_origen", "municipio") if c in df.columns), None)
        danes = df["Codigo DANE"].astype(str).str.strip().str.zfill(5)
        for dane, sub in df.groupby(danes):
            nombre_mun = ""
            if col_mun:
                vals = sub[col_mun].dropna().astype(str).str.strip()
                nombre_mun = vals.iloc[0] if len(vals) else ""
            dane_a_municipio[dane] = nombre_mun
    municipios_disponibles = sorted(
        ({"dane": d, "municipio": n} for d, n in dane_a_municipio.items()),
        key=lambda x: x["municipio"] or x["dane"],
    )

    def municipio_de(cid) -> str:
        s = str(cid)
        dane = s.split("-")[0].zfill(5) if "-" in s else ""
        return dane_a_municipio.get(dane, "")

    # Universo global de temas (solo entre los Incluir=Si y con tema poblado)
    df_filt = df.copy()
    if "Incluir en analisis" in df_filt.columns:
        # Incluir todo salvo lo marcado "No" (vacio = incluido). Ver transform.filtrar_instrumentos.
        _inc = df_filt["Incluir en analisis"].astype(str).str.strip().str.lower()
        df_filt = df_filt[_inc != "no"]
    df_filt = df_filt.dropna(subset=[col_tema])
    df_filt = df_filt[df_filt[col_tema].astype(str).str.strip() != ""]
    universo_temas = sorted(df_filt[col_tema].astype(str).str.strip().unique().tolist())
    universo_sectores = sorted(
        df_filt["Sector"].dropna().astype(str).str.strip().replace("", pd.NA).dropna().unique().tolist()
    ) if "Sector" in df_filt.columns else []

    # Conteos unicos de instrumentos
    instrumentos_unicos_incluidos = df_filt["id_instrumento"].nunique()
    instrumentos_unicos_total = df["id_instrumento"].nunique()

    # Matriz global concejal x tema (todos los roles indicados)
    M = matriz_concejal_tema(df, col_tema=col_tema, roles=roles, universo_temas=universo_temas)

    # Mapeo concejal -> partido (toma el partido mas frecuente del concejal en el df filtrado)
    asignacion = (
        df[df["Rol"].astype(str).isin(list(roles))]
        .groupby("ID_Concejal")["Partido / Movimiento"]
        .agg(lambda s: s.value_counts().idxmax() if len(s) else None)
        .to_dict()
    )

    # H por concejal
    h_por_concejal = M.apply(shannon_norm, axis=1)

    concejales_out = []
    for cid, h in h_por_concejal.items():
        concejales_out.append({
            "id": cid,
            "nombre": nombres.get(cid, ""),
            "partido": asignacion.get(cid),
            "municipio": municipio_de(cid),
            "n_instrumentos": int(M.loc[cid].sum()),
            "shannon_norm": round(float(h), 4),
        })

    # Por partido: filtra concejales con minimo, calcula CV, Jaccard, perfil
    partidos_out = []
    perfiles = {}
    excluidos_global = []

    for partido, cids in pd.Series(asignacion).groupby(pd.Series(asignacion)).groups.items():
        cids = [c for c in cids if c in M.index]
        if not cids:
            continue
        sub = M.loc[cids]
        sub_apta, excluidos = filtrar_min_instrumentos(sub, minimo=args.min_instrumentos)
        excluidos_global.extend([{"id": c, "partido": partido} for c in excluidos])

        j = jaccard_pairwise_mean(binarizar(sub_apta).values) if sub_apta.shape[0] >= 2 else float("nan")
        perfil = perfil_partido(sub)  # perfil sobre todos los concejales del partido (no filtra)
        perfiles[partido] = perfil
        # Shannon del bloque: diversidad de la agenda agregada del partido (sobre la
        # riqueza observada del perfil). 0 = partido monotematico, 1 = reparte parejo.
        h_partido = shannon_norm(perfil.values) if not perfil.empty else float("nan")

        partidos_out.append({
            "nombre": partido,
            "n_concejales": int(sub.shape[0]),
            "n_concejales_aptos": int(sub_apta.shape[0]),
            "shannon_partido": None if np.isnan(h_partido) else round(float(h_partido), 4),
            "jaccard_intra": None if np.isnan(j) else round(float(j), 4),
            "perfil_tematico": {t: round(float(v), 4) for t, v in perfil.items() if v > 0},
        })

    # Convergencia inter-partido (Sigelman & Buell 2004) como metrica principal,
    # Pearson como prueba de robustez. Perfiles alineados al universo de temas.
    n_concejales_por_partido = {p["nombre"]: p["n_concejales"] for p in partidos_out}
    interpartido = []
    partidos_nombres = list(perfiles.keys())
    for a, b in itertools.combinations(partidos_nombres, 2):
        va = perfiles[a].reindex(universo_temas).fillna(0).values
        vb = perfiles[b].reindex(universo_temas).fillna(0).values
        c = convergencia_agendas(va, vb)
        r = party_correlation(va, vb)
        na = n_concejales_por_partido.get(a, 0)
        nb = n_concejales_por_partido.get(b, 0)
        interpartido.append({
            "a": a,
            "b": b,
            "convergencia": None if np.isnan(c) else round(float(c), 4),
            "pearson": None if np.isnan(r) else round(float(r), 4),
            "n_concejales_a": na,
            "n_concejales_b": nb,
            "par_grande": na >= UMBRAL_N_CONCEJALES and nb >= UMBRAL_N_CONCEJALES,
        })

    conv_grandes = [p["convergencia"] for p in interpartido if p["par_grande"] and p["convergencia"] is not None]
    resumen_interpartido = {
        "convergencia_media_pares_grandes": round(float(np.mean(conv_grandes)), 4) if conv_grandes else None,
        "convergencia_min_pares_grandes": round(float(np.min(conv_grandes)), 4) if conv_grandes else None,
        "convergencia_max_pares_grandes": round(float(np.max(conv_grandes)), 4) if conv_grandes else None,
        "n_pares_grandes": len(conv_grandes),
    }

    # Veredicto a nivel partido segun convergencia tematica (Jaccard).
    # J >= umbral => convergencia intra-partido (apoya H1); J < umbral => autonomia (H2).
    h1_count, h2_count, neutros = 0, 0, 0
    for p in partidos_out:
        j = p["jaccard_intra"]
        if j is None:
            neutros += 1
        elif j >= UMBRAL_JACCARD:
            h1_count += 1
        else:
            h2_count += 1

    veredicto = {
        "umbral_jaccard": UMBRAL_JACCARD,
        "partidos_apoyan_H1": h1_count,
        "partidos_apoyan_H2": h2_count,
        "partidos_ambiguos": neutros,
        "interpretacion": (
            "H1 apoyada" if h1_count > h2_count
            else "H2 apoyada" if h2_count > h1_count
            else "Resultado mixto / no concluyente"
        ),
    }

    return {
        "generadoEn": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "parametros": {
            "rol": list(roles),
            "tema": col_tema,
            "min_instrumentos": args.min_instrumentos,
            "municipios": municipios_filtro or "todos",
            "clasificaciones": clasif_filtro or "todas",
        },
        "municipios": municipios_disponibles,
        "universo_temas": universo_temas,
        "universo_sectores": universo_sectores,
        "n_instrumentos_unicos_incluidos": int(instrumentos_unicos_incluidos),
        "n_instrumentos_unicos_total": int(instrumentos_unicos_total),
        "concejales": concejales_out,
        "partidos": partidos_out,
        "interpartido": interpartido,
        "parametros_interpartido": {
            "metrica_principal": "convergencia_sigelman_buell_2004",
            "umbral_n_concejales": UMBRAL_N_CONCEJALES,
        },
        "resumen_interpartido": resumen_interpartido,
        "excluidos_min_instrumentos": excluidos_global,
        "veredicto": veredicto,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", help="URL del Web App Apps Script")
    p.add_argument("--xlsx", help="Ruta a un Excel local (fallback)")
    p.add_argument("--rol", default="Proponente,Ponente", help="Rol(es) separados por coma")
    p.add_argument("--tema", default="Tematica", choices=["Sector", "Tematica", "Tema segun Concejo"])
    p.add_argument("--municipios", default="",
                   help="Filtra a estos municipios (nombres o codigos DANE separados por coma). "
                        "Vacio = todos.")
    p.add_argument("--clasificacion", default="",
                   help="Filtra por Clasificacion legal (ej. 'Acuerdo' o 'Acuerdo,Proyecto de Acuerdo'). "
                        "Vacio = todas.")
    p.add_argument("--min-instrumentos", type=int, default=1,
                   help="Concejales con < N instrumentos como autor (Proponente/Ponente) se excluyen de CV/Jaccard. "
                        "Default 1 = incluir a todos (H=0 representa hiperespecializacion).")
    p.add_argument("--out", default="exports/metrics.json")
    args = p.parse_args()

    df, nombres = cargar(args)
    metrics = construir_metrics(df, nombres, args)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito {out} ({out.stat().st_size} bytes)")
    print(f"  Concejales: {len(metrics['concejales'])}")
    print(f"  Partidos: {len(metrics['partidos'])}")
    print(f"  Veredicto: {metrics['veredicto']['interpretacion']}")


if __name__ == "__main__":
    main()
