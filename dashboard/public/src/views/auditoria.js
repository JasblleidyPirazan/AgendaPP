export function renderAuditoria(root, ctx) {
  if (!ctx.raw) {
    root.innerHTML = `<p class="empty">
      Configura <code>appsScriptUrl</code> en <code>/config.json</code> para habilitar la auditoría con datos crudos.
    </p>`;
    return;
  }

  const validaciones = ctx.raw.validaciones || [];
  const instrumentos = ctx.raw.instrumentos || [];

  // --- Diagnóstico por municipio: por qué entran (o no) los instrumentos al análisis ---
  const porMun = new Map();
  const norm = (v) => String(v ?? "").trim();
  for (const r of instrumentos) {
    if (!norm(r.Identificador)) continue;
    const mun = norm(r.municipio_origen) || norm(r.municipio) || "(sin municipio)";
    if (!porMun.has(mun)) porMun.set(mun, {
      total: 0, incSi: 0, incNo: 0, incVacio: 0,
      conTema: 0, conSector: 0, conId: 0, conNombre: 0, roles: new Set(),
    });
    const g = porMun.get(mun);
    g.total++;
    const inc = norm(r["Incluir en analisis"]).toLowerCase();
    if (inc === "si" || inc === "sí") g.incSi++;
    else if (inc === "no") g.incNo++;
    else g.incVacio++;
    if (norm(r.Tematica)) g.conTema++;
    if (norm(r.Sector)) g.conSector++;
    if (norm(r.ID_Concejal)) g.conId++;
    if (norm(r["Nombre actor"])) g.conNombre++;
    if (norm(r.Rol)) g.roles.add(norm(r.Rol));
  }
  const filasMun = Array.from(porMun.entries())
    .map(([mun, g]) => ({ mun, ...g, roles: Array.from(g.roles).sort().join(", ") || "—" }))
    .sort((a, b) => a.mun.localeCompare(b.mun, "es"));

  const diagMunicipios = `
    <h3>Diagnóstico por municipio</h3>
    <p style="color:var(--muted);font-size:0.9rem">
      Para entrar al análisis, una fila necesita: <strong>Incluir="Si"</strong> + <strong>ID_Concejal</strong> +
      tema (<strong>Sector</strong> o <strong>Tematica</strong>). Si un municipio tiene "Incluir Si" o "ID_Concejal" en 0,
      sus instrumentos no se cuentan aunque estén cargados.
    </p>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Municipio</th><th>Filas</th><th>Inc. Si</th><th>Inc. No</th><th>Inc. vacío</th>
          <th>c/Tematica</th><th>c/Sector</th><th>c/ID_Concejal</th><th>c/Nombre actor</th><th>Roles</th>
        </tr></thead>
        <tbody>
          ${filasMun.map((f) => `
            <tr>
              <td><strong>${f.mun}</strong></td>
              <td style="text-align:center">${f.total}</td>
              <td style="text-align:center" class="${f.incSi ? 'tag-ok' : 'tag-bad'}">${f.incSi}</td>
              <td style="text-align:center">${f.incNo}</td>
              <td style="text-align:center">${f.incVacio}</td>
              <td style="text-align:center">${f.conTema}</td>
              <td style="text-align:center">${f.conSector}</td>
              <td style="text-align:center" class="${f.conId ? 'tag-ok' : 'tag-bad'}">${f.conId}</td>
              <td style="text-align:center">${f.conNombre}</td>
              <td style="font-size:0.8rem">${f.roles}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  root.innerHTML = `
    <h2>Auditoría de datos (en vivo desde Apps Script)</h2>
    <p>Datos crudos del endpoint, sin transformar. Util para detectar correcciones necesarias en los Sheets.</p>

    ${diagMunicipios}

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
