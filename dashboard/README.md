# `dashboard/` — Sitio estático

HTML + JS vanilla + Plotly.js vía CDN. Sin build step; Netlify solo copia `metrics.json` y publica `public/`.

## Local

```bash
# Asegurar que metrics.json esté disponible
cp ../analysis/exports/metrics.json public/data/metrics.json

# Servir con cualquier server estático
python -m http.server -d public 8000
# o:  npx serve public
```

Abrir http://localhost:8000

## Conectar al endpoint Apps Script

Editar `public/config.json`:

```json
{ "appsScriptUrl": "https://script.google.com/macros/s/.../exec" }
```

Si está vacío, la pestaña "Auditoría" muestra un placeholder; las otras vistas funcionan con `metrics.json` solamente.

## Deploy en Netlify

1. Conectar el repo a Netlify (GitHub OAuth).
2. Base directory: `dashboard`. Publish: `dashboard/public`. Command: (definido en `netlify.toml`, copia `metrics.json`).
3. Cada push a `main` redespliega.

## Vistas

| Vista | Fuente | Qué muestra |
|---|---|---|
| Resumen | `metrics.json` (+ raw si hay) | Veredicto preliminar, tarjetas y parámetros. |
| Diversidad indiv. (H) | `metrics.json` | Histograma de Shannon individual + tabla por concejal (con municipio). |
| Diversidad partido (H) | `metrics.json` | Barras de Shannon del bloque por partido (0 = focalizada, 1 = amplia). |
| Convergencia (J) | `metrics.json` | Barras de Jaccard intra-partido con umbral 0.5. |
| Inter-partido | `metrics.json` | Heatmap de convergencia de agendas (Sigelman & Buell 2004) + Pearson como robustez. |
| Auditoría | endpoint Apps Script | Validaciones + últimos instrumentos crudos. |

**Filtros en vivo** (requieren el endpoint Apps Script): la barra bajo la navegación permite filtrar todas las métricas por **rol** (Proponente, Ponente, Coordinador, …) y por **municipio**; al cambiar un chip, las métricas se recalculan en el navegador.

## Estructura

```
dashboard/
├── netlify.toml
├── README.md
└── public/                ← Netlify publica esta carpeta
    ├── index.html
    ├── styles.css
    ├── config.json
    ├── data/
    │   └── metrics.json   ← copiado por build_metrics.py o por Netlify
    └── src/
        ├── app.js
        └── views/
            ├── resumen.js
            ├── shannon.js
            ├── cv.js
            ├── jaccard.js
            ├── correlaciones.js
            └── auditoria.js
```
