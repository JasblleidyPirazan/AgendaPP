"""Tests del paquete agendapp.indices."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from agendapp.indices import (
    cv_shannon,
    jaccard,
    jaccard_pairwise_mean,
    party_correlation,
    shannon_norm,
)
from agendapp.transform import (
    binarizar,
    filtrar_min_instrumentos,
    matriz_concejal_tema,
    perfil_partido,
)


# ---------- Shannon ----------

class TestShannon:
    def test_uniforme_da_uno(self):
        assert shannon_norm([1, 1, 1, 1]) == pytest.approx(1.0)

    def test_un_solo_tema_da_cero(self):
        assert shannon_norm([10, 0, 0, 0]) == 0.0

    def test_todo_cero_da_cero(self):
        assert shannon_norm([0, 0, 0]) == 0.0

    def test_vacio_da_cero(self):
        assert shannon_norm([]) == 0.0

    def test_dos_temas_iguales(self):
        # H normalizado por log(2) = log(2)/log(2) = 1
        assert shannon_norm([5, 5]) == pytest.approx(1.0)

    def test_sensible_a_concentracion(self):
        # 80% en un tema, 20% repartido -> menor que uniforme
        h_concentrado = shannon_norm([80, 10, 10])
        h_uniforme = shannon_norm([1, 1, 1])
        assert h_concentrado < h_uniforme
        assert 0 < h_concentrado < 1

    def test_rechaza_negativos(self):
        with pytest.raises(ValueError):
            shannon_norm([1, -1, 2])

    def test_invariante_a_escala(self):
        assert shannon_norm([1, 2, 3]) == pytest.approx(shannon_norm([10, 20, 30]))


# ---------- CV ----------

class TestCV:
    def test_grupo_homogeneo_cv_bajo(self):
        # H todos iguales -> sigma=0 -> CV=0
        assert cv_shannon([0.5, 0.5, 0.5, 0.5]) == 0.0

    def test_grupo_dispersado_cv_alto(self):
        assert cv_shannon([0.1, 0.9, 0.2, 0.8]) > 0.3

    def test_menos_de_dos_da_nan(self):
        assert math.isnan(cv_shannon([0.5]))
        assert math.isnan(cv_shannon([]))

    def test_media_cero_da_nan(self):
        assert math.isnan(cv_shannon([0.0, 0.0, 0.0]))


# ---------- Jaccard ----------

class TestJaccard:
    def test_identicos(self):
        assert jaccard({"a", "b", "c"}, {"a", "b", "c"}) == 1.0

    def test_disjuntos(self):
        assert jaccard({"a"}, {"b"}) == 0.0

    def test_vacios_da_uno(self):
        # Convencion: ausencia total = "iguales en ausencia"
        assert jaccard([], []) == 1.0

    def test_parcial(self):
        # {a,b} vs {b,c}: inter=1, union=3 -> 1/3
        assert jaccard({"a", "b"}, {"b", "c"}) == pytest.approx(1 / 3)


class TestJaccardPairwise:
    def test_filas_identicas(self):
        m = np.array([[1, 1, 0], [1, 1, 0], [1, 1, 0]])
        assert jaccard_pairwise_mean(m) == pytest.approx(1.0)

    def test_filas_disjuntas(self):
        m = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]])
        assert jaccard_pairwise_mean(m) == pytest.approx(0.0)

    def test_una_fila_da_nan(self):
        assert math.isnan(jaccard_pairwise_mean(np.array([[1, 0, 1]])))

    def test_filas_todo_cero(self):
        m = np.array([[0, 0, 0], [0, 0, 0]])
        assert jaccard_pairwise_mean(m) == pytest.approx(1.0)

    def test_mezcla(self):
        # filas 1,2 idénticas (J=1); fila 3 disjunta de ambas (J=0,0)
        # promedio = (1 + 0 + 0) / 3
        m = np.array([[1, 1, 0, 0], [1, 1, 0, 0], [0, 0, 1, 1]])
        assert jaccard_pairwise_mean(m) == pytest.approx(1 / 3)


# ---------- Pearson ----------

class TestPearson:
    def test_identicos(self):
        v = [0.1, 0.2, 0.3, 0.4]
        assert party_correlation(v, v) == pytest.approx(1.0)

    def test_opuestos(self):
        a = [1, 2, 3, 4]
        b = [4, 3, 2, 1]
        assert party_correlation(a, b) == pytest.approx(-1.0)

    def test_varianza_cero_da_nan(self):
        assert math.isnan(party_correlation([1, 1, 1], [1, 2, 3]))

    def test_formas_distintas_levanta(self):
        with pytest.raises(ValueError):
            party_correlation([1, 2], [1, 2, 3])


# ---------- transform ----------

class TestMatriz:
    @pytest.fixture
    def df_ejemplo(self):
        return pd.DataFrame({
            "ID_Concejal": ["A", "A", "B", "B", "B", "C"],
            "Tematica": ["Cultura", "Salud", "Cultura", "Cultura", "Educacion", "Salud"],
            "Rol": ["Proponente"] * 6,
            "Incluir en analisis": ["Si"] * 6,
        })

    def test_pivote_basico(self, df_ejemplo):
        m = matriz_concejal_tema(df_ejemplo)
        assert m.loc["A", "Cultura"] == 1
        assert m.loc["B", "Cultura"] == 2
        assert m.loc["B", "Educacion"] == 1
        assert m.loc["C", "Salud"] == 1

    def test_filtro_rol(self, df_ejemplo):
        df_ejemplo.loc[0, "Rol"] = "Ponente"
        m = matriz_concejal_tema(df_ejemplo, roles=("Proponente",))
        # La fila A-Cultura era Ponente -> queda solo A-Salud
        assert m.loc["A", "Cultura"] == 0
        assert m.loc["A", "Salud"] == 1

    def test_filtro_incluir(self, df_ejemplo):
        df_ejemplo.loc[0, "Incluir en analisis"] = "No"
        m = matriz_concejal_tema(df_ejemplo)
        assert m.loc["A", "Cultura"] == 0

    def test_universo_temas_completa_columnas(self, df_ejemplo):
        m = matriz_concejal_tema(df_ejemplo, universo_temas=["Cultura", "Salud", "Ambiente"])
        assert list(m.columns) == ["Cultura", "Salud", "Ambiente"]
        assert (m["Ambiente"] == 0).all()

    def test_binarizar(self, df_ejemplo):
        m = matriz_concejal_tema(df_ejemplo)
        b = binarizar(m)
        assert b.loc["B", "Cultura"] == 1  # antes era 2
        assert set(b.values.flatten()) <= {0, 1}

    def test_perfil_partido_suma_uno(self, df_ejemplo):
        m = matriz_concejal_tema(df_ejemplo)
        p = perfil_partido(m)
        assert p.sum() == pytest.approx(1.0)

    def test_filtrar_min_instrumentos(self, df_ejemplo):
        m = matriz_concejal_tema(df_ejemplo)
        filtrada, excluidos = filtrar_min_instrumentos(m, minimo=2)
        # A tiene 2, B tiene 3, C tiene 1
        assert "C" in excluidos
        assert "A" not in excluidos
        assert "B" not in excluidos
