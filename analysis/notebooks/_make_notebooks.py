"""Genera los 5 notebooks .ipynb iniciales. Idempotente. Sobrescribe.

Uso:
    python _make_notebooks.py

Los notebooks quedan vacíos de outputs; se ejecutan en JupyterLab.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent


def nb(cells):
    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.splitlines(keepends=True)}


def code(text):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": text.splitlines(keepends=True)}


COMMON_HEADER = """\
# Cargar datos: cambia URL o XLSX segun corresponda
from pathlib import Path
import pandas as pd, numpy as np
from agendapp.io import fetch_endpoint, load_xlsx_municipio
from agendapp.transform import matriz_concejal_tema, binarizar, perfil_partido, filtrar_min_instrumentos
from agendapp.indices import shannon_norm, cv_shannon, jaccard_pairwise_mean, party_correlation
from agendapp import viz

# Opcion A: endpoint Apps Script (descomentar y poner URL real)
# URL = "https://script.google.com/macros/s/AKfycb.../exec"
# data = fetch_endpoint(URL)
# df_inst = pd.DataFrame(data["instrumentos"])

# Opcion B: xlsx local (piloto Guarne)
XLSX = Path("../..") / "Guarne_DILIGENCIADO.xlsx"
d = load_xlsx_municipio(XLSX)
df_inst = d["instrumentos"]
df_inst["Partido / Movimiento"] = df_inst["Partido / Movimiento"].astype(str).str.strip().str.upper()
df_inst.shape
"""

NB_DEFINITIONS = {
    "01_validacion_datos.ipynb": [
        md("# 01 — Validación de datos\n\n"
           "Revisa calidad antes de calcular nada: nulos, partidos no maestrados, "
           "IDs huérfanos, temas vacíos. **Sin esto los índices están sesgados.**\n"),
        code(COMMON_HEADER),
        md("## Conteo de filas por estado de inclusión\n"),
        code("df_inst['Incluir en analisis'].value_counts(dropna=False)\n"),
        md("## Nulos en columnas clave\n"),
        code("cols_clave = ['Identificador','Anio','Rol','ID_Concejal','Partido / Movimiento','Sector','Tematica','Incluir en analisis']\n"
             "df_inst[cols_clave].isna().mean().sort_values(ascending=False)\n"),
        md("## Filas Incluir=Si sin Tematica\n"),
        code("mask = df_inst['Incluir en analisis'].astype(str).str.lower().eq('si') & df_inst['Tematica'].isna()\n"
             "df_inst[mask][['Identificador','Titulo','Rol','ID_Concejal']].head(20)\n"),
        md("## Partidos presentes (revisar si hay duplicados por tildes/mayúsculas)\n"),
        code("df_inst['Partido / Movimiento'].value_counts().head(30)\n"),
        md("## Conteo de instrumentos por concejal (detecta huérfanos y bajo volumen)\n"),
        code("conteo = df_inst[df_inst['Rol'].eq('Proponente')]['ID_Concejal'].value_counts()\n"
             "print('Concejales con < 3 instrumentos como Proponente:')\n"
             "conteo[conteo < 3]\n"),
    ],
    "02_shannon_individual.ipynb": [
        md("# 02 — Diversidad temática individual (Shannon normalizado)\n\n"
           "H ∈ [0, 1]: 0 = concejal muy especializado, 1 = generalista perfecto, 0.5 = moderado.\n"),
        code(COMMON_HEADER),
        code("M = matriz_concejal_tema(df_inst, col_tema='Tematica', roles=('Proponente',))\n"
             "h = M.apply(shannon_norm, axis=1).rename('H')\n"
             "h.describe()\n"),
        md("## Histograma\n"),
        code("viz.histograma_shannon(h)\n"),
        md("## Top especializados y generalistas\n"),
        code("pd.concat([\n"
             "    h.sort_values().head(10).rename('Más especializados'),\n"
             "    h.sort_values(ascending=False).head(10).rename('Más generalistas'),\n"
             "], axis=1)\n"),
    ],
    "03_cv_intrapartidista.ipynb": [
        md("# 03 — CV de Shannon intra-partido\n\n"
           "Umbral AgendaPP: **CV ≤ 0.3 → uniformidad (H1a)**, **CV > 0.3 → autonomía individual (H2a)**.\n"),
        code(COMMON_HEADER),
        code("M = matriz_concejal_tema(df_inst, col_tema='Tematica', roles=('Proponente',))\n"
             "h = M.apply(shannon_norm, axis=1)\n"
             "asign = (df_inst[df_inst['Rol'].eq('Proponente')]\n"
             "    .groupby('ID_Concejal')['Partido / Movimiento']\n"
             "    .agg(lambda s: s.value_counts().idxmax()))\n"
             "tabla = pd.DataFrame({'H': h, 'partido': asign})\n"
             "cv = tabla.groupby('partido')['H'].apply(lambda x: cv_shannon(x.values))\n"
             "cv.dropna()\n"),
        md("## Barras (verde = uniformidad H1a)\n"),
        code("viz.barras_cv_por_partido(cv.dropna())\n"),
    ],
    "04_jaccard_partido.ipynb": [
        md("# 04 — Jaccard intra-partido\n\n"
           "Umbral: **J ≥ 0.5 → alta convergencia temática**, **J < 0.5 → baja convergencia**.\n"),
        code(COMMON_HEADER),
        code("M = matriz_concejal_tema(df_inst, col_tema='Tematica', roles=('Proponente',))\n"
             "asign = (df_inst[df_inst['Rol'].eq('Proponente')]\n"
             "    .groupby('ID_Concejal')['Partido / Movimiento']\n"
             "    .agg(lambda s: s.value_counts().idxmax()))\n"
             "filas = []\n"
             "for partido, cids in asign.groupby(asign).groups.items():\n"
             "    sub = M.loc[[c for c in cids if c in M.index]]\n"
             "    if sub.shape[0] < 2: continue\n"
             "    j = jaccard_pairwise_mean(binarizar(sub).values)\n"
             "    filas.append({'partido': partido, 'n': sub.shape[0], 'jaccard': j})\n"
             "j_df = pd.DataFrame(filas).set_index('partido')\n"
             "j_df.sort_values('jaccard', ascending=False)\n"),
        code("viz.barras_jaccard_por_partido(j_df['jaccard'])\n"),
    ],
    "05_correlaciones_inter.ipynb": [
        md("# 05 — Correlaciones inter-partido (Pearson)\n\n"
           "Heatmap de similitud entre perfiles temáticos agregados de cada partido.\n"),
        code(COMMON_HEADER),
        code("M = matriz_concejal_tema(df_inst, col_tema='Tematica', roles=('Proponente',))\n"
             "asign = (df_inst[df_inst['Rol'].eq('Proponente')]\n"
             "    .groupby('ID_Concejal')['Partido / Movimiento']\n"
             "    .agg(lambda s: s.value_counts().idxmax()))\n"
             "universo = M.columns.tolist()\n"
             "perfiles = {}\n"
             "for partido, cids in asign.groupby(asign).groups.items():\n"
             "    sub = M.loc[[c for c in cids if c in M.index]]\n"
             "    if sub.empty: continue\n"
             "    perfiles[partido] = perfil_partido(sub).reindex(universo).fillna(0)\n"
             "df_perfiles = pd.DataFrame(perfiles)\n"
             "corr = df_perfiles.corr()\n"
             "corr\n"),
        code("viz.heatmap_correlaciones(corr)\n"),
    ],
}


def main():
    for filename, cells in NB_DEFINITIONS.items():
        path = HERE / filename
        path.write_text(json.dumps(nb(cells), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"escrito: {path.name}")


if __name__ == "__main__":
    main()
