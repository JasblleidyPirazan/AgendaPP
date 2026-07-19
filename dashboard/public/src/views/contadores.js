// Vista Contadores: conteos de instrumentos por partido y por concejal,
// desglosados por Clasificacion legal (Acuerdo / Proyecto de Acuerdo / ...).
// Respeta los filtros activos (rol, municipio, clasificacion). Cuenta
// instrumentos UNICOS (por id_instrumento) en el alcance del analisis
// (Incluir != "No").
export function renderContadores(root, ctx) {
  if (!ctx.raw || !Array.isArray(ctx.raw.instrumentos)) {
    root.innerHTML = `<p class="empty">
      Esta vista cuenta desde la data cruda: requiere el endpoint Apps Script.
    </p>`;
    return;
  }

  const norm = (v) => String(v ?? "").trim();
  const low = (v) => norm(v).toLowerCase();
  const params = ctx.metrics.parametros || {};

  // Filtros activos (mismos que produjeron ctx.metrics)
  const rolesSet = new Set((params.rol || ["Proponente", "Ponente", "Coordinador"]).map((r) => low(r)));
  const munParam = params.municipios;
  const munSet = Array.isArray(munParam) ? new Set(munParam.map((m) => low(m))) : null;
  const claseParam = params.clasificaciones;
  const claseSet = Array.isArray(claseParam) ? new Set(claseParam.map((c) => low(c))) : null;

  const pasaMun = (r) => {
    if (!munSet) return true;
    const dane = norm(r["Codigo DANE"]).padStart(5, "0");
    return munSet.has(dane) || munSet.has(low(r.municipio_origen || r.municipio));
  };
  const pasaClase = (r) => !claseSet || claseSet.has(low(r["Clasificacion legal"]));
  const normUp = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  const noAdmin = (r) => !(normUp(r["Partido / Movimiento"]).startsWith("ADMINISTRAC") || normUp(r.ID_Concejal).startsWith("ADMINISTRAC"));

  // Nombre por ID_Concejal
  const nombres = new Map();
  for (const c of ctx.raw.concejales || []) {
    if (c.ID_Concejal) nombres.set(c.ID_Concejal, norm(c["Nombre completo"]));
  }

  const idDe = (r) => r.id_instrumento || (norm(r["Codigo DANE"]).padStart(5, "0") + "-" + norm(r.Identificador));
  const claseDe = (r) => norm(r["Clasificacion legal"]) || "(sin clasif.)";

  // Filas en alcance SIN el filtro de clasificacion: sirven para detectar
  // instrumentos cuya "Clasificacion legal" varia entre filas (mismo
  // id_instrumento clasificado como Acuerdo en unas filas y Proyecto de
  // Acuerdo en otras). Esos instrumentos se cuentan en CADA clasificacion
  // donde aparecen, por eso la suma por clase puede superar el total unico.
  const filasBase = ctx.raw.instrumentos.filter((r) =>
    norm(r.Identificador) &&
    low(r["Incluir en analisis"]) !== "no" &&
    rolesSet.has(low(r.Rol)) &&
    pasaMun(r) && noAdmin(r)
  );

  const clasifPorInst = new Map(); // id -> {mun, titulo, clases: Map(clase -> nFilas)}
  for (const r of filasBase) {
    const id = idDe(r);
    if (!clasifPorInst.has(id)) clasifPorInst.set(id, {
      id,
      mun: norm(r.municipio_origen) || norm(r.municipio) || "(sin municipio)",
      titulo: norm(r.Titulo),
      clases: new Map(),
    });
    const g = clasifPorInst.get(id);
    const c = claseDe(r);
    g.clases.set(c, (g.clases.get(c) || 0) + 1);
    if (!g.titulo && norm(r.Titulo)) g.titulo = norm(r.Titulo);
  }
  const inconsistentes = Array.from(clasifPorInst.values())
    .filter((g) => g.clases.size > 1)
    .sort((a, b) => a.mun.localeCompare(b.mun, "es") || a.id.localeCompare(b.id, "es"));

  // Filas en alcance (con todos los filtros, incluida la clasificacion)
  const filas = filasBase.filter((r) => pasaClase(r));

  // Clasificaciones presentes (columnas)
  const clases = Array.from(new Set(filas.map((r) => claseDe(r))))
    .sort((a, b) => a.localeCompare(b, "es"));

  // Conteos por partido y por concejal (instrumentos UNICOS via Set de id_instrumento)
  const porPartido = new Map();
  const porConcejal = new Map();
  const totalGlobal = new Set();
  const porClaseGlobal = new Map(); // clase -> Set(id) en alcance

  for (const r of filas) {
    const id = idDe(r);
    const clase = claseDe(r);
    const partido = norm(r["Partido / Movimiento"]) || "(sin partido)";
    const cid = norm(r.ID_Concejal);
    totalGlobal.add(id);
    if (!porClaseGlobal.has(clase)) porClaseGlobal.set(clase, new Set());
    porClaseGlobal.get(clase).add(id);

    if (!porPartido.has(partido)) porPartido.set(partido, { total: new Set(), porClase: new Map() });
    const gp = porPartido.get(partido);
    gp.total.add(id);
    if (!gp.porClase.has(clase)) gp.porClase.set(clase, new Set());
    gp.porClase.get(clase).add(id);

    if (cid) {
      if (!porConcejal.has(cid)) porConcejal.set(cid, { partido, total: new Set(), porClase: new Map() });
      const gc = porConcejal.get(cid);
      gc.total.add(id);
      if (!gc.porClase.has(clase)) gc.porClase.set(clase, new Set());
      gc.porClase.get(clase).add(id);
    }
  }

  const filasPartido = Array.from(porPartido.entries())
    .map(([partido, g]) => ({ partido, total: g.total.size, porClase: g.porClase }))
    .sort((a, b) => b.total - a.total);

  const filasConcejal = Array.from(porConcejal.entries())
    .map(([cid, g]) => ({ cid, nombre: nombres.get(cid) || cid, partido: g.partido, total: g.total.size, porClase: g.porClase }))
    .sort((a, b) => a.partido.localeCompare(b.partido, "es") || b.total - a.total);

  const clasesTxt = Array.isArray(claseParam) ? claseParam.map((c) => c || "(sin clasif.)").join(", ") : "todas";

  // --- Panel de consistencia -------------------------------------------------
  // La suma de los contadores por clasificacion puede superar el total de
  // instrumentos unicos: un instrumento con filas en DOS clasificaciones se
  // cuenta una vez en cada una, pero una sola vez en el total.
  const sumaClases = clases.reduce((acc, c) => acc + (porClaseGlobal.get(c)?.size || 0), 0);
  const dobles = sumaClases - totalGlobal.size;
  const inconEnAlcance = inconsistentes.filter((g) => totalGlobal.has(g.id));
  const MAX_INCON = 200;

  const panelConsistencia = inconsistentes.length === 0 ? `
    <div class="aviso aviso-ok">
      <strong>✓ Clasificación consistente.</strong>
      Cada instrumento en alcance tiene una única "Clasificación legal": la suma de los
      contadores por clasificación coincide con el total de instrumentos únicos.
    </div>
  ` : `
    <div class="aviso aviso-warn">
      <strong>⚠ Clasificación legal inconsistente en ${inconsistentes.length} instrumento(s).</strong>
      Tienen filas registradas con <em>más de una</em> "Clasificación legal" (p. ej. unas filas como
      <em>Acuerdo</em> y otras como <em>Proyecto de Acuerdo</em>), así que se cuentan una vez en
      <em>cada</em> clasificación donde aparecen.
      ${dobles > 0 ? `
        Por eso la suma por clasificación (<strong>${sumaClases}</strong>) supera el total de
        instrumentos únicos (<strong>${totalGlobal.size}</strong>) en <strong>${dobles}</strong>:
        no es un error de conteo, es un dato a corregir en el Sheet del municipio.
      ` : `
        Con el filtro de clasificación actual no se produce doble conteo, pero conviene
        corregir la clasificación en el Sheet del municipio.
      `}
      <details>
        <summary>Ver instrumentos con clasificación inconsistente (${inconEnAlcance.length} en alcance)</summary>
        <div style="overflow-x:auto;margin-top:.5rem">
          <table>
            <thead><tr><th>ID</th><th>Municipio</th><th>Título</th><th>Clasificaciones (filas)</th></tr></thead>
            <tbody>
              ${inconEnAlcance.slice(0, MAX_INCON).map((g) => `
                <tr>
                  <td><code>${esc(g.id)}</code></td>
                  <td>${esc(g.mun)}</td>
                  <td>${esc((g.titulo || "—").slice(0, 80))}${g.titulo && g.titulo.length > 80 ? "…" : ""}</td>
                  <td>${Array.from(g.clases.entries()).map(([c, n]) => `${esc(c)} (${n})`).join(" · ")}</td>
                </tr>
              `).join("")}
              ${inconEnAlcance.length > MAX_INCON ? `
                <tr><td colspan="4" style="text-align:center;color:var(--muted);font-style:italic">
                  … mostrando primeros ${MAX_INCON} de ${inconEnAlcance.length}.
                </td></tr>` : ""}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  `;

  root.innerHTML = `
    <h2>Contadores de instrumentos</h2>
    <p style="color:var(--muted);font-size:.9rem">
      Instrumentos únicos en alcance (Incluir ≠ "No"). Filtros activos —
      Roles: <strong>${(params.rol || []).join(", ")}</strong> · Clasificación: <strong>${clasesTxt}</strong>.
      Cambia los chips de arriba para recontar.
    </p>

    <div class="cards">
      <div class="card"><div class="label">Instrumentos (únicos)</div><div class="value">${totalGlobal.size}</div></div>
      ${clases.length > 1 ? clases.map((c) => `
        <div class="card"><div class="label">${esc(c)}</div><div class="value">${porClaseGlobal.get(c)?.size || 0}</div></div>
      `).join("") : ""}
      <div class="card"><div class="label">Partidos</div><div class="value">${filasPartido.length}</div></div>
      <div class="card"><div class="label">Concejales con instrumentos</div><div class="value">${filasConcejal.length}</div></div>
      <div class="card"><div class="label">Clasificaciones</div><div class="value">${clases.length}</div></div>
    </div>

    ${panelConsistencia}

    <div class="plot" id="cnt-bar"></div>

    <h3>Instrumentos por partido y clasificación</h3>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Partido</th><th>Total</th>${clases.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>
          ${filasPartido.map((f) => filaPivot(f.partido, f.total, f.porClase, clases, true)).join("")}
          <tr class="fila-total">
            <td>Total (instrumentos únicos)</td>
            <td style="text-align:center">${totalGlobal.size}</td>
            ${clases.map((c) => `<td style="text-align:center">${porClaseGlobal.get(c)?.size || 0}</td>`).join("")}
          </tr>
        </tbody>
      </table>
    </div>
    <p class="nota">
      La fila <strong>Total</strong> cuenta instrumentos únicos: un instrumento compartido por varios
      partidos —o registrado con más de una clasificación— aparece en cada fila/columna donde participa,
      pero se cuenta una sola vez en el total. Por eso las sumas de filas o columnas pueden superar el total.
    </p>

    <h3 style="margin-top:2rem">Instrumentos por concejal y clasificación</h3>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Concejal</th><th>Partido</th><th>Total</th>${clases.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>
          ${filasConcejal.map((f) => `
            <tr>
              <td>${esc(f.nombre)}</td>
              <td>${esc(f.partido)}</td>
              <td style="text-align:center;font-weight:600">${f.total}</td>
              ${clases.map((c) => `<td style="text-align:center">${cnt(f.porClase, c)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  if (filasPartido.length) {
    Plotly.newPlot("cnt-bar", [{
      type: "bar", orientation: "h",
      x: filasPartido.map((f) => f.total),
      y: filasPartido.map((f) => f.partido),
      marker: { color: "#4f46e5" },
      hovertemplate: "%{y}<br>%{x} instrumentos<extra></extra>",
    }], {
      title: { text: "Instrumentos totales por partido", font: { size: 14 } },
      xaxis: { title: "Instrumentos únicos", dtick: 1 },
      margin: { l: 220, t: 40 }, height: Math.max(260, 32 * filasPartido.length + 60),
    }, { responsive: true });
  }
}

function filaPivot(nombre, total, porClase, clases, bold) {
  return `<tr>
    <td${bold ? ' style="font-weight:600"' : ""}>${esc(nombre)}</td>
    <td style="text-align:center;font-weight:600">${total}</td>
    ${clases.map((c) => `<td style="text-align:center">${cnt(porClase, c)}</td>`).join("")}
  </tr>`;
}

function cnt(porClase, clase) {
  const s = porClase.get(clase);
  return s && s.size ? s.size : '<span style="color:var(--muted)">·</span>';
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
