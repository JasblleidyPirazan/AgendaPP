"""Validaciones del perfil tematico por concejal (campo `conteos`).

Cubre las reglas de la especificacion (Especificacion_Perfil_Concejal, seccion 4):
  V1  suma de conteos == n_instrumentos
  V2  shannon_norm reproducible desde los conteos (normalizacion por riqueza
      observada: H / ln(S_obs), la usada por agendapp.indices.shannon_norm)
  V3  la suma de conteos de los concejales de un partido reproduce su
      perfil_tematico tras normalizar
  V4  toda categoria de un conteos existe en universo_temas
  V5  el cambio es aditivo: conteos son enteros crudos, no proporciones
"""

from __future__ import annotations

import math
import sys
import types
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_metrics import construir_metrics  # noqa: E402


def _fila(ident, tema, cid, partido, rol="Proponente"):
    return {
        "Codigo DANE": "05318", "municipio_origen": "GUARNE",
        "Identificador": ident, "id_instrumento": f"05318-{ident}",
        "Tematica": tema, "Sector": tema, "Rol": rol, "ID_Concejal": cid,
        "Partido / Movimiento": partido, "Incluir en analisis": "Si", "Anio": 2022,
    }


@pytest.fixture
def metrics():
    filas = [
        # C1 (generalista): 3 temas distintos + coautoria con C2
        _fila("a1", "Salud", "C1", "PARTIDO X"),
        _fila("a2", "Educacion", "C1", "PARTIDO X"),
        _fila("a3", "Cultura", "C1", "PARTIDO X"),
        _fila("co1", "Salud", "C1", "PARTIDO X"),
        _fila("co1", "Salud", "C2", "PARTIDO X"),  # mismo instrumento, otro autor
        # C2 (especialista): todo en Salud
        _fila("b1", "Salud", "C2", "PARTIDO X"),
        _fila("b2", "Salud", "C2", "PARTIDO X"),
        # C3, otro partido
        _fila("c1", "Movilidad", "C3", "PARTIDO Y"),
        _fila("c2", "Cultura", "C3", "PARTIDO Y"),
    ]
    args = types.SimpleNamespace(
        rol="Proponente,Ponente,Coordinador", tema="Tematica",
        municipios="", clasificacion="", min_instrumentos=1,
    )
    return construir_metrics(pd.DataFrame(filas), {}, args)


def test_v1_suma_conteos_igual_n_instrumentos(metrics):
    for c in metrics["concejales"]:
        assert sum(c["conteos"].values()) == c["n_instrumentos"], c["id"]


def test_v2_shannon_reproducible_desde_conteos(metrics):
    for c in metrics["concejales"]:
        cnt = c["conteos"]
        n = sum(cnt.values())
        s_obs = sum(1 for v in cnt.values() if v > 0)
        if n == 0 or s_obs <= 1:
            esperado = 0.0
        else:
            h = -sum((v / n) * math.log(v / n) for v in cnt.values() if v > 0)
            esperado = h / math.log(s_obs)
        assert abs(c["shannon_norm"] - esperado) <= 0.001, c["id"]


def test_v3_agregacion_reproduce_perfil_partido(metrics):
    for p in metrics["partidos"]:
        suma = {}
        for c in metrics["concejales"]:
            if c["partido"] != p["nombre"]:
                continue
            for t, v in c["conteos"].items():
                suma[t] = suma.get(t, 0) + v
        total = sum(suma.values())
        assert total > 0, p["nombre"]
        for t, prop in p["perfil_tematico"].items():
            assert abs(suma.get(t, 0) / total - prop) <= 0.001, (p["nombre"], t)


def test_v4_categorias_dentro_del_universo(metrics):
    universo = set(metrics["universo_temas"])
    for c in metrics["concejales"]:
        assert set(c["conteos"]) <= universo, c["id"]


def test_v5_conteos_enteros_y_dispersos(metrics):
    for c in metrics["concejales"]:
        for t, v in c["conteos"].items():
            assert isinstance(v, int) and v >= 1, (c["id"], t, v)


def test_coautoria_aporta_uno_a_cada_autor(metrics):
    por_id = {c["id"]: c for c in metrics["concejales"]}
    c1, c2 = por_id["C1"], por_id["C2"]
    # co1 es coautoria C1+C2 en Salud: cuenta para ambos
    assert c1["conteos"]["Salud"] == 2   # a1 + co1
    assert c2["conteos"]["Salud"] == 3   # b1 + b2 + co1
    assert c1["n_instrumentos"] == 4
    assert c2["n_instrumentos"] == 3


def test_version_esquema(metrics):
    assert metrics["parametros"]["version_esquema"] == "2.1"
