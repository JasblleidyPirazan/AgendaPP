import { claveNorm } from "/src/metrics.js";

export function renderAuditoria(root, ctx) {
  if (!ctx.raw) {
    root.innerHTML = `<p class="empty">
      La auditoría necesita la data cruda del endpoint Apps Script y no cargó.
      Usa el botón <strong>↻ Reintentar</strong> del aviso de arriba (o <strong>↻ Recalcular</strong>);
      si persiste, verifica <code>appsScriptUrl</code> en <code>/config.json</code>.
    </p>`;
    return;
  }

  const validaciones = ctx.raw.validaciones || [];
  const instrumentos = ctx.raw.instrumentos || [];

  // --- Diagnóstico por municipio: por qué entran (o no) los instrumentos al análisis ---
  const porMun = new Map();
  const norm = (v) => String(v ?? "").trim();
  for (const r of instrumentos) {
    if (!norm(r.Identificador)) continue;
    const mun = norm(r.municipio_origen) || norm(r.municipio) || "(sin municipio)";
    if (!porMun.has(mun)) porMun.set(mun, {
      total: 0, incSi: 0, incNo: 0, incVacio: 0,
      conTema: 0, conSector: 0, conId: 0, conNombre: 0, roles: new Set(),
    });
    const g = porMun.get(mun);
    g.total++;
    const inc = norm(r["Incluir en analisis"]).toLowerCase();
    if (inc === "si" || inc === "sí") g.incSi++;
    else if (inc === "no") g.incNo++;
    else g.incVacio++;
    if (norm(r.Tematica)) g.conTema++;
    if (norm(r.Sector)) g.conSector++;
    if (norm(r.ID_Concejal)) g.conId++;
    if (norm(r["Nombre actor"])) g.conNombre++;
    if (norm(r.Rol)) g.roles.add(norm(r.Rol));
  }
  const filasMun = Array.from(porMun.entries())
    .map(([mun, g]) => ({ mun, ...g, roles: Array.from(g.roles).sort().join(", ") || "—" }))
    .sort((a, b) => a.mun.localeCompare(b.mun, "es"));

  const diagMunicipios = `
    <h3>Diagnóstico por municipio</h3>
    <p style="color:var(--muted);font-size:0.9rem">
      Para entrar al análisis, una fila necesita: <strong>Incluir="Si"</strong> + <strong>ID_Concejal</strong> +
      tema (<strong>Sector</strong> o <strong>Tematica</strong>). Si un municipio tiene "Incluir Si" o "ID_Concejal" en 0,
      sus instrumentos no se cuentan aunque estén cargados.
    </p>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Municipio</th><th>Filas</th><th>Inc. Si</th><th>Inc. No</th><th>Inc. vacío</th>
          <th>c/Tematica</th><th>c/Sector</th><th>c/ID_Concejal</th><th>c/Nombre actor</th><th>Roles</th>
        </tr></thead>
        <tbody>
          ${filasMun.map((f) => `
            <tr>
              <td><strong>${f.mun}</strong></td>
              <td style="text-align:center">${f.total}</td>
              <td style="text-align:center" class="${f.incSi ? 'tag-ok' : 'tag-bad'}">${f.incSi}</td>
              <td style="text-align:center">${f.incNo}</td>
              <td style="text-align:center">${f.incVacio}</td>
              <td style="text-align:center">${f.conTema}</td>
              <td style="text-align:center">${f.conSector}</td>
              <td style="text-align:center" class="${f.conId ? 'tag-ok' : 'tag-bad'}">${f.conId}</td>
              <td style="text-align:center">${f.conNombre}</td>
              <td style="font-size:0.8rem">${f.roles}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  // --- Instrumentos (únicos) con Sector Y Temática vacíos ---
  // Se agrega por id_instrumento porque un instrumento aparece en varias filas
  // (una por actor): basta con que UNA fila traiga Sector o Tematica.
  // Solo se reportan los que ENTRAN al procesamiento: igual que el pipeline,
  // se incluye todo salvo lo marcado "No" (el vacio cuenta como incluido).
  const porInst = new Map();
  for (const r of instrumentos) {
    if (!norm(r.Identificador)) continue;
    const dane = norm(r["Codigo DANE"]).padStart(5, "0");
    const id = norm(r.id_instrumento) || `${dane}-${norm(r.Identificador)}`;
    if (!porInst.has(id)) porInst.set(id, {
      id,
      mun: norm(r.municipio_origen) || norm(r.municipio) || "(sin municipio)",
      anio: norm(r.Anio) || "—",
      titulo: norm(r.Titulo),
      incluir: norm(r["Incluir en analisis"]) || "—",
      incluido: false,
      conSector: false,
      conTema: false,
    });
    const g = porInst.get(id);
    if (norm(r["Incluir en analisis"]).toLowerCase() !== "no") g.incluido = true;
    if (norm(r.Sector)) g.conSector = true;
    if (norm(r.Tematica)) g.conTema = true;
    if (!g.titulo && norm(r.Titulo)) g.titulo = norm(r.Titulo);
  }
  const sinSectorNiTema = Array.from(porInst.values())
    .filter((i) => i.incluido && !i.conSector && !i.conTema)
    .sort((a, b) => a.mun.localeCompare(b.mun, "es") || a.id.localeCompare(b.id, "es"));

  const sinTemaPorMun = new Map();
  for (const i of sinSectorNiTema) {
    sinTemaPorMun.set(i.mun, (sinTemaPorMun.get(i.mun) || 0) + 1);
  }
  const resumenSinTema = Array.from(sinTemaPorMun.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));

  const MAX_SIN_TEMA = 300;
  const seccionSinTema = `
    <h3 style="margin-top:2rem">Instrumentos incluidos sin Sector ni Temática (${sinSectorNiTema.length})</h3>
    <p style="color:var(--muted);font-size:0.9rem">
      Instrumentos únicos que <strong>entran al procesamiento</strong> (Incluir = "Si" o vacío; los marcados "No" se omiten)
      pero donde <strong>ninguna</strong> fila trae Sector ni Tematica.
      En las gráficas aparecen como <strong>(vacío)</strong> y no aportan a los índices: hay que completarlos en el Sheet del municipio.
    </p>
    ${sinSectorNiTema.length === 0
      ? '<p class="empty">Todos los instrumentos tienen Sector o Temática ✔</p>'
      : `
        <table style="max-width:480px">
          <thead><tr><th>Municipio</th><th>Instrumentos sin Sector ni Temática</th></tr></thead>
          <tbody>
            ${resumenSinTema.map(([mun, n]) => `
              <tr><td><strong>${mun}</strong></td><td style="text-align:center" class="tag-bad">${n}</td></tr>
            `).join("")}
          </tbody>
        </table>

        <div style="overflow-x:auto;margin-top:1rem">
          <table>
            <thead><tr><th>ID</th><th>Municipio</th><th>Año</th><th>Título</th><th>Incluir</th></tr></thead>
            <tbody>
              ${sinSectorNiTema.slice(0, MAX_SIN_TEMA).map((i) => `
                <tr>
                  <td><code>${i.id}</code></td>
                  <td>${i.mun}</td>
                  <td style="text-align:center">${i.anio}</td>
                  <td>${(i.titulo || "—").slice(0, 90)}${i.titulo.length > 90 ? "…" : ""}</td>
                  <td style="text-align:center">${i.incluir}</td>
                </tr>
              `).join("")}
              ${sinSectorNiTema.length > MAX_SIN_TEMA
                ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-style:italic">
                    ... mostrando primeros ${MAX_SIN_TEMA} de ${sinSectorNiTema.length}.
                  </td></tr>`
                : ""}
            </tbody>
          </table>
        </div>
      `}
  `;

  // --- Instrumentos con "Clasificacion legal" inconsistente entre filas ---
  // Un instrumento (id_instrumento) deberia tener UNA sola clasificacion legal.
  // Si unas filas lo registran como "Acuerdo" y otras como "Proyecto de
  // Acuerdo", los contadores por clasificacion lo cuentan en ambas y la suma
  // por clase supera el total de instrumentos unicos.
  const clasifPorInst = new Map(); // id -> {mun, clases: Map(clase -> {n, titulos:Map}), titulosNorm:Set}
  const tituloNorm = (t) => norm(t).toLowerCase().replace(/\s+/g, " ");
  for (const r of instrumentos) {
    if (!norm(r.Identificador)) continue;
    if (norm(r["Incluir en analisis"]).toLowerCase() === "no") continue;
    const dane = norm(r["Codigo DANE"]).padStart(5, "0");
    const id = norm(r.id_instrumento) || `${dane}-${norm(r.Identificador)}`;
    if (!clasifPorInst.has(id)) clasifPorInst.set(id, {
      id,
      mun: norm(r.municipio_origen) || norm(r.municipio) || "(sin municipio)",
      clases: new Map(),
      titulosNorm: new Set(),
    });
    const g = clasifPorInst.get(id);
    const clase = norm(r["Clasificacion legal"]) || "(sin clasif.)";
    if (!g.clases.has(clase)) g.clases.set(clase, { n: 0, titulos: new Map() });
    const gc = g.clases.get(clase);
    gc.n++;
    const t = norm(r.Titulo);
    if (t) {
      const tn = tituloNorm(t);
      g.titulosNorm.add(tn);
      if (!gc.titulos.has(tn)) gc.titulos.set(tn, t);
    }
  }
  // Dos diagnosticos distintos:
  //  - mismo titulo en todas las filas -> clasificacion mixta del mismo instrumento (unificar clase)
  //  - titulos distintos entre clases  -> posible colision de Identificador: dos instrumentos
  //    diferentes (p. ej. Acuerdo 002-2015 y Proyecto de Acuerdo 002-2015) fusionados en un id
  const clasifInconsistentes = Array.from(clasifPorInst.values())
    .filter((g) => g.clases.size > 1)
    .map((g) => ({ ...g, colision: g.titulosNorm.size > 1 }))
    .sort((a, b) => (b.colision ? 1 : 0) - (a.colision ? 1 : 0) || a.mun.localeCompare(b.mun, "es") || a.id.localeCompare(b.id, "es"));

  const inconPorMun = new Map();
  for (const g of clasifInconsistentes) {
    inconPorMun.set(g.mun, (inconPorMun.get(g.mun) || 0) + 1);
  }
  const resumenIncon = Array.from(inconPorMun.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));

  const MAX_INCON = 300;
  const nColision = clasifInconsistentes.filter((g) => g.colision).length;
  const nMixta = clasifInconsistentes.length - nColision;

  const celdaClasesAud = (g) => Array.from(g.clases.entries())
    .sort((a, b) => b[1].n - a[1].n)
    .map(([c, e]) => {
      const ts = Array.from(e.titulos.values());
      const t = ts.length ? ` — «${ts.map((x) => x.slice(0, 70)).join("» / «")}»` : "";
      return `<div><strong>${c}</strong> (${e.n} fila${e.n === 1 ? "" : "s"})${t}</div>`;
    }).join("");

  const seccionClasif = `
    <h3 style="margin-top:2rem">Identificadores con más de una Clasificación legal (${clasifInconsistentes.length})</h3>
    <p style="color:var(--muted);font-size:0.9rem">
      El sistema identifica cada instrumento como <code>DANE-Identificador</code>. Si ese identificador
      aparece con <strong>más de una</strong> "Clasificación legal", hay dos causas posibles:
    </p>
    <ul style="color:var(--muted);font-size:0.9rem;margin-top:0">
      <li><strong class="tag-bad">Posible colisión (${nColision})</strong>: los títulos difieren entre
        clasificaciones → probablemente son <em>dos instrumentos distintos</em> (p. ej. un
        <em>Acuerdo 002-2015</em> y un <em>Proyecto de Acuerdo 002-2015</em>) que comparten número y el
        sistema fusiona en uno. Corrección: diferenciar el <strong>Identificador</strong> en el Sheet
        (p. ej. <code>PA-002-2015</code> vs <code>A-002-2015</code>) para que cuenten por separado.</li>
      <li><strong style="color:var(--warn)">Clasificación mixta (${nMixta})</strong>: mismo título en
        todas las filas → es <em>el mismo instrumento</em> con la clasificación mal digitada en algunas
        filas. Corrección: unificar la "Clasificación legal" de todas sus filas.</li>
    </ul>
    <p style="color:var(--muted);font-size:0.9rem">
      En ambos casos, en los contadores por clasificación el identificador se cuenta en <strong>cada</strong>
      clase donde aparece, por eso la suma por clasificación supera el total de instrumentos únicos.
    </p>
    ${clasifInconsistentes.length === 0
      ? '<p class="empty">Cada instrumento tiene una única clasificación legal ✔</p>'
      : `
        <table style="max-width:480px">
          <thead><tr><th>Municipio</th><th>Identificadores en conflicto</th></tr></thead>
          <tbody>
            ${resumenIncon.map(([mun, n]) => `
              <tr><td><strong>${mun}</strong></td><td style="text-align:center" class="tag-bad">${n}</td></tr>
            `).join("")}
          </tbody>
        </table>

        <div style="overflow-x:auto;margin-top:1rem">
          <table>
            <thead><tr><th>ID</th><th>Municipio</th><th>Clasificaciones, filas y títulos</th><th>Diagnóstico</th></tr></thead>
            <tbody>
              ${clasifInconsistentes.slice(0, MAX_INCON).map((g) => `
                <tr>
                  <td><code>${g.id}</code></td>
                  <td>${g.mun}</td>
                  <td>${celdaClasesAud(g)}</td>
                  <td>${g.colision
                    ? '<span class="tag-bad">Posible colisión de Identificador</span>'
                    : '<span style="color:var(--warn);font-weight:600">Clasificación mixta</span>'}</td>
                </tr>
              `).join("")}
              ${clasifInconsistentes.length > MAX_INCON
                ? `<tr><td colspan="4" style="text-align:center;color:var(--muted);font-style:italic">
                    … mostrando primeros ${MAX_INCON} de ${clasifInconsistentes.length}.
                  </td></tr>`
                : ""}
            </tbody>
          </table>
        </div>
      `}
  `;

  // --- Variantes de escritura unificables (Partido / Sector / Tematica) ---
  // El pipeline las une automaticamente al calcular (canonizacion), pero aqui
  // se delatan para corregirlas en la fuente y que no reaparezcan.
  const CAMPOS_VARIANTES = ["Partido / Movimiento", "Sector", "Tematica"];
  const gruposVariantes = [];
  for (const campo of CAMPOS_VARIANTES) {
    const porClave = new Map(); // claveNorm -> Map(variante -> {n, municipios:Set})
    for (const r of instrumentos) {
      const v = norm(r[campo]);
      if (!v) continue;
      const key = claveNorm(v);
      if (!porClave.has(key)) porClave.set(key, new Map());
      const m = porClave.get(key);
      if (!m.has(v)) m.set(v, { n: 0, municipios: new Set() });
      const e = m.get(v);
      e.n++;
      e.municipios.add(norm(r.municipio_origen) || norm(r.municipio) || "(sin municipio)");
    }
    for (const [, m] of porClave) {
      if (m.size < 2) continue; // una sola forma de escribirlo: OK
      const variantes = Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n);
      gruposVariantes.push({ campo, variantes });
    }
  }
  gruposVariantes.sort((a, b) => a.campo.localeCompare(b.campo, "es"));

  const seccionVariantes = `
    <h3 style="margin-top:2rem">Variantes de escritura detectadas (${gruposVariantes.length})</h3>
    <p style="color:var(--muted);font-size:0.9rem">
      Valores que solo difieren en <strong>mayúsculas, tildes o espacios</strong>. El pipeline los unifica
      automáticamente al calcular (usa la variante más frecuente), pero conviene estandarizarlos en el
      Sheet del municipio para que no reaparezcan. La variante en <strong>negrilla</strong> es la que gana.
    </p>
    ${gruposVariantes.length === 0
      ? '<p class="empty">Sin variantes: cada partido, sector y temática se escribe de una sola forma ✔</p>'
      : `<div style="overflow-x:auto">
          <table>
            <thead><tr><th>Campo</th><th>Variantes (filas)</th><th>Dónde corregir</th></tr></thead>
            <tbody>
              ${gruposVariantes.map((g) => {
                const [ganadora, ...resto] = g.variantes;
                const vHTML = [`<strong>${ganadora[0]}</strong> (${ganadora[1].n})`]
                  .concat(resto.map(([v, e]) => `${v} (${e.n})`)).join(" · ");
                const munMinoritarios = Array.from(new Set(resto.flatMap(([, e]) => Array.from(e.municipios))))
                  .sort((a, b) => a.localeCompare(b, "es")).join(", ");
                return `<tr>
                  <td>${g.campo}</td>
                  <td>${vHTML}</td>
                  <td style="font-size:0.85rem">${munMinoritarios || "—"}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`}
  `;

  root.innerHTML = `
    <h2>Auditoría de datos (en vivo desde Apps Script)</h2>
    <p>Datos crudos del endpoint, sin transformar. Util para detectar correcciones necesarias en los Sheets.</p>

    ${diagMunicipios}

    ${seccionClasif}

    ${seccionVariantes}

    ${seccionSinTema}

    <h3>Validaciones detectadas (${validaciones.length})</h3>
    ${validaciones.length === 0
      ? '<p class="empty">Sin advertencias</p>'
      : `<table>
          <thead><tr><th>Nivel</th><th>Municipio</th><th>Mensaje</th><th>Fila</th></tr></thead>
          <tbody>
            ${validaciones.slice(0, 100).map((v) => `
              <tr>
                <td class="${v.nivel === 'error' ? 'tag-bad' : 'tag-neutral'}">${v.nivel}</td>
                <td>${v.municipio ?? "—"}</td>
                <td>${v.mensaje}</td>
                <td>${v.fila ?? v.fila_aprox ?? "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>`}

    <h3 style="margin-top:2rem">Últimos 20 instrumentos incluidos</h3>
    <table>
      <thead><tr><th>Identificador</th><th>Año</th><th>Título</th><th>Tema</th><th>Rol</th><th>Concejal</th><th>Partido</th></tr></thead>
      <tbody>
        ${instrumentos
          .filter((i) => String(i["Incluir en analisis"]).toLowerCase() === "si")
          .slice(-20).reverse()
          .map((i) => `
            <tr>
              <td>${i.Identificador}</td>
              <td>${i.Anio}</td>
              <td>${(i.Titulo || "").slice(0, 60)}</td>
              <td>${i.Tematica ?? "—"}</td>
              <td>${i.Rol ?? "—"}</td>
              <td>${i.ID_Concejal ?? "—"}</td>
              <td>${i["Partido / Movimiento"] ?? "—"}</td>
            </tr>
          `).join("")}
      </tbody>
    </table>
  `;
}
