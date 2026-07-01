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

  // Filas en alcance
  const filas = ctx.raw.instrumentos.filter((r) =>
    norm(r.Identificador) &&
    low(r["Incluir en analisis"]) !== "no" &&
    rolesSet.has(low(r.Rol)) &&
    pasaMun(r) && pasaClase(r) && noAdmin(r)
  );

  // Clasificaciones presentes (columnas)
  const clases = Array.from(new Set(filas.map((r) => norm(r["Clasificacion legal"]) || "(sin clasif.)")))
    .sort((a, b) => a.localeCompare(b, "es"));

  // Conteos por partido y por concejal (instrumentos UNICOS via Set de id_instrumento)
  const idDe = (r) => r.id_instrumento || (norm(r["Codigo DANE"]).padStart(5, "0") + "-" + norm(r.Identificador));
  const claseDe = (r) => norm(r["Clasificacion legal"]) || "(sin clasif.)";

  const porPartido = new Map();
  const porConcejal = new Map();
  const totalGlobal = new Set();

  for (const r of filas) {
    const id = idDe(r);
    const clase = claseDe(r);
    const partido = norm(r["Partido / Movimiento"]) || "(sin partido)";
    const cid = norm(r.ID_Concejal);
    totalGlobal.add(id);

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

  root.innerHTML = `
    <h2>Contadores de instrumentos</h2>
    <p style="color:var(--muted);font-size:.9rem">
      Instrumentos únicos en alcance (Incluir ≠ "No"). Filtros activos —
      Roles: <strong>${(params.rol || []).join(", ")}</strong> · Clasificación: <strong>${clasesTxt}</strong>.
      Cambia los chips de arriba para recontar.
    </p>

    <div class="cards">
      <div class="card"><div class="label">Instrumentos (únicos)</div><div class="value">${totalGlobal.size}</div></div>
      <div class="card"><div class="label">Partidos</div><div class="value">${filasPartido.length}</div></div>
      <div class="card"><div class="label">Concejales con instrumentos</div><div class="value">${filasConcejal.length}</div></div>
      <div class="card"><div class="label">Clasificaciones</div><div class="value">${clases.length}</div></div>
    </div>

    <div class="plot" id="cnt-bar"></div>

    <h3>Instrumentos por partido y clasificación</h3>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Partido</th><th>Total</th>${clases.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>
          ${filasPartido.map((f) => filaPivot(f.partido, f.total, f.porClase, clases, true)).join("")}
        </tbody>
      </table>
    </div>

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
      marker: { color: "#3b3bb3" },
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
