// Vista Camaleones: concejales que cambiaron de partido entre periodos.
// Fuente: MaestroConcejales (ctx.raw.concejales). Un concejal puede tener varias
// filas (una por periodo), cada una con su 'Partido / Movimiento' y el flag
// 'Es camaleon'. Se agrupa por nombre+municipio para reconstruir la trayectoria.
export function renderCamaleones(root, ctx) {
  if (!ctx.raw || !Array.isArray(ctx.raw.concejales)) {
    root.innerHTML = `<p class="empty">
      Esta vista usa <code>MaestroConcejales</code> del endpoint Apps Script.
      Configura <code>appsScriptUrl</code> en <code>config.json</code>.
    </p>`;
    return;
  }

  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  const esSi = (v) => norm(v) === "SI";

  // Agrupar por persona = nombre normalizado + municipio
  const personas = new Map();
  for (const c of ctx.raw.concejales) {
    const nombre = String(c["Nombre completo"] ?? "").trim();
    if (!nombre || norm(nombre).startsWith("ADMINISTRAC")) continue;
    const muni = String(c.municipio ?? "").trim() || "—";
    const key = norm(nombre) + "|" + muni;
    if (!personas.has(key)) personas.set(key, { nombre, municipio: muni, filas: [] });
    personas.get(key).filas.push({
      periodo: String(c.Periodo ?? "").trim() || "—",
      partido: String(c["Partido / Movimiento"] ?? "").trim(),
      flag: esSi(c["Es camaleon"]),
    });
  }

  // Clasificar
  const todas = Array.from(personas.values());
  for (const p of todas) {
    p.filas.sort((a, b) => a.periodo.localeCompare(b.periodo, "es"));
    const partidos = new Set(p.filas.map((f) => f.partido).filter(Boolean));
    p.nPartidos = partidos.size;
    p.marcado = p.filas.some((f) => f.flag);
    p.detectado = partidos.size > 1; // cambió de partido entre filas
    p.esCamaleon = p.marcado || p.detectado;
  }

  const camaleones = todas.filter((p) => p.esCamaleon)
    .sort((a, b) => b.nPartidos - a.nPartidos || a.municipio.localeCompare(b.municipio, "es"));
  const totalPersonas = todas.length;
  const pct = totalPersonas ? (100 * camaleones.length / totalPersonas) : 0;

  // Discrepancias entre el flag manual y la detección automática
  const marcadosNoDetectados = camaleones.filter((p) => p.marcado && !p.detectado).length;
  const detectadosNoMarcados = camaleones.filter((p) => p.detectado && !p.marcado).length;

  // Por municipio
  const porMun = new Map();
  for (const p of todas) {
    if (!porMun.has(p.municipio)) porMun.set(p.municipio, { total: 0, cam: 0 });
    const g = porMun.get(p.municipio);
    g.total++; if (p.esCamaleon) g.cam++;
  }
  const filasMun = Array.from(porMun.entries())
    .map(([municipio, g]) => ({ municipio, ...g, pct: g.total ? 100 * g.cam / g.total : 0 }))
    .filter((f) => f.cam > 0)
    .sort((a, b) => b.cam - a.cam);

  root.innerHTML = `
    <h2>Concejales camaleones</h2>
    <p style="color:var(--muted);font-size:.9rem">
      Camaleón = concejal que cambió de partido entre periodos. Se considera tal si está
      <strong>marcado</strong> (<code>Es camaleon = Sí</code> en MaestroConcejales) o si se
      <strong>detecta</strong> que aparece con ≥ 2 partidos distintos. Relevante para H1/H2:
      la volatilidad partidista debilita la idea de agenda dictada por el partido.
    </p>

    <div class="cards">
      <div class="card"><div class="label">Concejales (personas)</div><div class="value">${totalPersonas}</div></div>
      <div class="card"><div class="label">Camaleones</div><div class="value">${camaleones.length}</div></div>
      <div class="card"><div class="label">% camaleón</div><div class="value">${pct.toFixed(0)}%</div></div>
      <div class="card">
        <div class="label">Discrepancias flag vs detección</div>
        <div class="value">${detectadosNoMarcados}</div>
        <div style="color:var(--muted);font-size:.72rem;margin-top:.25rem">cambian de partido pero no marcados${marcadosNoDetectados ? ` · ${marcadosNoDetectados} marcados sin 2º partido` : ""}</div>
      </div>
    </div>

    <div class="plot" id="cam-bar"></div>

    <h3>Listado de camaleones</h3>
    ${camaleones.length === 0 ? '<p class="empty">No se detectaron camaleones con los datos actuales.</p>' : `
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Nombre</th><th>Municipio</th><th># partidos</th><th>Trayectoria (periodo: partido)</th><th>Origen</th></tr></thead>
        <tbody>
          ${camaleones.map((p) => `
            <tr>
              <td>${esc(p.nombre)}</td>
              <td>${esc(p.municipio)}</td>
              <td style="text-align:center">${p.nPartidos}</td>
              <td style="font-size:.85rem">${trayectoria(p.filas)}</td>
              <td style="font-size:.8rem">${origen(p)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`}
  `;

  if (filasMun.length) {
    Plotly.newPlot("cam-bar", [{
      type: "bar", orientation: "h",
      x: filasMun.map((f) => f.cam),
      y: filasMun.map((f) => f.municipio),
      text: filasMun.map((f) => `${f.cam}/${f.total} (${f.pct.toFixed(0)}%)`),
      textposition: "auto",
      marker: { color: "#7a3bb3" },
      hovertemplate: "%{y}<br>%{x} camaleones de %{customdata}<extra></extra>",
      customdata: filasMun.map((f) => f.total),
    }], {
      title: { text: "Camaleones por municipio", font: { size: 14 } },
      xaxis: { title: "# camaleones", dtick: 1 },
      margin: { l: 200, t: 40 }, height: Math.max(240, 36 * filasMun.length + 60),
    }, { responsive: true });
  }
}

function trayectoria(filas) {
  return filas.map((f, i) => {
    const cambio = i > 0 && filas[i - 1].partido && f.partido && filas[i - 1].partido !== f.partido;
    const p = f.partido || "—";
    return `<span style="${cambio ? "color:var(--bad);font-weight:600" : ""}">${esc(f.periodo)}: ${esc(p)}</span>`;
  }).join(" <span style='color:var(--muted)'>→</span> ");
}

function origen(p) {
  if (p.marcado && p.detectado) return '<span class="tag-ok">Marcado + detectado</span>';
  if (p.marcado) return "Marcado";
  return '<span class="tag-bad">Detectado (sin marcar)</span>';
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
