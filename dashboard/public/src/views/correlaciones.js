export function renderCorr(root, ctx) {
  const pairs = ctx.metrics.interpartido.filter((p) => p.pearson !== null);
  const partidos = Array.from(new Set(pairs.flatMap((p) => [p.a, p.b]))).sort();

  root.innerHTML = `
    <h2>Convergencia inter-partido (Pearson)</h2>
    <p>Similitud entre los perfiles temáticos agregados de cada par de partidos.</p>
    <p>+1 = perfiles idénticos · 0 = independientes · −1 = opuestos.</p>
    ${partidos.length < 2 ? '<p class="empty">Se necesitan al menos 2 partidos con perfil.</p>' : ''}
    <div class="plot" id="heat-corr"></div>
  `;

  if (partidos.length < 2) return;

  // Reconstruye matriz simetrica
  const idx = Object.fromEntries(partidos.map((p, i) => [p, i]));
  const z = Array.from({ length: partidos.length }, () => Array(partidos.length).fill(null));
  for (const p of partidos) z[idx[p]][idx[p]] = 1;
  for (const pair of pairs) {
    z[idx[pair.a]][idx[pair.b]] = pair.pearson;
    z[idx[pair.b]][idx[pair.a]] = pair.pearson;
  }

  Plotly.newPlot("heat-corr", [{
    type: "heatmap",
    z, x: partidos, y: partidos,
    zmin: -1, zmax: 1,
    colorscale: "RdBu", reversescale: true,
    text: z.map((row) => row.map((v) => v === null ? "" : v.toFixed(2))),
    texttemplate: "%{text}",
  }], {
    margin: { l: 200, b: 200, t: 20 },
    height: Math.max(500, 45 * partidos.length),
    xaxis: { tickangle: -45 },
  }, { responsive: true });
}
