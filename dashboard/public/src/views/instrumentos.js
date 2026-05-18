export function renderInstrumentos(root, ctx) {
  if (!ctx.raw || !Array.isArray(ctx.raw.instrumentos)) {
    root.innerHTML = `<p class="empty">
      Esta vista requiere el endpoint Apps Script. Configura <code>appsScriptUrl</code> en <code>/config.json</code>.
    </p>`;
    return;
  }

  // Solo instrumentos "incluidos" + dedup por Identificador (un instrumento aparece varias veces, una por rol)
  const todos = ctx.raw.instrumentos;
  const incluidosUnicos = dedupPorIdentificador(
    todos.filter((i) => String(i["Incluir en analisis"]).toLowerCase() === "si")
  );

  const sectores = sorted(unique(incluidosUnicos.map((i) => i.Sector).filter(Boolean)));
  const tematicas = sorted(unique(incluidosUnicos.map((i) => i.Tematica).filter(Boolean)));
  const concejales = sorted(unique(todos.map((i) => i.ID_Concejal).filter((x) => x && x !== "ADMINISTRACION")));
  const partidos = sorted(unique(todos.map((i) => i["Partido / Movimiento"]).filter(Boolean)));

  // estado UI
  let estado = {
    busqueda: "",
    sector: "__todos__",
    tematica: "__todos__",
    concejal: "__todos__",
    partido: "__todos__",
    soloSiTema: false,
    incluidos: "si",
    orden: { col: "Anio", dir: "asc" },
  };

  root.innerHTML = `
    <h2>Instrumentos — explorador de datos</h2>
    <p>Vista para detectar errores y entender la distribución. Datos crudos del endpoint Apps Script.</p>

    <div class="filtros">
      <input type="search" id="i-busqueda" placeholder="Buscar título / identificador..." />
      <select id="i-incluidos">
        <option value="si">Solo incluidos (Si)</option>
        <option value="no">Solo excluidos (No)</option>
        <option value="todos">Todos</option>
      </select>
      <select id="i-sector">
        <option value="__todos__">Sector: todos</option>
        ${sectores.map((s) => `<option value="${escapeAttr(s)}">${s}</option>`).join("")}
      </select>
      <select id="i-tematica">
        <option value="__todos__">Temática: todas</option>
        ${tematicas.map((t) => `<option value="${escapeAttr(t)}">${t}</option>`).join("")}
      </select>
      <select id="i-partido">
        <option value="__todos__">Partido: todos</option>
        ${partidos.map((p) => `<option value="${escapeAttr(p)}">${p}</option>`).join("")}
      </select>
      <select id="i-concejal">
        <option value="__todos__">Concejal: todos</option>
        ${concejales.map((c) => `<option value="${escapeAttr(c)}">${c}</option>`).join("")}
      </select>
      <label style="font-size:0.85rem;color:var(--muted)">
        <input type="checkbox" id="i-soloSinTema" /> solo sin Temática
      </label>
    </div>

    <div id="freq-bars" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0"></div>

    <div style="margin:0.5rem 0;color:var(--muted);font-size:0.9rem" id="i-cuenta"></div>

    <table id="tabla-i">
      <thead>
        <tr>
          <th data-col="Identificador">Identificador</th>
          <th data-col="Anio">Año</th>
          <th data-col="Titulo">Título</th>
          <th data-col="Sector">Sector</th>
          <th data-col="Tematica">Temática</th>
          <th data-col="Rol">Rol</th>
          <th data-col="ID_Concejal">Concejal</th>
          <th data-col="Partido / Movimiento">Partido</th>
          <th data-col="Incluir en analisis">Incluir</th>
        </tr>
      </thead>
      <tbody id="tabla-i-body"></tbody>
    </table>
  `;

  document.getElementById("i-busqueda").addEventListener("input", (e) => { estado.busqueda = e.target.value.toLowerCase(); pintar(); });
  document.getElementById("i-sector").addEventListener("change", (e) => { estado.sector = e.target.value; pintar(); });
  document.getElementById("i-tematica").addEventListener("change", (e) => { estado.tematica = e.target.value; pintar(); });
  document.getElementById("i-concejal").addEventListener("change", (e) => { estado.concejal = e.target.value; pintar(); });
  document.getElementById("i-partido").addEventListener("change", (e) => { estado.partido = e.target.value; pintar(); });
  document.getElementById("i-soloSinTema").addEventListener("change", (e) => { estado.soloSiTema = e.target.checked; pintar(); });
  document.getElementById("i-incluidos").addEventListener("change", (e) => { estado.incluidos = e.target.value; pintar(); });

  document.querySelectorAll("#tabla-i th").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const c = th.dataset.col;
      if (estado.orden.col === c) {
        estado.orden.dir = estado.orden.dir === "asc" ? "desc" : "asc";
      } else {
        estado.orden = { col: c, dir: "asc" };
      }
      pintar();
    });
  });

  function pintar() {
    let base;
    if (estado.incluidos === "si") base = todos.filter((i) => String(i["Incluir en analisis"]).toLowerCase() === "si");
    else if (estado.incluidos === "no") base = todos.filter((i) => String(i["Incluir en analisis"]).toLowerCase() === "no");
    else base = todos.slice();

    const filtradas = base.filter((i) => {
      if (estado.sector !== "__todos__" && i.Sector !== estado.sector) return false;
      if (estado.tematica !== "__todos__" && i.Tematica !== estado.tematica) return false;
      if (estado.concejal !== "__todos__" && i.ID_Concejal !== estado.concejal) return false;
      if (estado.partido !== "__todos__" && i["Partido / Movimiento"] !== estado.partido) return false;
      if (estado.soloSiTema && i.Tematica) return false;
      if (estado.busqueda) {
        const hay = `${i.Identificador ?? ""} ${i.Titulo ?? ""}`.toLowerCase();
        if (!hay.includes(estado.busqueda)) return false;
      }
      return true;
    });

    filtradas.sort((a, b) => {
      const va = valorOrden(a[estado.orden.col]);
      const vb = valorOrden(b[estado.orden.col]);
      if (va < vb) return estado.orden.dir === "asc" ? -1 : 1;
      if (va > vb) return estado.orden.dir === "asc" ? 1 : -1;
      return 0;
    });

    document.getElementById("i-cuenta").textContent =
      `${filtradas.length} filas (instrumento × rol). Identificadores únicos: ${unique(filtradas.map((f) => f.Identificador)).length}`;

    // Tabla (limita a 500 para perf)
    const muestra = filtradas.slice(0, 500);
    document.getElementById("tabla-i-body").innerHTML = muestra.map((i) => `
      <tr>
        <td>${i.Identificador ?? "—"}</td>
        <td>${i.Anio ?? "—"}</td>
        <td title="${escapeAttr(i.Titulo ?? "")}">${(i.Titulo ?? "").slice(0, 80)}${(i.Titulo ?? "").length > 80 ? "…" : ""}</td>
        <td>${i.Sector ?? "<span class='tag-bad'>—</span>"}</td>
        <td>${i.Tematica ?? "<span class='tag-bad'>—</span>"}</td>
        <td>${i.Rol ?? "—"}</td>
        <td>${i.ID_Concejal ?? "—"}</td>
        <td>${i["Partido / Movimiento"] ?? "—"}</td>
        <td>${i["Incluir en analisis"] ?? "—"}</td>
      </tr>
    `).join("");
    if (filtradas.length > 500) {
      document.getElementById("tabla-i-body").innerHTML += `
        <tr><td colspan="9" style="text-align:center;color:var(--muted);font-style:italic">
          ... mostrando primeros 500 de ${filtradas.length}. Refina los filtros para ver el resto.
        </td></tr>`;
    }

    // Marcar header activo
    document.querySelectorAll("#tabla-i th").forEach((th) => {
      th.textContent = th.textContent.replace(/ [▲▼]$/, "");
      if (th.dataset.col === estado.orden.col) th.textContent += estado.orden.dir === "asc" ? " ▲" : " ▼";
    });

    // Frecuencias
    pintarFrecuencias(dedupPorIdentificador(filtradas));
  }

  function pintarFrecuencias(unicos) {
    const root = document.getElementById("freq-bars");
    root.innerHTML = `
      <div id="freq-sector"></div>
      <div id="freq-tematica"></div>
    `;
    pintarBarras("freq-sector", "Instrumentos por Sector", unicos, "Sector");
    pintarBarras("freq-tematica", "Instrumentos por Temática", unicos, "Tematica");
  }

  function pintarBarras(elId, titulo, datos, campo) {
    const cuenta = {};
    datos.forEach((d) => {
      const k = d[campo] || "(vacío)";
      cuenta[k] = (cuenta[k] || 0) + 1;
    });
    const pares = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
    Plotly.newPlot(elId, [{
      type: "bar",
      orientation: "h",
      x: pares.map((p) => p[1]),
      y: pares.map((p) => p[0]),
      marker: { color: pares.map((p) => p[0] === "(vacío)" ? "#d62728" : "#3b3bb3") },
    }], {
      title: { text: titulo, font: { size: 14 } },
      margin: { l: 180, r: 20, t: 40, b: 40 },
      height: Math.max(220, 22 * pares.length + 60),
      xaxis: { title: "Instrumentos únicos" },
    }, { responsive: true, displayModeBar: false });
  }

  pintar();
}

// --- helpers ---

function unique(arr) { return Array.from(new Set(arr)); }
function sorted(arr) { return arr.slice().sort((a, b) => String(a).localeCompare(String(b), "es")); }

function dedupPorIdentificador(arr) {
  const vistos = new Set();
  return arr.filter((i) => {
    if (vistos.has(i.Identificador)) return false;
    vistos.add(i.Identificador);
    return true;
  });
}

function valorOrden(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!isNaN(n) && String(v).trim() !== "") return n;
  return String(v).toLowerCase();
}

function escapeAttr(s) { return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
