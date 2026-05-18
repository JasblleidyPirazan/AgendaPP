# Apps Script — Consolidador AgendaPP

Lee N libros Sheets con la plantilla AgendaPP (idéntica en todos los municipios) y los expone como JSON vía Web App.

## Setup (una vez)

```bash
npm install -g @google/clasp
clasp login
cd apps-script
clasp create --type standalone --title "AgendaPP Consolidador"
# se crea .clasp.json con el scriptId (gitignored)
clasp push
clasp open  # abre el editor web para hacer el primer Deploy
```

## Configurar fuentes

Editar `src/Config.gs`:

```js
const SHEETS_FUENTE = [
  { municipio: 'GUARNE',    dane: '05318', fileId: '1abc...XYZ' },
  { municipio: 'MEDELLIN',  dane: '05001', fileId: '1def...UVW' },
  // ...
];
```

El `fileId` se saca de la URL del Sheet: `https://docs.google.com/spreadsheets/d/<FILE_ID>/edit`.

> Los `.xlsx` locales **deben subirse a Google Drive como Sheets** (no como archivos Excel) para que `SpreadsheetApp.openById` funcione.

## Deploy del Web App

En el editor de Apps Script (abierto con `clasp open`):

1. *Deploy → New deployment*
2. *Select type → Web app*
3. *Execute as: Me* · *Who has access: Anyone* (o "Anyone with the link")
4. Copiar la URL `https://script.google.com/macros/s/.../exec`

Esa URL va en `dashboard/public/config.json` y se pasa al notebook 01.

## Endpoints

| Query | Devuelve |
|---|---|
| `?recurso=todo` (default) | objeto completo: `municipios`, `concejales`, `partidos`, `instrumentos`, `validaciones` |
| `?recurso=instrumentos` | solo instrumentos |
| `?recurso=concejales` | solo concejales |
| `?recurso=partidos` | solo partidos |
| `?recurso=validaciones` | solo warnings/errores |
| `?nocache=1` | fuerza re-lectura (sin cache de 5 min) |

## Funciones útiles desde el editor

- `debugConsolidar()` — corre `consolidar()` y reporta tamaños en log.
- `reporteValidaciones()` — imprime todas las advertencias y errores detectados.

## Seguridad

- `TOKEN_REQUERIDO` en `Config.gs` (vacío por defecto = público). Para hacerlo privado, ponerlo en `PropertiesService` y validarlo en `doGet`.
- Los datos de instrumentos de concejos suelen ser públicos; **confirmar política antes de exponer**.
