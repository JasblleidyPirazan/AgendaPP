export function renderJaccard(root, ctx) {
  const umbral = ctx.metrics.veredicto.umbral_jaccard;
  const partidos = ctx.metrics.partidos
    .filter((p) => p.jaccard_intra !== null)
    .sort((a, b) => b.jaccard_intra - a.jaccard_intra);

  root.innerHTML = `
    <h2>Convergencia temática intra-partido (Jaccard)</h2>
    <p>Jaccard pareado promedio entre concejales del mismo partido sobre temas (binarizados).</p>
    <p><strong>J ≥ ${umbral}</strong>: alta convergencia. <strong>J < ${umbral}</strong>: cada concejal aborda temas distintos.</p>
    ${partidos.length === 0 ? '<p class="empty">No hay partidos con ≥ 2 concejales aptos.</p>' : ''}
    <div class="plot" id="bar-j"></div>
    <table>
      <thead><tr><th>Partido</th><th>Concejales aptos</th><th>Jaccard</th><th>Interpretación</th></tr></thead>
      <tbody>
        ${partidos.map((p) => `
          <tr>
            <td>${p.nombre}</td>
            <td>${p.n_concejales_aptos}</td>
            <td>${p.jaccard_intra.toFixed(3)}</td>
            <td class="${p.jaccard_intra >= umbral ? 'tag-ok' : 'tag-bad'}">
              ${p.jaccard_intra >= umbral ? 'Alta convergencia' : 'Baja convergencia'}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  if (partidos.length === 0) return;

  Plotly.newPlot("bar-j", [{
    x: partidos.map((p) => p.jaccard_intra),
    y: partidos.map((p) => p.nombre),
    type: "bar",
    orientation: "h",
    marker: { color: partidos.map((p) => p.jaccard_intra >= umbral ? "#15803d" : "#dc2626") },
  }], {
    xaxis: { title: "Jaccard pareado promedio", range: [0, 1] },
    shapes: [{ type: "line", x0: umbral, x1: umbral, y0: 0, y1: 1, yref: "paper", line: { dash: "dash" } }],
    margin: { l: 200, t: 20 },
    height: Math.max(300, 35 * partidos.length),
  }, { responsive: true });
}
