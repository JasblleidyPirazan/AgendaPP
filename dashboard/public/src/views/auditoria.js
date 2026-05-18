export function renderAuditoria(root, ctx) {
  if (!ctx.raw) {
    root.innerHTML = `<p class="empty">
      Configura <code>appsScriptUrl</code> en <code>/config.json</code> para habilitar la auditoría con datos crudos.
    </p>`;
    return;
  }

  const validaciones = ctx.raw.validaciones || [];
  const instrumentos = ctx.raw.instrumentos || [];

  root.innerHTML = `
    <h2>Auditoría de datos (en vivo desde Apps Script)</h2>
    <p>Datos crudos del endpoint, sin transformar. Util para detectar correcciones necesarias en los Sheets.</p>

    <h3>Validaciones detectadas (${validaciones.length})</h3>
    ${validaciones.length === 0
      ? '<p class="empty">Sin advertencias</p>'
      : `<table>
          <thead><tr><th>Nivel</th><th>Municipio</th><th>Mensaje</th><th>Fila</th></tr></thead>
          <tbody>
            ${validaciones.slice(0, 100).map((v) => `
              <tr>
                <td class="${v.nivel === 'error' ? 'tag-bad' : 'tag-neutral'}">${v.nivel}</td>
                <td>${v.municipio ?? "—"}</td>
                <td>${v.mensaje}</td>
                <td>${v.fila ?? v.fila_aprox ?? "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>`}

    <h3 style="margin-top:2rem">Últimos 20 instrumentos incluidos</h3>
    <table>
      <thead><tr><th>Identificador</th><th>Año</th><th>Título</th><th>Tema</th><th>Rol</th><th>Concejal</th><th>Partido</th></tr></thead>
      <tbody>
        ${instrumentos
          .filter((i) => String(i["Incluir en analisis"]).toLowerCase() === "si")
          .slice(-20).reverse()
          .map((i) => `
            <tr>
              <td>${i.Identificador}</td>
              <td>${i.Anio}</td>
              <td>${(i.Titulo || "").slice(0, 60)}</td>
              <td>${i.Tematica ?? "—"}</td>
              <td>${i.Rol ?? "—"}</td>
              <td>${i.ID_Concejal ?? "—"}</td>
              <td>${i["Partido / Movimiento"] ?? "—"}</td>
            </tr>
          `).join("")}
      </tbody>
    </table>
  `;
}
