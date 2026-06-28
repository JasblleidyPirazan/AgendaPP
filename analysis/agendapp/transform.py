"""Transformaciones de la tabla larga de instrumentos a matrices analiticas."""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

ROLES_DEFAULT = ("Proponente", "Ponente", "Coordinador")
COL_TEMA_DEFAULT = "Tematica"
MIN_INSTRUMENTOS_DEFAULT = 1


def filtrar_municipios(df: pd.DataFrame, municipios: Iterable[str]) -> pd.DataFrame:
    """Filtra filas por municipio. Acepta nombres (col 'municipio_origen'/'municipio')
    o codigos DANE (col 'Codigo DANE'), case-insensitive. Lista vacia = sin filtro."""
    sel = {str(m).strip().lower() for m in municipios if str(m).strip()}
    if not sel:
        return df
    mask = pd.Series(False, index=df.index)
    name_col = next((c for c in ("municipio_origen", "municipio") if c in df.columns), None)
    if name_col:
        mask |= df[name_col].astype(str).str.strip().str.lower().isin(sel)
    if "Codigo DANE" in df.columns:
        danes = {s.zfill(5) for s in sel}
        mask |= df["Codigo DANE"].astype(str).str.strip().str.zfill(5).isin(danes)
    return df[mask]


def filtrar_instrumentos(
    df: pd.DataFrame,
    roles: Iterable[str] = ROLES_DEFAULT,
    solo_incluidos: bool = True,
) -> pd.DataFrame:
    """Aplica los filtros estandar: Incluir=Si + rol(es) de autoria.

    `solo_incluidos=True` requiere la columna 'Incluir en analisis' == 'Si'.
    """
    out = df.copy()
    if solo_incluidos and "Incluir en analisis" in out.columns:
        out = out[out["Incluir en analisis"].astype(str).str.strip().str.lower().eq("si")]
    if roles and "Rol" in out.columns:
        roles_norm = {r.strip().lower() for r in roles}
        out = out[out["Rol"].astype(str).str.strip().str.lower().isin(roles_norm)]
    return out


def matriz_concejal_tema(
    df: pd.DataFrame,
    col_tema: str = COL_TEMA_DEFAULT,
    col_concejal: str = "ID_Concejal",
    roles: Iterable[str] = ROLES_DEFAULT,
    solo_incluidos: bool = True,
    universo_temas: Iterable[str] | None = None,
) -> pd.DataFrame:
    """Matriz |concejales| x |temas| con conteos de instrumentos.

    `universo_temas`: si se pasa, alinea las columnas a esa lista (rellena con 0
    los temas no observados). Necesario para que la matriz de un partido tenga
    las mismas columnas que la del universo y los perfiles agregados sean comparables.
    """
    filt = filtrar_instrumentos(df, roles=roles, solo_incluidos=solo_incluidos)
    # Excluir filas con tema vacio (data quality: se reportan en notebook 01,
    # pero NO deben contribuir al conteo ni a la matriz de indices).
    filt = filt.dropna(subset=[col_tema])
    filt = filt[filt[col_tema].astype(str).str.strip() != ""]
    if filt.empty:
        cols = list(universo_temas) if universo_temas is not None else []
        return pd.DataFrame(columns=cols, dtype=float)

    pivot = (
        filt.assign(_n=1)
        .pivot_table(
            index=col_concejal,
            columns=col_tema,
            values="_n",
            aggfunc="sum",
            fill_value=0,
        )
        .astype(float)
    )

    if universo_temas is not None:
        for t in universo_temas:
            if t not in pivot.columns:
                pivot[t] = 0.0
        pivot = pivot[list(universo_temas)]
    return pivot


def binarizar(matriz: pd.DataFrame) -> pd.DataFrame:
    """0/1 segun si el conteo es > 0 (presencia de tema)."""
    return (matriz > 0).astype(int)


def perfil_partido(matriz: pd.DataFrame) -> pd.Series:
    """Suma de conteos por tema, normalizada a proporciones (suma = 1).

    Si la matriz esta vacia o suma cero, devuelve serie de ceros con el mismo indice.
    """
    if matriz.empty:
        return pd.Series(dtype=float)
    total = matriz.sum(axis=0)
    s = total.sum()
    if s == 0:
        return total.astype(float)
    return total / s


def filtrar_min_instrumentos(
    matriz: pd.DataFrame,
    minimo: int = MIN_INSTRUMENTOS_DEFAULT,
) -> tuple[pd.DataFrame, list]:
    """Devuelve (matriz_filtrada, ids_excluidos). El minimo se compara con el conteo total por fila."""
    if matriz.empty:
        return matriz, []
    totales = matriz.sum(axis=1)
    excluidos = totales[totales < minimo].index.tolist()
    return matriz.drop(index=excluidos), excluidos
