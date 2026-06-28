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
    concejalesMun.forEach(function (c) { c.municipio = src.municipio; });
    concejales.push.apply(concejales, concejalesMun);

    const partidosMun = leerTabla_(ss, HOJAS.PARTIDOS).filter(function (r) { return r['PARTIDO / MOVIMIENTO']; });
    partidosMun.forEach(function (p) { p.municipio = src.municipio; });
    partidos.push.apply(partidos, partidosMun);

    const instrumentosMun = leerTabla_(ss, HOJAS.INSTRUMENTOS)
      .filter(function (r) { return r.Identificador; });
    instrumentosMun.forEach(function (r) {
      r.municipio_origen = src.municipio;
      // ID canonico unico cross-municipio: DANE-Identificador (ej. '05318-001-2012')
      r.id_instrumento = String(src.dane) + '-' + String(r.Identificador).trim();
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
 * Lee una hoja tabular tomando el header de FILA_HEADER[nombre]. Devuelve
 * array de objetos {header: valor}, omitiendo filas totalmente vacias.
 */
function leerTabla_(ss, nombreHoja) {
  const sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) return [];
  const filaHeader = FILA_HEADER[nombreHoja] || 1;
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
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
