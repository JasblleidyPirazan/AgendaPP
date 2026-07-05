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
  { municipio: 'GUARNE',         dane: '05318', fileId: '1CGfkYxMWpIjjsIzKiz5lPOAxz4ql0TGIT3CJTH4x8Dw' },
  { municipio: 'LA CEJA',        dane: '05376', fileId: '1fFMYXntKdSfqKFFBRs1nVh-Kh46KTkLiwgzXeejfHSc' },
  { municipio: 'CIUDAD BOLIVAR', dane: '05101', fileId: '1b40HESqOmltVneOEWTvh1jOtVwIO7EkYFI7D2MzkU_g' },
  { municipio: 'RIONEGRO',       dane: '05615', fileId: '1ETVudZa9QobuN2KZDFBO04PzXOCBeQXReiCO7jx4fbY' },
  { municipio: 'ABREAQUI',       dane: '05004', fileId: '1fSwTyUiLeRvNkjSUs0YJJl3PTbJl-9tbsdBz8QN7eYY' },
  { municipio: 'ANGELOPOLIS',    dane: '05036', fileId: '1Sn7QcIm72hOGB4POFDyhyqfWEzalsLviCjavaQ8h78Q' },
  { municipio: 'SANTA ROSA DE OSOS', dane: '05686', fileId: '1_Ghr70yPZWRy3bsVpho93D1L4tK-im-DIZkrJWa_U1o' },
  { municipio: 'BELLO',          dane: '05088', fileId: '1bHk7URfPjmLozqx0cSiba5z2K4I9kD4nKn9998ix0sA' },
  { municipio: 'MEDELLIN',       dane: '05001', fileId: '1-kp6OSSoVkCwIpEy2u0CMbSucKPHEoBq' },
  { municipio: 'VALDIVIA',       dane: '05854', fileId: '1sbU9BuvPRusMBtRzX8WEHjWnkzkTISar8X-on22RJh8' },
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
