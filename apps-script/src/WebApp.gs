/**
 * Web App: expone la consolidacion como JSON.
 *
 * Parametros:
 *   ?recurso=todo|instrumentos|concejales|partidos|municipios|validaciones (default: todo)
 *   ?token=... (si TOKEN_REQUERIDO != '')
 *   ?nocache=1 (fuerza re-lectura)
 */
function doGet(e) {
  try {
    return doGetInner_(e);
  } catch (err) {
    return jsonResponse_({ error: String(err && err.message || err), stack: err && err.stack });
  }
}

function doGetInner_(e) {
  const params = (e && e.parameter) || {};

  if (TOKEN_REQUERIDO && params.token !== TOKEN_REQUERIDO) {
    return jsonResponse_({ error: 'Token invalido o ausente' }, 401);
  }

  const recurso = (params.recurso || 'todo').toLowerCase();
  const usarCache = params.nocache !== '1';

  const data = obtenerConCache_(usarCache);

  let payload;
  switch (recurso) {
    case 'instrumentos':
      payload = { generadoEn: data.generadoEn, instrumentos: data.instrumentos };
      break;
    case 'concejales':
      payload = { generadoEn: data.generadoEn, concejales: data.concejales };
      break;
    case 'partidos':
      payload = { generadoEn: data.generadoEn, partidos: data.partidos };
      break;
    case 'municipios':
      payload = { generadoEn: data.generadoEn, municipios: data.municipios };
      break;
    case 'validaciones':
      payload = { generadoEn: data.generadoEn, validaciones: data.validaciones };
      break;
    case 'todo':
    default:
      payload = data;
  }

  return jsonResponse_(payload);
}

function obtenerConCache_(usarCache) {
  const cache = CacheService.getScriptCache();
  if (usarCache) {
    const cached = cache.get('consolidado');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* cae a recomputar */ }
    }
  }
  const data = consolidar();
  try {
    cache.put('consolidado', JSON.stringify(data), CACHE_SECONDS);
  } catch (e) {
    // Si excede 100KB el cache no se guarda; OK, igualmente devolvemos.
  }
  return data;
}

function jsonResponse_(obj, _status) {
  // ContentService de Apps Script no soporta codigos de estado custom,
  // pero el campo 'error' lo deja claro al consumidor.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
