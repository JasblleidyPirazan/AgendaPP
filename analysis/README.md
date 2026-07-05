# `analysis/` — Pipeline de cálculo y visualización

## Setup

```bash
cd analysis
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate      # Linux/macOS
pip install -e ".[dev]"
pytest                          # 32 tests deben pasar
```

## Estructura

| Ruta | Qué es |
|---|---|
| `agendapp/indices.py` | Funciones puras: `shannon_norm`, `cv_shannon`, `jaccard_pairwise_mean`, `party_correlation`. |
| `agendapp/transform.py` | `matriz_concejal_tema`, `binarizar`, `perfil_partido`, `filtrar_min_instrumentos`. |
| `agendapp/io.py` | `fetch_endpoint` (Apps Script), `load_xlsx_municipio` (fallback offline). |
| `agendapp/viz.py` | Helpers Plotly reutilizables (histograma, barras, heatmaps). |
| `tests/` | Pytest. Cubre casos límite de cada índice y de `transform`. |
| `notebooks/01..05_*.ipynb` | Exploración + validación + visualizaciones. Generables con `python notebooks/_make_notebooks.py`. |
| `build_metrics.py` | Pipeline end-to-end. Produce `exports/metrics.json` para el dashboard. |
| `exports/metrics.json` | **Output canónico.** Se commitea (rebuildea Netlify). |

## Correr el pipeline

```bash
# Modo Apps Script (producción)
python build_metrics.py --url "https://script.google.com/macros/s/.../exec"

# Modo xlsx local (desarrollo / piloto)
python build_metrics.py --xlsx ../Guarne_DILIGENCIADO.xlsx

# Parámetros opcionales
python build_metrics.py --xlsx ../Guarne_DILIGENCIADO.xlsx \
  --rol "Proponente,Ponente,Coordinador" \
  --tema Sector \
  --municipios "LA CEJA,GUARNE" \
  --min-instrumentos 5
```

Después de cada corrida, copiar el output al dashboard (Netlify lo hace en su build):

```bash
cp exports/metrics.json ../dashboard/public/data/metrics.json
```

## Notebooks

Convención: numerados, leen el mismo `XLSX` o `URL`, comparten el header común. Sirven dos propósitos:

1. **Validar datos antes de calcular** (notebook 01).
2. **Visualizar cada cálculo** (02–05) para ajustar la metodología y entender los resultados.

Regenerar los notebooks desde cero (sobrescribe):

```bash
python notebooks/_make_notebooks.py
```

## Tests

```bash
pytest -v                       # verboso
pytest -k shannon               # solo tests de Shannon
```

Los tests cubren:
- Shannon: uniforme→1, único tema→0, vacío→0, sensibilidad a concentración, invariancia a escala, rechazo de negativos.
- CV: grupo homogéneo, dispersado, casos NaN.
- Jaccard: idénticos→1, disjuntos→0, vacíos→1, mezcla.
- Convergencia (Sigelman & Buell 2004): idénticos→1, disjuntos→0, caso intermedio, simetría, perfil vacío→NaN, renormalización, equivalencia con la forma de diferencias.
- Pearson (robustez): idénticos→1, opuestos→-1, varianza cero→NaN, formas incompatibles→ValueError.
- `transform`: pivote, filtros de rol/incluir, universo de temas, binarización, perfil, mínimo de instrumentos.
