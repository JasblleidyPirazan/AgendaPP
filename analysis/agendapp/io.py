"""Carga de datos: endpoint Apps Script, JSON local, o Excel directo (fallback offline)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import requests


def fetch_endpoint(url: str, recurso: str = "todo", timeout: int = 30) -> dict[str, Any]:
    """GET al Web App de Apps Script. `recurso` ∈ {todo, instrumentos, concejales}."""
    r = requests.get(url, params={"recurso": recurso}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def load_local_json(path: str | Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_xlsx_municipio(path: str | Path) -> dict[str, pd.DataFrame]:
    """Carga directa desde un Excel de la plantilla AgendaPP (fallback sin Apps Script).

    Devuelve dict con DataFrames: instrumentos, concejales, partidos, municipio.
    Asume la estructura observada en Guarne_DILIGENCIADO.xlsx (headers en fila 3
    para hojas Maestro y Listas; fila 1 para Instrumentos).
    """
    path = Path(path)
    instrumentos = pd.read_excel(path, sheet_name="Instrumentos", header=0)
    concejales = pd.read_excel(path, sheet_name="MaestroConcejales", header=2)
    partidos = pd.read_excel(path, sheet_name="MaestroPartidos", header=2)
    municipio_raw = pd.read_excel(path, sheet_name="DatosMunicipio", header=2)
    municipio = dict(zip(municipio_raw["Campo"].dropna(), municipio_raw["Valor"]))

    # Limpieza minima
    for df in (instrumentos, concejales, partidos):
        df.columns = [str(c).strip() for c in df.columns]
    instrumentos = instrumentos.dropna(subset=["Identificador"], how="all")
    concejales = concejales.dropna(subset=["ID_Concejal"])

    return {
        "instrumentos": instrumentos,
        "concejales": concejales,
        "partidos": partidos,
        "municipio": municipio,
    }
