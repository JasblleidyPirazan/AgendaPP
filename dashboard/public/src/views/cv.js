export function renderCV(root, ctx) {
  const umbral = ctx.metrics.veredicto.umbral_cv;
  const partidos = ctx.metrics.partidos
    .filter((p) => p.cv_shannon !== null)
    .sort((a, b) => a.cv_shannon - b.cv_shannon);

  root.innerHTML = `
    <h2>Coeficiente de variación de Shannon (intra-partido)</h2>
    <p>Mide qué tan parecidos son los concejales de un mismo partido en su diversidad temática.</p>
    <p><strong>CV ≤ ${umbral}</strong>: uniformidad partidista (H1a). <strong>CV > ${umbral}</strong>: autonomía individual (H2a).</p>
    ${partidos.length === 0 ? '<p class="empty">No hay partidos con ≥ 2 concejales aptos. Agrega más municipios.</p>' : ''}
    <div class="plot" id="bar-cv"></div>
    <table>
      <thead><tr><th>Partido</th><th>Concejales aptos</th><th>CV</th><th>Interpretación</th></tr></thead>
      <tbody>
        ${partidos.map((p) => `
          <tr>
            <td>${p.nombre}</td>
            <td>${p.n_concejales_aptos}</td>
            <td>${p.cv_shannon.toFixed(3)}</td>
            <td class="${p.cv_shannon <= umbral ? 'tag-ok' : 'tag-bad'}">
              ${p.cv_shannon <= umbral ? 'Uniformidad (H1a)' : 'Autonomía (H2a)'}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  if (partidos.length === 0) return;

  Plotly.newPlot("bar-cv", [{
    x: partidos.map((p) => p.cv_shannon),
    y: partidos.map((p) => p.nombre),
    type: "bar",
    orientation: "h",
    marker: { color: partidos.map((p) => p.cv_shannon <= umbral ? "#2ca02c" : "#d62728") },
  }], {
    xaxis: { title: "CV (σ/μ)" },
    shapes: [{ type: "line", x0: umbral, x1: umbral, y0: 0, y1: 1, yref: "paper", line: { dash: "dash" } }],
    margin: { l: 200, t: 20 },
    height: Math.max(300, 35 * partidos.length),
  }, { responsive: true });
}
