/**
 * Web App: expone la consolidacion como JSON (o JSONP).
 *
 * Parametros:
 *   ?recurso=todo|instrumentos|concejales|partidos|municipios|validaciones (default: todo)
 *   ?token=... (si TOKEN_REQUERIDO != '')
 *   ?nocache=1 (fuerza re-lectura)
 *   ?callback=fn  -> respuesta JSONP: fn({...}). Permite que un sitio estatico
 *                    en otro dominio (Netlify) consuma la data sin toparse con
 *                    el bloqueo CORS del fetch cross-origin de Apps Script.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = sanitizarCallback_(params.callback);
  try {
    return responder_(doGetInner_(e), callback);
  } catch (err) {
    return responder_({ error: String((err && err.message) || err), stack: err && err.stack }, callback);
  }
}

function doGetInner_(e) {
  const params = (e && e.parameter) || {};

  if (TOKEN_REQUERIDO && params.token !== TOKEN_REQUERIDO) {
    return { error: 'Token invalido o ausente' };
  }

  const recurso = (params.recurso || 'todo').toLowerCase();
  const usarCache = params.nocache !== '1';

  const data = obtenerConCache_(usarCache);

  switch (recurso) {
    case 'instrumentos':
      return { generadoEn: data.generadoEn, instrumentos: data.instrumentos };
    case 'concejales':
      return { generadoEn: data.generadoEn, concejales: data.concejales };
    case 'partidos':
      return { generadoEn: data.generadoEn, partidos: data.partidos };
    case 'municipios':
      return { generadoEn: data.generadoEn, municipios: data.municipios };
    case 'validaciones':
      return { generadoEn: data.generadoEn, validaciones: data.validaciones };
    case 'todo':
    default:
      return data;
  }
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

// Solo se aceptan nombres de callback que sean identificadores JS seguros,
// para no inyectar codigo arbitrario en la respuesta JSONP.
function sanitizarCallback_(cb) {
  if (!cb) return '';
  return /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(cb) ? cb : '';
}

// Devuelve JSON normal, o JSONP (fn(...)) si vino un callback valido.
function responder_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
