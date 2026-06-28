// Vista "Shannon por partido": diversidad de la agenda agregada de cada partido.
// H del bloque ∈ [0,1]: 0 = partido monotemático, 1 = reparte instrumentos parejo
// entre todos los temas que toca. Reemplaza a la antigua vista de CV (uniformidad).
export function renderShannonPartido(root, ctx) {
  const partidos = ctx.metrics.partidos
    .filter((p) => p.shannon_partido !== null && p.shannon_partido !== undefined)
    .sort((a, b) => b.shannon_partido - a.shannon_partido);

  root.innerHTML = `
    <h2>Diversidad temática por partido (Shannon del bloque)</h2>
    <details style="margin-bottom:1rem">
      <summary style="cursor:pointer;font-weight:600">¿Qué mide? (clic para expandir)</summary>
      <div style="padding:0.75rem 1rem;background:#fafbfd;border-left:3px solid var(--accent);margin-top:0.5rem">
        <p>Shannon normalizado sobre el <strong>perfil agregado</strong> del partido: se suman
           los instrumentos de todos sus concejales por tema y se mide qué tan repartida está
           esa agenda conjunta.</p>
        <ul>
          <li><strong>H ≈ 0</strong>: el partido concentra su actividad en muy pocos temas (agenda focalizada).</li>
          <li><strong>H ≈ 1</strong>: reparte instrumentos de forma pareja entre los temas que aborda (agenda amplia).</li>
        </ul>
        <p style="margin-bottom:0">A diferencia del Shannon individual, mide al partido como bloque,
           no a cada concejal. No mide convergencia entre concejales (eso es Jaccard).</p>
      </div>
    </details>

    ${partidos.length === 0
      ? '<p class="empty">No hay partidos con perfil temático. Ajusta los filtros de rol/municipio.</p>'
      : ''}

    <div class="plot" id="bar-hpartido"></div>

    <table>
      <thead><tr><th>Partido</th><th>Concejales</th><th>H del bloque</th><th>Lectura</th></tr></thead>
      <tbody>
        ${partidos.map((p) => `
          <tr>
            <td>${p.nombre}</td>
            <td>${p.n_concejales}</td>
            <td>${p.shannon_partido.toFixed(3)}</td>
            <td>${p.shannon_partido >= 0.66 ? "Agenda amplia"
                  : p.shannon_partido <= 0.33 ? "Agenda focalizada" : "Intermedia"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  if (partidos.length === 0) return;

  Plotly.newPlot("bar-hpartido", [{
    x: partidos.map((p) => p.shannon_partido),
    y: partidos.map((p) => p.nombre),
    type: "bar",
    orientation: "h",
    marker: { color: "#3b3bb3" },
    hovertemplate: "%{y}<br>H bloque=%{x:.3f}<extra></extra>",
  }], {
    title: { text: "Shannon del bloque por partido", font: { size: 14 } },
    xaxis: { title: "H normalizado", range: [0, 1] },
    margin: { l: 220, t: 40 },
    height: Math.max(300, 35 * partidos.length + 60),
  }, { responsive: true });
}
