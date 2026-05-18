/**
 * Configuracion del consolidador AgendaPP.
 *
 * SHEETS_FUENTE: lista de Sheets municipales con la plantilla estandar.
 * Cada entrada: { municipio, dane, fileId }.
 *   - municipio: nombre legible.
 *   - dane: codigo DANE de 5 digitos (string, conserva ceros a la izquierda).
 *   - fileId: id del archivo en Drive (el segmento entre /d/ y /edit en la URL).
 *
 * TOKEN_REQUERIDO: si distinto de '', doGet exige ?token=...
 *   En produccion guardarlo en PropertiesService (scriptProperties) en vez de aqui.
 */
const SHEETS_FUENTE = [
  { municipio: 'GUARNE', dane: '05318', fileId: '1CGfkYxMWpIjjsIzKiz5lPOAxz4ql0TGIT3CJTH4x8Dw' },
];

const HOJAS = Object.freeze({
  INSTRUMENTOS: 'Instrumentos',
  CONCEJALES: 'MaestroConcejales',
  PARTIDOS: 'MaestroPartidos',
  MUNICIPIO: 'DatosMunicipio',
  LISTAS: 'Listas',
});

/** Fila (1-indexed) donde empiezan los headers en cada hoja segun la plantilla. */
const FILA_HEADER = Object.freeze({
  Instrumentos: 1,
  MaestroConcejales: 3,
  MaestroPartidos: 3,
  DatosMunicipio: 3,
  Listas: 1,
});

const CACHE_SECONDS = 300; // 5 min
const TOKEN_REQUERIDO = ''; // dejar en '' para endpoint publico
