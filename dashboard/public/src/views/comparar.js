// Vista Comparativa: recalcula las metricas por municipio (con los filtros
// activos de rol y nivel) y las pone lado a lado, mas una sintesis tipo
// "resultado de investigacion" sobre H1 (uniformidad) vs H2 (autonomia).
import { construirMetrics } from "/src/metrics.js";

const UMBRAL_JACCARD = 0.5;

export function renderComparar(root, ctx) {
  if (!ctx.raw || !Array.isArray(ctx.raw.instrumentos)) {
    root.innerHTML = `<p class="empty">
      Esta vista recalcula por municipio desde la data cruda: requiere el endpoint
      Apps Script (configura <code>appsScriptUrl</code> en <code>config.json</code>).
    </p>`;
    return;
  }

  // Filtros activos (los toma de los parametros con que se calculo ctx.metrics)
  const params = ctx.metrics.parametros || {};
  const roles = params.rol || ["Proponente", "Ponente", "Coordinador"];
  const colTema = params.tema || "Tematica";
  const minInst = params.min_instrumentos ?? 1;
  const municipios = (ctx.metrics.municipios || ctx.raw.municipios || [])
    .map((m) => ({ dane: String(m.dane || "").padStart(5, "0"), municipio: m.municipio || m.dane }))
    .filter((m) => m.dane && m.dane !== "00000")
    .sort((a, b) => String(a.municipio).localeCompare(String(b.municipio), "es"));

  const opc = { roles, colTema, minInstrumentos: minInst };
  const calc = (danes) => construirMetrics(ctx.raw.instrumentos, ctx.raw.concejales, { ...opc, municipios: danes });

  const filas = municipios.map((m) => ({ ...m, r: resumen(calc([m.dane])) }));
  const total = resumen(ctx.metrics); // global, ya calculado con los filtros activos
  const conDatos = filas.filter((f) => f.r.nConcejales > 0);

  // Sintesis de investigacion: tally H1/H2 entre partidos de todos los municipios
  const h1 = total.h1, h2 = total.h2;
  const veredictoGlobal = h1 > h2 ? "H1 — Uniformidad Partidista"
    : h2 > h1 ? "H2 — Autonomía Individual" : "Mixto / no concluyente";
  const colorV = h1 > h2 ? "var(--ok)" : h2 > h1 ? "var(--accent)" : "var(--muted)";

  root.innerHTML = `
    <h2>Comparativa entre municipios</h2>
    <p style="color:var(--muted);font-size:0.9rem">
      Filtros activos — Nivel: <strong>${colTema}</strong> · Roles: <strong>${roles.join(", ")}</strong> ·
      Mínimo instrumentos: <strong>${minInst}</strong>. Cambia los chips de arriba para recomparar.
    </p>

    <div class="veredicto" style="border-left-color:${colorV}">
      <h3 style="margin:0 0 .4rem">Resultado de investigación: <span style="color:${colorV}">${veredictoGlobal}</span></h3>
      <p style="margin:.2rem 0">
        Sobre el total filtrado: <strong>${h1}</strong> partido(s) apoyan H1 (convergen en temas, J ≥ ${UMBRAL_JACCARD})
        · <strong>${h2}</strong> apoyan H2 (agendas dispersas, J < ${UMBRAL_JACCARD}).
      </p>
      <p style="margin:.2rem 0;font-size:.9rem;color:var(--muted)">
        ${conDatos.length} de ${municipios.length} municipios con datos analizables.
        Convergencia inter-partido promedio (global${total.convEsGrande ? ", pares grandes" : ""}): <strong>${fmt(total.convProm)}</strong>
        ${total.convProm != null ? `(${total.convProm >= 0.5 ? "los partidos comparten gran parte de su agenda → consistente con H2" : total.convProm <= 0.3 ? "agendas partidistas diferenciadas → consistente con H1" : "señal intermedia"})` : ""}.
      </p>
    </div>

    <h3>Métricas por municipio</h3>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Municipio</th><th>Concejales</th><th>Partidos</th><th>Instrum.</th>
          <th>H indiv. prom</th><th>H partido prom</th><th>Jaccard prom</th><th>Converg. prom</th><th>Veredicto</th>
        </tr></thead>
        <tbody>
          ${filas.map((f) => filaHTML(f.municipio, f.r)).join("")}
          ${filaHTML("TODOS", total, true)}
        </tbody>
      </table>
    </div>
    <p style="color:var(--muted);font-size:.85rem">
      H indiv. prom = diversidad temática promedio de los concejales · H partido prom = diversidad de la agenda
      del bloque · Jaccard prom = convergencia temática intra-partido (decide el veredicto) ·
      Converg. prom = % de agenda compartida promedio entre partidos (Sigelman &amp; Buell 2004;
      usa solo pares con ambos partidos grandes cuando existen).
    </p>

    <h3>Convergencia intra-partido (Jaccard) por municipio</h3>
    <p style="color:var(--muted);font-size:.85rem">Verde: J ≥ ${UMBRAL_JACCARD} (apoya H1). Rojo: J < ${UMBRAL_JACCARD} (apoya H2).</p>
    <div class="plot" id="cmp-jaccard"></div>

    <h3>Mapa H1 ↔ H2</h3>
    <p style="color:var(--muted);font-size:.85rem">
      Cada punto es un municipio. Derecha (Jaccard alto) = convergencia partidista (H1);
      izquierda = autonomía individual (H2). Eje vertical: diversidad temática individual promedio.
    </p>
    <div class="plot" id="cmp-mapa"></div>
  `;

  // --- Grafico 1: barras Jaccard promedio por municipio ---
  const cd = conDatos.filter((f) => f.r.jaccProm != null)
    .sort((a, b) => b.r.jaccProm - a.r.jaccProm);
  if (cd.length) {
    Plotly.newPlot("cmp-jaccard", [{
      type: "bar", orientation: "h",
      x: cd.map((f) => f.r.jaccProm),
      y: cd.map((f) => f.municipio),
      marker: { color: cd.map((f) => f.r.jaccProm >= UMBRAL_JACCARD ? "#2ca02c" : "#d62728") },
      hovertemplate: "%{y}<br>Jaccard prom=%{x:.3f}<extra></extra>",
    }], {
      xaxis: { title: "Jaccard pareado promedio", range: [0, 1] },
      shapes: [{ type: "line", x0: UMBRAL_JACCARD, x1: UMBRAL_JACCARD, y0: 0, y1: 1, yref: "paper", line: { dash: "dash" } }],
      margin: { l: 200, t: 10 }, height: Math.max(260, 38 * cd.length + 60),
    }, { responsive: true });
  } else {
    document.getElementById("cmp-jaccard").innerHTML = '<p class="empty">Ningún municipio tiene ≥ 2 concejales aptos por partido para calcular Jaccard.</p>';
  }

  // --- Grafico 2: scatter mapa (Jaccard vs H individual) ---
  const mp = conDatos.filter((f) => f.r.jaccProm != null && f.r.hIndProm != null);
  if (mp.length) {
    Plotly.newPlot("cmp-mapa", [{
      type: "scatter", mode: "markers+text",
      x: mp.map((f) => f.r.jaccProm),
      y: mp.map((f) => f.r.hIndProm),
      text: mp.map((f) => f.municipio),
      textposition: "top center",
      marker: { size: mp.map((f) => Math.min(40, 8 + f.r.nConcejales * 2)), color: mp.map((f) => f.r.jaccProm >= UMBRAL_JACCARD ? "#2ca02c" : "#d62728"), opacity: 0.7 },
      hovertemplate: "%{text}<br>Jaccard=%{x:.3f}<br>H indiv=%{y:.3f}<extra></extra>",
    }], {
      xaxis: { title: "Jaccard intra-partido (→ H1)", range: [-0.05, 1.05] },
      yaxis: { title: "H individual promedio", range: [-0.05, 1.05] },
      shapes: [{ type: "line", x0: UMBRAL_JACCARD, x1: UMBRAL_JACCARD, y0: 0, y1: 1, yref: "paper", line: { dash: "dash", color: "gray" } }],
      margin: { t: 10 }, height: 460,
    }, { responsive: true });
  } else {
    document.getElementById("cmp-mapa").innerHTML = '<p class="empty">Sin municipios con suficientes datos para el mapa.</p>';
  }
}

// ---- helpers ----

function resumen(m) {
  const conc = (m.concejales || []).filter((c) => c.n_instrumentos > 0);
  const hPart = (m.partidos || []).map((p) => p.shannon_partido).filter((v) => v != null);
  const jacc = (m.partidos || []).map((p) => p.jaccard_intra).filter((v) => v != null);
  // Convergencia (Sigelman & Buell 2004): preferir pares grandes (ambos
  // partidos >= umbral de concejales); si no hay, promediar todos los pares.
  const pares = (m.interpartido || []).filter((p) => p.convergencia != null);
  const grandes = pares.filter((p) => p.par_grande);
  const convBase = grandes.length ? grandes : pares;
  return {
    nConcejales: conc.length,
    nPartidos: (m.partidos || []).length,
    nInstr: m.n_instrumentos_unicos_incluidos || 0,
    hIndProm: media(conc.map((c) => c.shannon_norm)),
    hPartProm: media(hPart),
    jaccProm: media(jacc),
    convProm: media(convBase.map((p) => p.convergencia)),
    convEsGrande: grandes.length > 0,
    h1: m.veredicto?.partidos_apoyan_H1 || 0,
    h2: m.veredicto?.partidos_apoyan_H2 || 0,
    veredicto: m.veredicto?.interpretacion || "—",
  };
}

function filaHTML(nombre, r, esTotal) {
  const vClass = r.h1 > r.h2 ? "tag-ok" : r.h2 > r.h1 ? "tag-bad" : "tag-neutral";
  const estilo = esTotal ? ' style="font-weight:700;background:#f3f4fb"' : "";
  const sinDatos = r.nConcejales === 0;
  return `<tr${estilo}>
    <td>${nombre}</td>
    <td style="text-align:center">${r.nConcejales}</td>
    <td style="text-align:center">${sinDatos ? "—" : r.nPartidos}</td>
    <td style="text-align:center">${r.nInstr}</td>
    <td style="text-align:center">${fmt(r.hIndProm)}</td>
    <td style="text-align:center">${fmt(r.hPartProm)}</td>
    <td style="text-align:center">${fmt(r.jaccProm)}</td>
    <td style="text-align:center">${fmt(r.convProm)}</td>
    <td class="${sinDatos ? "" : vClass}">${sinDatos ? '<span style="color:var(--muted)">sin datos</span>' : r.veredicto}</td>
  </tr>`;
}

function media(arr) {
  const v = arr.filter((x) => typeof x === "number" && !isNaN(x));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function fmt(x) {
  return x == null ? '<span style="color:var(--muted)">—</span>' : x.toFixed(3);
}
