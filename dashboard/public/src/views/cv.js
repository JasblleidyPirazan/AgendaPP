export function renderCV(root, ctx) {
  const umbral = ctx.metrics.veredicto.umbral_cv;
  const partidos = ctx.metrics.partidos
    .filter((p) => p.cv_shannon !== null)
    .sort((a, b) => a.cv_shannon - b.cv_shannon);

  // Construye H por concejal agrupado por partido para mostrar la distribucion subyacente
  const hPorPartido = {};
  ctx.metrics.concejales.forEach((c) => {
    if (!c.partido) return;
    (hPorPartido[c.partido] ??= []).push({
      id: c.id,
      nombre: c.nombre || c.id,
      h: c.shannon_norm,
      n: c.n_instrumentos,
    });
  });

  root.innerHTML = `
    <h2>Coeficiente de variación de Shannon (intra-partido)</h2>
    <details style="margin-bottom:1rem">
      <summary style="cursor:pointer;font-weight:600">¿Qué mide exactamente este CV? (clic para expandir)</summary>
      <div style="padding:0.75rem 1rem;background:#fafbfd;border-left:3px solid var(--accent);margin-top:0.5rem">
        <p>CV = σ(H) / μ(H) sobre los Shannon de los concejales del partido.
           Captura qué tan parecidos son <strong>en su nivel de diversidad temática</strong>,
           no en <em>qué temas</em> trabajan.</p>
        <ul>
          <li><strong>CV bajo</strong>: todos los concejales del partido son igual de
            diversos (todos generalistas, o todos especialistas). Apoya H1a.</li>
          <li><strong>CV alto</strong>: en el partido conviven generalistas y especialistas.
            Apoya H2a.</li>
          <li><strong>NaN</strong>: μ=0 (todos H=0, hiperespecializacion total) o n&lt;2 concejales.</li>
        </ul>
        <p style="margin-bottom:0">
          <strong>Importante:</strong> CV no mide alineación temática
          (eso lo hace Jaccard). Un partido donde todos firman "Salud" único tendrá CV=NaN
          pero Jaccard=1. Por eso H1 exige las dos condiciones.
        </p>
      </div>
    </details>

    <p><strong>CV ≤ ${umbral}</strong>: uniformidad partidista (H1a).
       <strong>CV &gt; ${umbral}</strong>: autonomía individual (H2a).
       Umbral heurístico de la literatura inicial; ajustable.</p>

    ${partidos.length === 0
      ? '<p class="empty">No hay partidos con ≥ 2 concejales aptos. Agrega más municipios o baja el umbral mínimo.</p>'
      : ''}

    <div class="plot" id="bar-cv"></div>

    <h3>Distribución de H por partido</h3>
    <p style="color:var(--muted);font-size:0.9rem">
      Cada punto es un concejal. La línea vertical marca la media μ del partido.
      CV alto = puntos muy separados de su media.
    </p>
    <div class="plot" id="strip-h"></div>

    <table>
      <thead><tr><th>Partido</th><th>Concejales</th><th>μ(H)</th><th>CV</th><th>H individuales</th><th>Interpretación</th></tr></thead>
      <tbody>
        ${partidos.map((p) => {
          const hs = (hPorPartido[p.nombre] || []).slice().sort((a, b) => a.h - b.h);
          const mu = hs.length ? hs.reduce((s, x) => s + x.h, 0) / hs.length : 0;
          return `
            <tr>
              <td>${p.nombre}</td>
              <td>${p.n_concejales_aptos}</td>
              <td>${mu.toFixed(3)}</td>
              <td>${p.cv_shannon.toFixed(3)}</td>
              <td style="font-size:0.85rem">
                ${hs.map((x) => `<div title="${x.nombre} (n=${x.n})">${x.h.toFixed(2)} <span style="color:var(--muted)">— ${x.nombre}</span></div>`).join("")}
              </td>
              <td class="${p.cv_shannon <= umbral ? 'tag-ok' : 'tag-bad'}">
                ${p.cv_shannon <= umbral ? 'Uniformidad (H1a)' : 'Autonomía (H2a)'}
              </td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;

  if (partidos.length === 0) return;

  // Barras CV
  Plotly.newPlot("bar-cv", [{
    x: partidos.map((p) => p.cv_shannon),
    y: partidos.map((p) => p.nombre),
    type: "bar",
    orientation: "h",
    marker: { color: partidos.map((p) => p.cv_shannon <= umbral ? "#2ca02c" : "#d62728") },
    hovertemplate: "%{y}<br>CV=%{x:.3f}<extra></extra>",
  }], {
    title: { text: "CV(H) por partido (verde: uniformidad H1a)", font: { size: 14 } },
    xaxis: { title: "CV (σ/μ)" },
    shapes: [{ type: "line", x0: umbral, x1: umbral, y0: 0, y1: 1, yref: "paper", line: { dash: "dash" } }],
    margin: { l: 220, t: 40 },
    height: Math.max(300, 40 * partidos.length + 60),
  }, { responsive: true });

  // Strip plot: H por concejal, agrupado por partido
  const traces = [];
  for (const p of partidos) {
    const hs = hPorPartido[p.nombre] || [];
    if (!hs.length) continue;
    const mu = hs.reduce((s, x) => s + x.h, 0) / hs.length;
    traces.push({
      type: "scatter",
      mode: "markers",
      x: hs.map((x) => x.h),
      y: hs.map(() => p.nombre),
      text: hs.map((x) => `${x.nombre} (n=${x.n})`),
      marker: { size: 12, opacity: 0.7, color: p.cv_shannon <= umbral ? "#2ca02c" : "#d62728" },
      hovertemplate: "%{text}<br>H=%{x:.3f}<extra></extra>",
      showlegend: false,
      name: p.nombre,
    });
    // marker for mean
    traces.push({
      type: "scatter", mode: "markers",
      x: [mu], y: [p.nombre],
      marker: { symbol: "line-ns-open", size: 28, color: "#000", line: { width: 2 } },
      hovertemplate: `μ=${mu.toFixed(3)}<extra></extra>`,
      showlegend: false,
    });
  }

  Plotly.newPlot("strip-h", traces, {
    xaxis: { title: "H normalizado", range: [-0.05, 1.05] },
    margin: { l: 220, t: 20 },
    height: Math.max(300, 40 * partidos.length + 60),
  }, { responsive: true });
}
