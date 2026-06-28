"""Helpers de visualizacion Plotly reutilizables en notebooks y reportes."""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go


def histograma_shannon(h_por_concejal: pd.Series, titulo: str = "Diversidad temática (Shannon normalizado)") -> go.Figure:
    fig = go.Figure(go.Histogram(x=h_por_concejal.dropna(), nbinsx=20))
    fig.update_layout(
        title=titulo,
        xaxis_title="H normalizado (0 = especializado, 1 = generalista)",
        yaxis_title="Concejales",
        bargap=0.05,
    )
    fig.add_vline(x=0.5, line_dash="dash", line_color="gray", annotation_text="0.5")
    return fig


def barras_cv_por_partido(cv_serie: pd.Series, umbral: float = 0.3) -> go.Figure:
    ordenadas = cv_serie.sort_values()
    colors = ["#2ca02c" if v <= umbral else "#d62728" for v in ordenadas.values]
    fig = go.Figure(go.Bar(x=ordenadas.values, y=ordenadas.index, orientation="h", marker_color=colors))
    fig.add_vline(x=umbral, line_dash="dash", line_color="black", annotation_text=f"CV={umbral}")
    fig.update_layout(
        title="Coeficiente de Variación de Shannon por partido (verde: uniformidad H1a)",
        xaxis_title="CV (σ/μ)",
        yaxis_title="Partido",
        height=max(300, 30 * len(ordenadas)),
    )
    return fig


def barras_shannon_por_partido(h_serie: pd.Series) -> go.Figure:
    """Shannon del bloque por partido: diversidad de la agenda agregada (0=focalizada, 1=amplia)."""
    ordenadas = h_serie.sort_values(ascending=False)
    fig = go.Figure(go.Bar(x=ordenadas.values, y=ordenadas.index, orientation="h", marker_color="#3b3bb3"))
    fig.update_layout(
        title="Shannon del bloque por partido (0 = agenda focalizada, 1 = amplia)",
        xaxis_title="H normalizado del perfil agregado",
        yaxis_title="Partido",
        height=max(300, 30 * len(ordenadas)),
    )
    return fig


def barras_jaccard_por_partido(j_serie: pd.Series, umbral: float = 0.5) -> go.Figure:
    ordenadas = j_serie.sort_values(ascending=False)
    colors = ["#2ca02c" if v >= umbral else "#d62728" for v in ordenadas.values]
    fig = go.Figure(go.Bar(x=ordenadas.values, y=ordenadas.index, orientation="h", marker_color=colors))
    fig.add_vline(x=umbral, line_dash="dash", line_color="black", annotation_text=f"J={umbral}")
    fig.update_layout(
        title="Jaccard promedio intra-partido (verde: alta convergencia)",
        xaxis_title="Jaccard pareado promedio",
        yaxis_title="Partido",
        height=max(300, 30 * len(ordenadas)),
    )
    return fig


def heatmap_correlaciones(matriz_corr: pd.DataFrame, titulo: str = "Correlaciones inter-partido (Pearson)") -> go.Figure:
    fig = go.Figure(
        go.Heatmap(
            z=matriz_corr.values,
            x=matriz_corr.columns,
            y=matriz_corr.index,
            zmin=-1, zmax=1,
            colorscale="RdBu_r",
            text=np.round(matriz_corr.values, 2),
            texttemplate="%{text}",
        )
    )
    fig.update_layout(title=titulo, height=600)
    return fig


def heatmap_jaccard_intra(matriz_pareada: pd.DataFrame, titulo: str = "Jaccard pareado intra-partido") -> go.Figure:
    fig = go.Figure(
        go.Heatmap(
            z=matriz_pareada.values,
            x=matriz_pareada.columns,
            y=matriz_pareada.index,
            zmin=0, zmax=1,
            colorscale="Viridis",
        )
    )
    fig.update_layout(title=titulo)
    return fig
