"""Pipeline end-to-end: lee datos -> calcula indices -> escribe exports/metrics.json.

Uso:
    # Desde el endpoint Apps Script
    python build_metrics.py --url "https://script.google.com/macros/s/.../exec"

    # Desde un xlsx local (modo fallback / desarrollo)
    python build_metrics.py --xlsx ../Guarne_DILIGENCIADO.xlsx

Parametros metodologicos (con defaults conservadores documentados en docs/metodologia.md):
    --rol Proponente,Ponente    qué Rol(es) cuentan para atribuir un tema (lista separada por comas)
    --tema Tematica             columna de tema (Sector | Tematica | Tema segun Concejo)
    --min-instrumentos 3        excluir concejales con menos instrumentos del CV/Jaccard
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
    cv_shannon,
    jaccard_pairwise_mean,
    party_correlation,
    shannon_norm,
)
from agendapp.io import fetch_endpoint, load_xlsx_municipio
from agendapp.transform import (
    binarizar,
    filtrar_min_instrumentos,
    matriz_concejal_tema,
    perfil_partido,
)

UMBRAL_CV = 0.3
UMBRAL_JACCARD = 0.5


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

    # Universo global de temas (solo entre los Incluir=Si y con tema poblado)
    df_filt = df.copy()
    if "Incluir en analisis" in df_filt.columns:
        df_filt = df_filt[df_filt["Incluir en analisis"].astype(str).str.strip().str.lower().eq("si")]
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

        h_vals = sub_apta.apply(shannon_norm, axis=1).values if not sub_apta.empty else np.array([])
        cv = cv_shannon(h_vals) if h_vals.size >= 2 else float("nan")
        j = jaccard_pairwise_mean(binarizar(sub_apta).values) if sub_apta.shape[0] >= 2 else float("nan")
        perfil = perfil_partido(sub)  # perfil sobre todos los concejales del partido (no filtra)
        perfiles[partido] = perfil

        partidos_out.append({
            "nombre": partido,
            "n_concejales": int(sub.shape[0]),
            "n_concejales_aptos": int(sub_apta.shape[0]),
            "cv_shannon": None if np.isnan(cv) else round(float(cv), 4),
            "jaccard_intra": None if np.isnan(j) else round(float(j), 4),
            "perfil_tematico": {t: round(float(v), 4) for t, v in perfil.items() if v > 0},
        })

    # Correlaciones inter-partido (Pearson sobre perfiles alineados al universo de temas)
    interpartido = []
    nombres = list(perfiles.keys())
    for a, b in itertools.combinations(nombres, 2):
        va = perfiles[a].reindex(universo_temas).fillna(0).values
        vb = perfiles[b].reindex(universo_temas).fillna(0).values
        r = party_correlation(va, vb)
        interpartido.append({"a": a, "b": b, "pearson": None if np.isnan(r) else round(float(r), 4)})

    # Veredicto a nivel partido: cuantos cumplen H1a vs H2a
    h1_count, h2_count, neutros = 0, 0, 0
    for p in partidos_out:
        cv = p["cv_shannon"]
        j = p["jaccard_intra"]
        if cv is None or j is None:
            neutros += 1
            continue
        if cv <= UMBRAL_CV and j >= UMBRAL_JACCARD:
            h1_count += 1
        elif cv > UMBRAL_CV and j < UMBRAL_JACCARD:
            h2_count += 1
        else:
            neutros += 1

    veredicto = {
        "umbral_cv": UMBRAL_CV,
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
        },
        "universo_temas": universo_temas,
        "universo_sectores": universo_sectores,
        "n_instrumentos_unicos_incluidos": int(instrumentos_unicos_incluidos),
        "n_instrumentos_unicos_total": int(instrumentos_unicos_total),
        "concejales": concejales_out,
        "partidos": partidos_out,
        "interpartido": interpartido,
        "excluidos_min_instrumentos": excluidos_global,
        "veredicto": veredicto,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", help="URL del Web App Apps Script")
    p.add_argument("--xlsx", help="Ruta a un Excel local (fallback)")
    p.add_argument("--rol", default="Proponente,Ponente", help="Rol(es) separados por coma")
    p.add_argument("--tema", default="Tematica", choices=["Sector", "Tematica", "Tema segun Concejo"])
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
