/**
 * Reporte standalone de validaciones (sin servir JSON).
 * Util para correrlo manualmente desde el editor antes de un deploy.
 *
 * Imprime en log:
 *   - partidos no maestrados
 *   - IDs de concejal huerfanos
 *   - instrumentos sin tema (Tematica vacia con Incluir='Si')
 *   - DANEs duplicados entre municipios
 */
function reporteValidaciones() {
  const data = consolidar();
  const errores = [];

  // Validaciones extra sobre Tematica
  data.instrumentos.forEach(function (r, i) {
    const incluir = String(r['Incluir en analisis'] || '').trim().toLowerCase();
    if (incluir === 'si' && !r.Tematica) {
      errores.push({ nivel: 'warn', mensaje: 'Instrumento incluido sin Tematica', identificador: r.Identificador, fila_aprox: i + 2 });
    }
  });

  // DANEs duplicados
  const visto = new Set();
  data.municipios.forEach(function (m) {
    if (visto.has(m.dane)) {
      errores.push({ nivel: 'error', mensaje: 'DANE duplicado entre municipios', dane: m.dane });
    }
    visto.add(m.dane);
  });

  const todo = data.validaciones.concat(errores);
  console.log('Total validaciones:', todo.length);
  todo.forEach(function (v) { console.log(JSON.stringify(v)); });
  return todo;
}
