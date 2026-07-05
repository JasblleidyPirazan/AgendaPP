"""Indices de diversidad, uniformidad y convergencia tematica.

Referencias:
- Shannon (1948), Pielou (1966): H' normalizado por log(S_observada) en [0, 1].
- Jaccard (1912): |A intersect B| / |A union B|.
- Sigelman & Buell (2004): issue convergence score entre perfiles de agenda.
- Pearson: correlacion entre perfiles tematicos agregados (robustez).

Convenciones:
- Conteos siempre como arrays no-negativos. Cero total => H = 0.
- "S observada" = numero de temas con conteo > 0. Si S <= 1, H normalizado = 0.
"""

from __future__ import annotations

from itertools import combinations
from typing import Iterable

import numpy as np


def shannon_norm(counts: Iterable[float]) -> float:
    """Indice de Shannon normalizado (Pielou) sobre la riqueza observada.

    H_norm = -sum(p_i * ln(p_i)) / ln(S_obs), con p_i = c_i / sum(c).
    Devuelve 0.0 si hay 0 o 1 temas con conteo positivo (sin diversidad medible).
    Resultado en [0, 1]: 0 = especializacion total, 1 = uniformidad perfecta.
    """
    arr = np.asarray(list(counts), dtype=float)
    if arr.ndim != 1:
        raise ValueError("counts debe ser unidimensional")
    if (arr < 0).any():
        raise ValueError("counts no admite valores negativos")

    total = arr.sum()
    if total == 0:
        return 0.0

    p = arr[arr > 0] / total
    s_obs = p.size
    if s_obs <= 1:
        return 0.0

    h = -np.sum(p * np.log(p))
    return float(h / np.log(s_obs))


def cv_shannon(h_values: Iterable[float]) -> float:
    """Coeficiente de variacion (sigma/mu) sobre H normalizados de un grupo.

    Operativamente: pasar los H de los concejales de un mismo partido.
    Devuelve NaN si el grupo tiene < 2 elementos o media == 0.
    Umbral usado en AgendaPP: CV <= 0.3 => uniformidad intra-partido (H1a).
    """
    arr = np.asarray(list(h_values), dtype=float)
    if arr.size < 2:
        return float("nan")
    mu = arr.mean()
    if mu == 0:
        return float("nan")
    # ddof=1 (muestral) por convencion en grupos pequenos
    sigma = arr.std(ddof=1)
    return float(sigma / mu)


def jaccard(set_a: Iterable, set_b: Iterable) -> float:
    """Jaccard binario clasico: |A inter B| / |A union B|. Devuelve 1.0 si ambos vacios."""
    a, b = set(set_a), set(set_b)
    union = a | b
    if not union:
        return 1.0
    return len(a & b) / len(union)


def jaccard_pairwise_mean(matrix_binaria: np.ndarray) -> float:
    """Promedio del Jaccard sobre todos los pares de filas de una matriz 0/1.

    Cada fila representa un concejal; cada columna un tema; valor 1 si el
    concejal tiene al menos un instrumento en ese tema.
    Devuelve NaN si hay < 2 filas.
    Umbral usado en AgendaPP: J >= 0.5 => alta convergencia tematica intra-partido.
    """
    m = np.asarray(matrix_binaria, dtype=bool)
    if m.ndim != 2:
        raise ValueError("matrix_binaria debe ser 2D")
    n = m.shape[0]
    if n < 2:
        return float("nan")

    vals = []
    for i, j in combinations(range(n), 2):
        union = np.logical_or(m[i], m[j]).sum()
        if union == 0:
            vals.append(1.0)
            continue
        inter = np.logical_and(m[i], m[j]).sum()
        vals.append(inter / union)
    return float(np.mean(vals))


def convergencia_agendas(perfil_a: Iterable[float], perfil_b: Iterable[float]) -> float:
    """Indice de convergencia de agendas (Sigelman & Buell 2004), escala [0, 1].

    C(A, B) = sum_k min(p_Ak, p_Bk) = 1 - (1/2) * sum_k |p_Ak - p_Bk|

    Espera vectores alineados sobre el mismo universo de categorias (rellenar
    con 0 las ausentes). Renormaliza internamente para protegerse de
    proporciones ya redondeadas; idealmente construir desde conteos crudos.

    Interpretacion literal: C = 0.75 => los dos actores comparten el 75% de su
    agenda. Metrica principal del componente interpartidista; Pearson se
    conserva como prueba de robustez (party_correlation).
    Devuelve NaN si algun perfil suma cero (actor sin instrumentos) — en el
    JSON de salida debe reportarse como null, no como 0.
    """
    a = np.asarray(list(perfil_a), dtype=float)
    b = np.asarray(list(perfil_b), dtype=float)
    if a.shape != b.shape:
        raise ValueError("perfiles deben tener la misma forma")
    if (a < 0).any() or (b < 0).any():
        raise ValueError("perfiles no admiten valores negativos")
    sa, sb = a.sum(), b.sum()
    if sa == 0 or sb == 0:
        return float("nan")
    return float(np.minimum(a / sa, b / sb).sum())


def party_correlation(perfil_a: Iterable[float], perfil_b: Iterable[float]) -> float:
    """Pearson r entre dos perfiles tematicos agregados (vectores de proporciones).

    Espera vectores alineados sobre el mismo universo de temas.
    Devuelve NaN si alguna serie tiene varianza cero.
    Interpretacion: +1 = perfiles iguales, -1 = opuestos, 0 = independientes.
    """
    a = np.asarray(list(perfil_a), dtype=float)
    b = np.asarray(list(perfil_b), dtype=float)
    if a.shape != b.shape:
        raise ValueError("perfiles deben tener la misma forma")
    if a.size < 2:
        return float("nan")
    if a.std() == 0 or b.std() == 0:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])
