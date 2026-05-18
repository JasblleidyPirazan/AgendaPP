export function renderShannon(root, ctx) {
  const concejales = ctx.metrics.concejales.filter((c) => c.n_instrumentos > 0);

  root.innerHTML = `
    <h2>Diversidad temática individual</h2>
    <p>H normalizado por concejal. 0 = especializado en un tema, 1 = generalista perfecto.</p>
    <div class="plot" id="hist-shannon"></div>
    <h3>Top concejales</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
      <div>
        <h4>Más generalistas</h4>
        ${tabla(concejales.slice().sort((a,b) => b.shannon_norm - a.shannon_norm).slice(0, 10))}
      </div>
      <div>
        <h4>Más especializados (≥ 3 instrumentos)</h4>
        ${tabla(concejales.filter(c => c.n_instrumentos >= 3).sort((a,b) => a.shannon_norm - b.shannon_norm).slice(0, 10))}
      </div>
    </div>
  `;

  Plotly.newPlot("hist-shannon", [{
    x: concejales.map((c) => c.shannon_norm),
    type: "histogram",
    nbinsx: 20,
    marker: { color: "#3b3bb3" },
  }], {
    xaxis: { title: "H normalizado", range: [0, 1] },
    yaxis: { title: "Concejales" },
    bargap: 0.05,
    shapes: [{ type: "line", x0: 0.5, x1: 0.5, y0: 0, y1: 1, yref: "paper", line: { dash: "dash", color: "gray" } }],
    margin: { t: 20 },
  }, { responsive: true });
}

function tabla(rows) {
  if (!rows.length) return '<p class="empty">Sin datos</p>';
  return `
    <table>
      <thead><tr><th>ID</th><th>Partido</th><th>H</th><th>n</th></tr></thead>
      <tbody>
        ${rows.map((c) => `
          <tr>
            <td>${c.id}</td>
            <td>${c.partido ?? "—"}</td>
            <td>${c.shannon_norm.toFixed(3)}</td>
            <td>${c.n_instrumentos}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
