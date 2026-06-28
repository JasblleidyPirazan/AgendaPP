export function renderShannon(root, ctx) {
  const concejales = ctx.metrics.concejales.filter((c) => c.n_instrumentos > 0);

  // estado de UI
  let filtroPartido = "__todos__";
  let orden = { col: "shannon_norm", dir: "desc" };

  const partidosUnicos = Array.from(new Set(concejales.map((c) => c.partido ?? "—"))).sort();

  root.innerHTML = `
    <h2>Diversidad temática individual</h2>
    <p>H normalizado por concejal. 0 = especializado en un tema, 1 = generalista perfecto.</p>
    <div class="plot" id="hist-shannon"></div>

    <div style="display:flex;gap:1rem;align-items:center;margin:1rem 0">
      <label>
        Partido:
        <select id="f-partido">
          <option value="__todos__">Todos</option>
          ${partidosUnicos.map((p) => `<option value="${escapeAttr(p)}">${p}</option>`).join("")}
        </select>
      </label>
      <span style="color:var(--muted);font-size:0.9rem" id="cuenta-filas"></span>
    </div>

    <table id="tabla-h">
      <thead>
        <tr>
          <th data-col="id">ID</th>
          <th data-col="nombre">Nombre</th>
          <th data-col="partido">Partido</th>
          <th data-col="municipio">Municipio</th>
          <th data-col="n_instrumentos">N° instrumentos</th>
          <th data-col="shannon_norm">H normalizado</th>
        </tr>
      </thead>
      <tbody id="tabla-h-body"></tbody>
    </table>
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

  function pintar() {
    const filtradas = concejales.filter((c) =>
      filtroPartido === "__todos__" || (c.partido ?? "—") === filtroPartido
    );
    filtradas.sort((a, b) => {
      const va = valorOrden(a[orden.col]);
      const vb = valorOrden(b[orden.col]);
      if (va < vb) return orden.dir === "asc" ? -1 : 1;
      if (va > vb) return orden.dir === "asc" ? 1 : -1;
      return 0;
    });
    document.getElementById("cuenta-filas").textContent = `${filtradas.length} concejales`;
    document.getElementById("tabla-h-body").innerHTML = filtradas.map((c) => `
      <tr>
        <td>${c.id}</td>
        <td>${c.nombre || "—"}</td>
        <td>${c.partido ?? "—"}</td>
        <td>${c.municipio || "—"}</td>
        <td>${c.n_instrumentos}</td>
        <td>${c.shannon_norm.toFixed(3)}</td>
      </tr>
    `).join("");

    document.querySelectorAll("#tabla-h th").forEach((th) => {
      const c = th.dataset.col;
      th.textContent = th.textContent.replace(/ [▲▼]$/, "");
      if (c === orden.col) th.textContent += orden.dir === "asc" ? " ▲" : " ▼";
    });
  }

  document.getElementById("f-partido").addEventListener("change", (e) => {
    filtroPartido = e.target.value;
    pintar();
  });

  document.querySelectorAll("#tabla-h th").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const c = th.dataset.col;
      if (orden.col === c) {
        orden.dir = orden.dir === "asc" ? "desc" : "asc";
      } else {
        orden.col = c;
        orden.dir = c === "shannon_norm" || c === "n_instrumentos" ? "desc" : "asc";
      }
      pintar();
    });
  });

  pintar();
}

function valorOrden(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v).toLowerCase();
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
