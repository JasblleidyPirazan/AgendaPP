# AgendaPP

Análisis de agendas temáticas de concejales municipales para contrastar dos hipótesis:

- **H1 — Uniformidad Partidista**: las agendas las determina el partido.
- **H2 — Autonomía Individual**: las agendas responden a motivaciones individuales.

Métricas: Shannon normalizado, CV de Shannon, Jaccard intra-partido, correlaciones Pearson inter-partido. Ver [`docs/metodologia.md`](docs/metodologia.md).

## Componentes

| Carpeta | Qué hace | Cómo correr |
|---|---|---|
| [`apps-script/`](apps-script/) | Consolida los Sheets municipales y los expone como JSON vía Web App. | `cd apps-script && clasp push && clasp open` (deploy desde la UI). |
| [`analysis/`](analysis/) | Paquete Python `agendapp` con los índices, notebooks de validación y `exports/metrics.json`. | `cd analysis && pip install -e . && pytest && jupyter lab` |
| [`dashboard/`](dashboard/) | Sitio estático (Plotly.js) que consume el endpoint Apps Script + `metrics.json`. | `cd dashboard && python -m http.server -d public 8000` (local) |
| [`docs/`](docs/) | Metodología, glosario y referencias bibliográficas. | — |

## Flujo de datos

```
Google Sheets ──► Apps Script (Web App JSON) ──► Python notebooks ──► metrics.json ──► Netlify (dashboard)
                       │                                                                       ▲
                       └───────────────────── (vistas crudas de auditoría) ────────────────────┘
```

## Setup inicial

```bash
# Python
cd analysis
python -m venv .venv && source .venv/Scripts/activate  # Windows: .venv\Scripts\activate
pip install -e .
pytest                                                  # debe pasar antes de tocar notebooks
jupyter lab

# Apps Script (una vez)
npm install -g @google/clasp
clasp login
cd ../apps-script
# Editar src/Config.gs con los fileId de los Sheets municipales
clasp create --type webapp --title "AgendaPP Consolidador"
clasp push

# Dashboard (local)
cd ../dashboard
# copiar metrics.json desde analysis/exports al servir local
mkdir -p public/data && cp ../analysis/exports/metrics.json public/data/
python -m http.server -d public 8000
```

## Estado actual

Esqueleto inicial. Ver el plan completo en `C:\Users\Jazz\.claude\plans\necesito-estructurar-el-sigueinte-fuzzy-sprout.md`.
