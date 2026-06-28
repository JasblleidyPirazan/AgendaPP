/**
 * Consolida las hojas Instrumentos, MaestroConcejales, MaestroPartidos y
 * DatosMunicipio de N libros Excel/Sheets que comparten la plantilla AgendaPP.
 *
 * Salida: { generadoEn, municipios, concejales, partidos, instrumentos, validaciones }.
 *
 * Cada coleccion es un array de objetos con claves alineadas a los headers
 * normalizados (trim). Las filas vacias se descartan.
 */
function consolidar() {
  const municipios = [];
  const concejales = [];
  const instrumentos = [];
  const partidos = [];
  const validaciones = [];

  if (!SHEETS_FUENTE || SHEETS_FUENTE.length === 0) {
    throw new Error('Config.gs#SHEETS_FUENTE esta vacio. Agrega al menos un Sheet fuente.');
  }

  // Validacion de configuracion: fileId o DANE repetidos entre fuentes.
  // Un fileId repetido hace que dos municipios lean el MISMO Sheet (doble conteo);
  // un DANE repetido colisiona los id_instrumento. Ambos son errores graves.
  const vistoFile = {};
  const vistoDane = {};
  SHEETS_FUENTE.forEach(function (src) {
    if (vistoFile[src.fileId]) {
      validaciones.push({ nivel: 'error', municipio: src.municipio, mensaje: 'fileId duplicado con ' + vistoFile[src.fileId] + ': leen el mismo Sheet' });
    } else {
      vistoFile[src.fileId] = src.municipio;
    }
    if (vistoDane[src.dane]) {
      validaciones.push({ nivel: 'error', municipio: src.municipio, mensaje: 'DANE ' + src.dane + ' duplicado con ' + vistoDane[src.dane] });
    } else {
      vistoDane[src.dane] = src.municipio;
    }
  });

  SHEETS_FUENTE.forEach(function (src) {
    let ss;
    try {
      ss = SpreadsheetApp.openById(src.fileId);
    } catch (e) {
      validaciones.push({ nivel: 'error', municipio: src.municipio, mensaje: 'No se pudo abrir el Sheet: ' + e.message });
      return;
    }

    const datosMun = leerKeyValue_(ss, HOJAS.MUNICIPIO);
    municipios.push(Object.assign({ municipio: src.municipio, dane: src.dane }, datosMun));

    const concejalesMun = leerTabla_(ss, HOJAS.CONCEJALES).filter(function (r) { return r.ID_Concejal; });
    concejalesMun.forEach(function (c) {
      c.municipio = src.municipio;
      // ID canonico cross-municipio. Plantilla v2 usa IDs numericos ("1") que
      // colisionarian entre municipios; se les antepone el DANE.
      c.ID_Concejal = idConcejalCanonico_(c.ID_Concejal, src.dane);
    });
    concejales.push.apply(concejales, concejalesMun);

    const partidosMun = leerTabla_(ss, HOJAS.PARTIDOS).filter(function (r) { return r['PARTIDO / MOVIMIENTO']; });
    partidosMun.forEach(function (p) { p.municipio = src.municipio; });
    partidos.push.apply(partidos, partidosMun);

    // Mapa ID_Concejal -> Partido desde el maestro. La plantilla v2 NO trae la
    // columna 'Partido / Movimiento' en Instrumentos; se completa por join.
    const partidoPorConcejal = {};
    concejalesMun.forEach(function (c) {
      if (c.ID_Concejal && c['Partido / Movimiento']) {
        partidoPorConcejal[c.ID_Concejal] = c['Partido / Movimiento'];
      }
    });

    const instrumentosMun = leerTabla_(ss, HOJAS.INSTRUMENTOS)
      .filter(function (r) { return r.Identificador; });
    instrumentosMun.forEach(function (r) {
      r.municipio_origen = src.municipio;
      // Codigo DANE confiable desde la config (la hoja puede traerlo vacio o sin ceros).
      r['Codigo DANE'] = String(src.dane);
      // ID canonico unico cross-municipio: DANE-Identificador (ej. '05318-001-2012')
      r.id_instrumento = String(src.dane) + '-' + String(r.Identificador).trim();
      r.ID_Concejal = idConcejalCanonico_(r.ID_Concejal, src.dane);
      // Completar partido desde el maestro si la hoja no lo trae (plantilla v2).
      if (!r['Partido / Movimiento'] || String(r['Partido / Movimiento']).trim() === '') {
        var p = partidoPorConcejal[r.ID_Concejal];
        if (p) r['Partido / Movimiento'] = p;
      }
    });
    instrumentos.push.apply(instrumentos, instrumentosMun);

    // Validaciones rapidas
    const partidosSet = new Set(partidosMun.map(function (p) { return normalizar_(p['PARTIDO / MOVIMIENTO']); }));
    const idsConcejales = new Set(concejalesMun.map(function (c) { return c.ID_Concejal; }));

    instrumentosMun.forEach(function (r, i) {
      const partidoNorm = normalizar_(r['Partido / Movimiento']);
      if (partidoNorm && partidoNorm !== 'ADMINISTRACION' && !partidosSet.has(partidoNorm)) {
        validaciones.push({
          nivel: 'warn',
          municipio: src.municipio,
          mensaje: 'Partido no presente en MaestroPartidos: ' + r['Partido / Movimiento'],
          fila: i + 2,
        });
      }
      if (r.ID_Concejal && r.ID_Concejal !== 'ADMINISTRACION' && !idsConcejales.has(r.ID_Concejal)) {
        validaciones.push({
          nivel: 'warn',
          municipio: src.municipio,
          mensaje: 'ID_Concejal huerfano: ' + r.ID_Concejal,
          fila: i + 2,
        });
      }
    });
  });

  return {
    generadoEn: new Date().toISOString(),
    municipios: municipios,
    concejales: concejales,
    partidos: partidos,
    instrumentos: instrumentos,
    validaciones: validaciones,
  };
}

/**
 * Columna "ancla" que identifica la fila de encabezado de cada hoja. Permite
 * soportar variantes de plantilla donde los headers no estan en una fila fija
 * (p. ej. Instrumentos en fila 1 en la plantilla vieja y en fila 3 en la v2).
 */
const ANCHORS_HEADER = Object.freeze({
  Instrumentos: ['Identificador'],
  MaestroConcejales: ['ID_Concejal'],
  MaestroPartidos: ['PARTIDO / MOVIMIENTO'],
  DatosMunicipio: ['Campo'],
  Listas: [],
});

/**
 * Devuelve la fila (1-indexed) del encabezado: busca la columna ancla en las
 * primeras filas; si no la encuentra, cae a FILA_HEADER[nombre] || 1.
 */
function detectarFilaHeader_(sheet, nombreHoja, lastCol) {
  const fallback = FILA_HEADER[nombreHoja] || 1;
  const anchors = (ANCHORS_HEADER[nombreHoja] || []).map(function (a) { return a.toLowerCase(); });
  if (anchors.length === 0) return fallback;
  const maxScan = Math.min(8, sheet.getLastRow());
  if (maxScan < 1) return fallback;
  const bloque = sheet.getRange(1, 1, maxScan, lastCol).getValues();
  for (var i = 0; i < bloque.length; i++) {
    var celdas = bloque[i].map(function (c) { return String(c).trim().toLowerCase(); });
    for (var a = 0; a < anchors.length; a++) {
      if (celdas.indexOf(anchors[a]) !== -1) return i + 1;
    }
  }
  return fallback;
}

/**
 * Canoniza un ID_Concejal a forma unica cross-municipio.
 * - "1.0"/"1" (plantilla v2) -> "<DANE>-1"
 * - "05318-003" (ya prefijado con DANE) -> se respeta
 * - "ADMINISTRACION" -> se respeta
 */
function idConcejalCanonico_(raw, dane) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, ''); // "1.0" -> "1"
  if (/^\d{5}-/.test(s)) return s;                      // ya viene "DANE-..."
  if (s.toUpperCase() === 'ADMINISTRACION') return 'ADMINISTRACION';
  return String(dane) + '-' + s;
}

/**
 * Lee una hoja tabular detectando la fila de encabezado. Devuelve array de
 * objetos {header: valor}, omitiendo filas totalmente vacias.
 */
function leerTabla_(ss, nombreHoja) {
  const sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) return [];
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 2) return [];

  const filaHeader = detectarFilaHeader_(sheet, nombreHoja, lastCol);
  if (lastRow < filaHeader + 1) return [];

  const headers = sheet.getRange(filaHeader, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  const values = sheet.getRange(filaHeader + 1, 1, lastRow - filaHeader, lastCol).getValues();

  return values
    .filter(function (row) { return row.some(function (c) { return c !== '' && c !== null; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
      return obj;
    });
}

/** DatosMunicipio tiene formato Campo / Valor; lo devolvemos como objeto plano. */
function leerKeyValue_(ss, nombreHoja) {
  const filas = leerTabla_(ss, nombreHoja);
  const out = {};
  filas.forEach(function (r) {
    if (r.Campo) out[r.Campo] = r.Valor;
  });
  return out;
}

function normalizar_(s) {
  return String(s || '').trim().toUpperCase();
}

/** Util para correr desde el editor y ver el JSON en logs. */
function debugConsolidar() {
  const data = consolidar();
  console.log('Municipios:', data.municipios.length);
  console.log('Concejales:', data.concejales.length);
  console.log('Instrumentos:', data.instrumentos.length);
  console.log('Validaciones:', data.validaciones.length);
}
