// Vista Instrumentos: una fila por instrumento (id = <DANE>-<Identificador>).
// Actores (Rol + Concejal + Partido) se agregan en columnas/listas.
// Conteos y barras de frecuencia trabajan sobre instrumentos unicos.

import { construirCanon, claveNorm } from "/src/metrics.js";

export function renderInstrumentos(root, ctx) {
  if (!ctx.raw || !Array.isArray(ctx.raw.instrumentos)) {
    root.innerHTML = `<p class="empty">
      Esta vista requiere el endpoint Apps Script. Configura <code>appsScriptUrl</code> en <code>/config.json</code>.
    </p>`;
    return;
  }

  const rowsRaw = ctx.raw.instrumentos.map((r) => enriquecer({ ...r }));
  // Unifica variantes de Sector/Tematica/Partido que solo difieren en
  // mayusculas, tildes o espacios (p. ej. "Ciencia, tecnologia e Innovacion"
  // vs "...e innovacion", "DEMOCRÁTICO" vs "DEMOCRATICO"), igual que hace
  // metrics.js para los indices.
  const canonSector = construirCanon(rowsRaw.map((r) => r.Sector));
  const canonTematica = construirCanon(rowsRaw.map((r) => r.Tematica));
  const canonPartido = construirCanon(rowsRaw.map((r) => r["Partido / Movimiento"]));
  for (const r of rowsRaw) {
    if (r.Sector) r.Sector = canonSector.get(claveNorm(r.Sector)) || String(r.Sector).trim();
    if (r.Tematica) r.Tematica = canonTematica.get(claveNorm(r.Tematica)) || String(r.Tematica).trim();
    const p = r["Partido / Movimiento"];
    if (p) r["Partido / Movimiento"] = canonPartido.get(claveNorm(p)) || String(p).trim();
  }
  const instrumentos = agregarPorIdInstrumento(rowsRaw);

  const sectores = sorted(unique(instrumentos.flatMap((i) => i.Sector ? [i.Sector] : [])));
  const tematicas = sorted(unique(instrumentos.flatMap((i) => i.Tematica ? [i.Tematica] : [])));
  const partidos = sorted(unique(instrumentos.flatMap((i) => Array.from(i._partidos))));
  const concejales = sorted(unique(instrumentos.flatMap((i) => Array.from(i._concejales).filter((x) => x && x !== "ADMINISTRACION"))));

  let estado = {
    busqueda: "",
    sector: "__todos__",
    tematica: "__todos__",
    concejal: "__todos__",
    partido: "__todos__",
    soloSinTema: false,
    incluidos: "si",
    orden: { col: "id_instrumento", dir: "asc" },
  };

  root.innerHTML = `
    <h2>Instrumentos — explorador (un instrumento = una fila)</h2>
    <p>Datos crudos del endpoint Apps Script, deduplicados por <code>id_instrumento</code> = <code>&lt;DANE&gt;-&lt;Identificador&gt;</code>.
       Los filtros por concejal o partido muestran instrumentos donde <em>cualquiera</em> de los actores coincide.</p>

    <div class="filtros">
      <input type="search" id="i-busqueda" placeholder="Buscar título / id..." />
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
          <th data-col="id_instrumento">ID</th>
          <th data-col="Anio">Año</th>
          <th data-col="Titulo">Título</th>
          <th data-col="Sector">Sector</th>
          <th data-col="Tematica">Temática</th>
          <th data-col="_rolesStr">Actores</th>
          <th data-col="Incluir en analisis">Incluir</th>
        </tr>
      </thead>
      <tbody id="tabla-i-body"></tbody>
    </table>
  `;

  // listeners
  document.getElementById("i-busqueda").addEventListener("input", (e) => { estado.busqueda = e.target.value.toLowerCase(); pintar(); });
  document.getElementById("i-sector").addEventListener("change", (e) => { estado.sector = e.target.value; pintar(); });
  document.getElementById("i-tematica").addEventListener("change", (e) => { estado.tematica = e.target.value; pintar(); });
  document.getElementById("i-concejal").addEventListener("change", (e) => { estado.concejal = e.target.value; pintar(); });
  document.getElementById("i-partido").addEventListener("change", (e) => { estado.partido = e.target.value; pintar(); });
  document.getElementById("i-soloSinTema").addEventListener("change", (e) => { estado.soloSinTema = e.target.checked; pintar(); });
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
    let base = instrumentos;
    if (estado.incluidos === "si") base = base.filter((i) => i._incluir === "si");
    else if (estado.incluidos === "no") base = base.filter((i) => i._incluir === "no");

    const filtradas = base.filter((i) => {
      if (estado.sector !== "__todos__" && i.Sector !== estado.sector) return false;
      if (estado.tematica !== "__todos__" && i.Tematica !== estado.tematica) return false;
      if (estado.concejal !== "__todos__" && !i._concejales.has(estado.concejal)) return false;
      if (estado.partido !== "__todos__" && !i._partidos.has(estado.partido)) return false;
      if (estado.soloSinTema && i.Tematica) return false;
      if (estado.busqueda) {
        const hay = `${i.id_instrumento ?? ""} ${i.Titulo ?? ""}`.toLowerCase();
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

    const cuenta = document.getElementById("i-cuenta");
    cuenta.textContent = `${filtradas.length} instrumentos únicos`;
    if (filtradas.length > 0) {
      const sinTema = filtradas.filter((f) => !f.Tematica).length;
      if (sinTema > 0) cuenta.textContent += ` — ${sinTema} sin Temática`;
    }

    const muestra = filtradas.slice(0, 500);
    document.getElementById("tabla-i-body").innerHTML = muestra.map((i) => `
      <tr>
        <td><code>${i.id_instrumento ?? "—"}</code></td>
        <td>${i.Anio ?? "—"}</td>
        <td title="${escapeAttr(i.Titulo ?? "")}">${(i.Titulo ?? "").slice(0, 80)}${(i.Titulo ?? "").length > 80 ? "…" : ""}</td>
        <td>${i.Sector || '<span class="tag-bad">—</span>'}</td>
        <td>${i.Tematica || '<span class="tag-bad">—</span>'}</td>
        <td style="font-size:0.85rem">${i._actoresHTML}</td>
        <td>${i._incluir === "si" ? "Si" : i._incluir === "no" ? '<span class="tag-bad">No</span>' : "—"}</td>
      </tr>
    `).join("");
    if (filtradas.length > 500) {
      document.getElementById("tabla-i-body").innerHTML += `
        <tr><td colspan="7" style="text-align:center;color:var(--muted);font-style:italic">
          ... mostrando primeros 500 de ${filtradas.length}. Refina los filtros para ver el resto.
        </td></tr>`;
    }

    document.querySelectorAll("#tabla-i th").forEach((th) => {
      th.textContent = th.textContent.replace(/ [▲▼]$/, "");
      if (th.dataset.col === estado.orden.col) th.textContent += estado.orden.dir === "asc" ? " ▲" : " ▼";
    });

    pintarFrecuencias(filtradas);
  }

  function pintarFrecuencias(unicos) {
    document.getElementById("freq-bars").innerHTML = `
      <div id="freq-sector"></div>
      <div id="freq-tematica"></div>
    `;
    pintarBarras("freq-sector", "Instrumentos únicos por Sector", unicos, "Sector");
    pintarBarras("freq-tematica", "Instrumentos únicos por Temática", unicos, "Tematica");
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
      marker: { color: pares.map((p) => p[0] === "(vacío)" ? "#dc2626" : "#4f46e5") },
    }], {
      title: { text: titulo, font: { size: 14 } },
      margin: { l: 200, r: 20, t: 40, b: 40 },
      height: Math.max(220, 22 * pares.length + 60),
      xaxis: { title: "Instrumentos únicos" },
    }, { responsive: true, displayModeBar: false });
  }

  pintar();
}

// --- agregacion + helpers ---

function enriquecer(r) {
  // garantiza id_instrumento si Apps Script aun no lo trae
  if (!r.id_instrumento && r["Codigo DANE"] && r.Identificador) {
    const dane = String(r["Codigo DANE"]).padStart(5, "0");
    r.id_instrumento = `${dane}-${String(r.Identificador).trim()}`;
  }
  return r;
}

function agregarPorIdInstrumento(rows) {
  const map = new Map();
  for (const r of rows) {
    const id = r.id_instrumento;
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        id_instrumento: id,
        Anio: r.Anio,
        Titulo: r.Titulo,
        Sector: r.Sector || "",
        Tematica: r.Tematica || "",
        _incluir: String(r["Incluir en analisis"] ?? "").toLowerCase(),
        _actores: [],
        _concejales: new Set(),
        _partidos: new Set(),
        _roles: new Set(),
      });
    }
    const g = map.get(id);
    // si llegan distintos Sector/Tematica para el mismo instrumento, mantenemos el primero no vacio
    if (!g.Sector && r.Sector) g.Sector = r.Sector;
    if (!g.Tematica && r.Tematica) g.Tematica = r.Tematica;
    g._actores.push({
      rol: r.Rol ?? "",
      id_concejal: r.ID_Concejal ?? "",
      nombre: r["Nombre actor"] ?? "",
      partido: r["Partido / Movimiento"] ?? "",
    });
    if (r.ID_Concejal) g._concejales.add(r.ID_Concejal);
    if (r["Partido / Movimiento"]) g._partidos.add(r["Partido / Movimiento"]);
    if (r.Rol) g._roles.add(r.Rol);
  }
  for (const g of map.values()) {
    g._actoresHTML = renderActores(g._actores);
    g._rolesStr = Array.from(g._roles).sort().join(", "); // para ordenar columna
  }
  return Array.from(map.values());
}

function renderActores(actores) {
  // agrupa por rol para legibilidad
  const porRol = {};
  for (const a of actores) {
    (porRol[a.rol || "—"] ??= []).push(a);
  }
  return Object.keys(porRol).sort().map((rol) => {
    const lista = porRol[rol].map((a) => {
      const ident = a.nombre || a.id_concejal || "—";
      const partido = a.partido ? ` <span style="color:var(--muted)">(${escapeAttr(a.partido)})</span>` : "";
      return `${escapeAttr(ident)}${partido}`;
    }).join("; ");
    return `<strong>${escapeAttr(rol)}:</strong> ${lista}`;
  }).join("<br>");
}

function unique(arr) { return Array.from(new Set(arr)); }
function sorted(arr) { return arr.slice().sort((a, b) => String(a).localeCompare(String(b), "es")); }

function valorOrden(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!isNaN(n) && String(v).trim() !== "") return n;
  return String(v).toLowerCase();
}

function escapeAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
