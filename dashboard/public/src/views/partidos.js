// Vista Partidos: panorama de partidos consolidados con foco en deteccion
// de inconsistencias entre municipios (mismos partidos escritos distinto).

export function renderPartidos(root, ctx) {
  if (!ctx.raw || !Array.isArray(ctx.raw.concejales)) {
    root.innerHTML = `<p class="empty">
      Esta vista requiere el endpoint Apps Script. Configura <code>appsScriptUrl</code> en <code>/config.json</code>.
    </p>`;
    return;
  }

  const municipios = (ctx.raw.municipios || []).map((m) => m.municipio).filter(Boolean);
  const concejales = ctx.raw.concejales;

  // Agregamos por nombre exacto de partido
  const porPartido = new Map(); // partido -> {municipios:Set, concejales:[]}
  for (const c of concejales) {
    const p = (c["Partido / Movimiento"] || "").trim();
    if (!p) continue;
    if (!porPartido.has(p)) porPartido.set(p, { municipios: new Set(), concejales: [] });
    const g = porPartido.get(p);
    if (c.municipio) g.municipios.add(c.municipio);
    g.concejales.push(c);
  }

  const filas = Array.from(porPartido.entries()).map(([nombre, g]) => ({
    nombre,
    n_municipios: g.municipios.size,
    municipios: Array.from(g.municipios).sort(),
    n_concejales: g.concejales.length,
    concejales: g.concejales,
  }));

  const totales = filas.length;
  const enVariosMunicipios = filas.filter((f) => f.n_municipios > 1).length;
  const sospechosos = detectarDuplicados(filas);

  // tabla cruzada partido x municipio (conteo de concejales)
  const cruzada = construirCruzada(filas, municipios);

  let orden = { col: "n_concejales", dir: "desc" };

  root.innerHTML = `
    <h2>Partidos</h2>
    <p>Panorama de partidos consolidados desde los <code>MaestroConcejales</code> de cada municipio.
       Útil para detectar duplicaciones por nombres no estandarizados.</p>

    <div class="cards">
      <div class="card"><div class="label">Partidos únicos</div><div class="value">${totales}</div></div>
      <div class="card"><div class="label">Municipios</div><div class="value">${municipios.length}</div></div>
      <div class="card"><div class="label">En &gt; 1 municipio</div><div class="value">${enVariosMunicipios}</div></div>
      <div class="card"><div class="label">Posibles duplicados</div><div class="value" style="color:${sospechosos.length ? 'var(--bad)' : 'var(--ok)'}">${sospechosos.length}</div></div>
    </div>

    ${sospechosos.length ? `
      <h3 style="color:var(--bad)">⚠ Posibles duplicados</h3>
      <p style="color:var(--muted);font-size:0.9rem">
        Agrupa partidos cuyos nombres normalizados (mayúsculas, sin tildes, sin signos)
        comparten al menos 60% de tokens. Revisa si son el mismo partido escrito distinto;
        en ese caso, unifica el nombre en el <code>MaestroPartidos</code> y en
        <code>Partido / Movimiento</code> de cada hoja afectada.
      </p>
      <table>
        <thead><tr><th>Forma normalizada</th><th>Variantes</th><th>Municipios involucrados</th></tr></thead>
        <tbody>
          ${sospechosos.map((g) => `
            <tr>
              <td><code>${g.norm}</code></td>
              <td>${g.variantes.map((v) => `<div><strong>${v.nombre}</strong> <span style="color:var(--muted)">— ${v.n_concejales} concejal(es)</span></div>`).join("")}</td>
              <td>${Array.from(new Set(g.variantes.flatMap((v) => v.municipios))).sort().join(", ")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : ""}

    <h3>Listado de partidos</h3>
    <table id="tabla-partidos">
      <thead>
        <tr>
          <th data-col="nombre">Partido</th>
          <th data-col="n_municipios"># Municipios</th>
          <th data-col="n_concejales"># Concejales</th>
          <th data-col="municipios">Municipios</th>
        </tr>
      </thead>
      <tbody id="tabla-partidos-body"></tbody>
    </table>

    <h3 style="margin-top:2rem">Partido × Municipio (concejales por celda)</h3>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Partido</th>${municipios.map((m) => `<th>${m}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>
          ${cruzada.map((row) => `
            <tr>
              <td>${row.partido}</td>
              ${municipios.map((m) => `<td style="text-align:center">${row.cuentas[m] || '<span style="color:var(--muted)">·</span>'}</td>`).join("")}
              <td style="text-align:center;font-weight:600">${row.total}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.querySelectorAll("#tabla-partidos th").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const c = th.dataset.col;
      if (orden.col === c) orden.dir = orden.dir === "asc" ? "desc" : "asc";
      else orden = { col: c, dir: c === "nombre" || c === "municipios" ? "asc" : "desc" };
      pintar();
    });
  });

  function pintar() {
    filas.sort((a, b) => {
      const va = valorOrden(a[orden.col]);
      const vb = valorOrden(b[orden.col]);
      if (va < vb) return orden.dir === "asc" ? -1 : 1;
      if (va > vb) return orden.dir === "asc" ? 1 : -1;
      return 0;
    });
    document.getElementById("tabla-partidos-body").innerHTML = filas.map((f) => `
      <tr>
        <td>${f.nombre}</td>
        <td>${f.n_municipios}</td>
        <td>${f.n_concejales}</td>
        <td style="font-size:0.85rem">${f.municipios.join(", ")}</td>
      </tr>
    `).join("");
    document.querySelectorAll("#tabla-partidos th").forEach((th) => {
      th.textContent = th.textContent.replace(/ [▲▼]$/, "");
      if (th.dataset.col === orden.col) th.textContent += orden.dir === "asc" ? " ▲" : " ▼";
    });
  }
  pintar();
}

// --- helpers ---

function valorOrden(v) {
  if (Array.isArray(v)) return v.join(",").toLowerCase();
  if (typeof v === "number") return v;
  return String(v ?? "").toLowerCase();
}

function normalizarNombre(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // sin tildes
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  // saca tokens cortos comunes para que "PARTIDO LIBERAL" y "PARTIDO LIBERAL COLOMBIANO"
  // compartan el grueso (LIBERAL) y solo difieran en COLOMBIANO.
  const STOP = new Set(["PARTIDO", "MOVIMIENTO", "POLITICO", "DE", "LA", "EL", "DEL", "POR", "PARA", "Y", "COLOMBIA", "COLOMBIANO", "COLOMBIANA"]);
  return new Set(normalizarNombre(s).split(" ").filter((t) => t && !STOP.has(t)));
}

function jaccard(a, b) {
  const inter = new Set([...a].filter((x) => b.has(x)));
  const uni = new Set([...a, ...b]);
  return uni.size ? inter.size / uni.size : 0;
}

function detectarDuplicados(filas) {
  // Agrupa filas cuyos tokens (post-stopwords) sean iguales o muy similares.
  const grupos = new Map(); // signature -> [filas]
  for (const f of filas) {
    const tks = tokens(f.nombre);
    if (tks.size === 0) continue;
    // signature = tokens ordenados (igualdad exacta cubre el caso "CONSERVADOR COLOMBIANO" vs "CONSERVADOR")
    const sig = Array.from(tks).sort().join(" ");
    if (!grupos.has(sig)) grupos.set(sig, []);
    grupos.get(sig).push(f);
  }
  const sospechosos = [];
  // 1) Grupos exactos con >1 variante de nombre crudo
  for (const [sig, lista] of grupos.entries()) {
    if (lista.length < 2) continue;
    const nombres = new Set(lista.map((x) => x.nombre));
    if (nombres.size < 2) continue;
    sospechosos.push({ norm: sig, variantes: lista });
  }
  // 2) Fuzzy entre grupos distintos cuya Jaccard de tokens > 0.6
  //    (captura "CONSERVADOR" vs "CONSERVADOR COLOMBIANO" cuando "COLOMBIANO" no es stopword)
  const sigs = Array.from(grupos.keys());
  const yaAgrupados = new Set(sospechosos.map((s) => s.norm));
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      const ta = new Set(sigs[i].split(" "));
      const tb = new Set(sigs[j].split(" "));
      const j_ab = jaccard(ta, tb);
      if (j_ab >= 0.6 && !(yaAgrupados.has(sigs[i]) && yaAgrupados.has(sigs[j]))) {
        sospechosos.push({
          norm: `${sigs[i]} ↔ ${sigs[j]} (J=${j_ab.toFixed(2)})`,
          variantes: [...grupos.get(sigs[i]), ...grupos.get(sigs[j])],
        });
        yaAgrupados.add(sigs[i]); yaAgrupados.add(sigs[j]);
      }
    }
  }
  return sospechosos;
}

function construirCruzada(filas, municipios) {
  return filas
    .map((f) => {
      const cuentas = {};
      for (const c of f.concejales) {
        if (!c.municipio) continue;
        cuentas[c.municipio] = (cuentas[c.municipio] || 0) + 1;
      }
      return { partido: f.nombre, cuentas, total: f.n_concejales };
    })
    .sort((a, b) => b.total - a.total);
}
