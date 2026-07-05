// Vista Convergencia inter-partido. Metrica principal: indice de convergencia
// de agendas (Sigelman & Buell 2004) = % de agenda compartida entre dos
// partidos. Pearson se conserva como prueba de robustez (anexo).
export function renderCorr(root, ctx) {
  const todos = ctx.metrics.interpartido || [];
  const tieneConv = todos.some((p) => p.convergencia != null);
  const params = ctx.metrics.parametros_interpartido || {};
  const umbralN = params.umbral_n_concejales ?? 10;
  const resumen = ctx.metrics.resumen_interpartido || {};

  if (!tieneConv) {
    // metrics.json viejo sin el campo: cae a Pearson con aviso.
    root.innerHTML = `
      <h2>Convergencia inter-partido</h2>
      <p class="empty">
        Este <code>metrics.json</code> no trae el índice de convergencia (Sigelman &amp; Buell 2004).
        Usa «Recalcular» con el endpoint configurado o regenera con <code>python build_metrics.py</code>.
        Mostrando Pearson (métrica anterior).
      </p>
      <div class="plot" id="heat-pearson"></div>
    `;
    pintarHeatmap("heat-pearson", todos.filter((p) => p.pearson != null), "pearson", { zmin: -1, zmax: 1, colorscale: "RdBu", reversescale: true });
    return;
  }

  const pares = todos.filter((p) => p.convergencia != null);
  const paresGrandes = pares.filter((p) => p.par_grande);
  const partidos = Array.from(new Set(pares.flatMap((p) => [p.a, p.b]))).sort();

  const resumenHTML = resumen.n_pares_grandes
    ? `Entre los <strong>${resumen.n_pares_grandes}</strong> pares de partidos grandes (ambos ≥ ${umbralN} concejales):
       convergencia media <strong>${fmtPct(resumen.convergencia_media_pares_grandes)}</strong>
       (mín ${fmtPct(resumen.convergencia_min_pares_grandes)} · máx ${fmtPct(resumen.convergencia_max_pares_grandes)}).`
    : `Ningún par cumple el umbral de partidos grandes (ambos ≥ ${umbralN} concejales); el heatmap muestra todos los pares, pero interprétalos con cautela.`;

  root.innerHTML = `
    <h2>Convergencia inter-partido (Sigelman &amp; Buell 2004)</h2>
    <p>Porcentaje de agenda compartida entre los perfiles temáticos de cada par de partidos:
       <strong>C = Σ min(p<sub>A</sub>, p<sub>B</sub>)</strong>, en [0, 1].
       Una convergencia de 0.75 significa que los dos partidos comparten el 75% de su agenda.</p>
    <p style="color:var(--muted);font-size:0.9rem">${resumenHTML}</p>
    ${partidos.length < 2 ? '<p class="empty">Se necesitan al menos 2 partidos con perfil.</p>' : ''}
    <div class="plot" id="heat-conv"></div>

    <h3 style="margin-top:2rem">Detalle de pares grandes</h3>
    ${paresGrandes.length === 0
      ? `<p class="empty">Sin pares donde ambos partidos tengan ≥ ${umbralN} concejales.</p>`
      : `<table style="max-width:720px">
          <thead><tr><th>Partido A</th><th>Partido B</th><th>Convergencia</th><th>Pearson (robustez)</th><th>n<sub>A</sub></th><th>n<sub>B</sub></th></tr></thead>
          <tbody>
            ${paresGrandes.slice().sort((x, y) => y.convergencia - x.convergencia).map((p) => `
              <tr>
                <td>${p.a}</td><td>${p.b}</td>
                <td style="text-align:center"><strong>${p.convergencia.toFixed(4)}</strong></td>
                <td style="text-align:center">${p.pearson == null ? "—" : p.pearson.toFixed(4)}</td>
                <td style="text-align:center">${p.n_concejales_a}</td>
                <td style="text-align:center">${p.n_concejales_b}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>`}

    <h3 style="margin-top:2rem">Robustez: Pearson entre perfiles (anexo)</h3>
    <p style="color:var(--muted);font-size:0.9rem">
      Métrica anterior, conservada como prueba de robustez.
      <span id="rho-spearman"></span>
    </p>
    <div class="plot" id="heat-pearson"></div>

    <p style="color:var(--muted);font-size:0.85rem;margin-top:1rem">
      Nota de granularidad: los valores con temáticas finas son sistemáticamente menores que con
      sectores gruesos; no compares C entre taxonomías. Referencia: Sigelman, L. y Buell, E. H. (2004),
      <em>Avoidance or engagement? Issue convergence in U.S. presidential campaigns, 1960–2000</em>,
      AJPS 48(4), 650–661.
    </p>
  `;

  if (partidos.length < 2) return;

  pintarHeatmap("heat-conv", pares, "convergencia", { zmin: 0, zmax: 1, colorscale: "YlGnBu" });

  const conPearson = pares.filter((p) => p.pearson != null);
  pintarHeatmap("heat-pearson", conPearson, "pearson", { zmin: -1, zmax: 1, colorscale: "RdBu", reversescale: true });

  // Correlacion de rango (Spearman) entre el ordenamiento de pares segun
  // convergencia y segun Pearson, sobre pares grandes (o todos si no hay).
  const base = (paresGrandes.length >= 3 ? paresGrandes : conPearson).filter((p) => p.pearson != null);
  const rho = spearman(base.map((p) => p.convergencia), base.map((p) => p.pearson));
  if (rho != null) {
    document.getElementById("rho-spearman").innerHTML =
      `Concordancia de ordenamientos convergencia↔Pearson (Spearman, ${paresGrandes.length >= 3 ? "pares grandes" : "todos los pares"}): <strong>ρ = ${rho.toFixed(2)}</strong>.`;
  }
}

// ---- helpers ----

function pintarHeatmap(elId, pares, campo, opts) {
  const partidos = Array.from(new Set(pares.flatMap((p) => [p.a, p.b]))).sort();
  if (partidos.length < 2) {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = '<p class="empty">Sin suficientes pares para el heatmap.</p>';
    return;
  }
  const idx = Object.fromEntries(partidos.map((p, i) => [p, i]));
  const z = Array.from({ length: partidos.length }, () => Array(partidos.length).fill(null));
  for (const p of partidos) z[idx[p]][idx[p]] = 1;
  for (const pair of pares) {
    z[idx[pair.a]][idx[pair.b]] = pair[campo];
    z[idx[pair.b]][idx[pair.a]] = pair[campo];
  }
  Plotly.newPlot(elId, [{
    type: "heatmap",
    z, x: partidos, y: partidos,
    zmin: opts.zmin, zmax: opts.zmax,
    colorscale: opts.colorscale, reversescale: !!opts.reversescale,
    text: z.map((row) => row.map((v) => v === null ? "" : v.toFixed(2))),
    texttemplate: "%{text}",
  }], {
    margin: { l: 200, b: 200, t: 20 },
    height: Math.max(500, 45 * partidos.length),
    xaxis: { tickangle: -45 },
  }, { responsive: true });
}

function spearman(xs, ys) {
  if (xs.length < 3) return null;
  const rx = rangos(xs), ry = rangos(ys);
  const n = rx.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx, dy = ry[i] - my;
    num += dx * dy; sx += dx * dx; sy += dy * dy;
  }
  if (sx === 0 || sy === 0) return null;
  return num / Math.sqrt(sx * sy);
}

function rangos(vals) {
  const orden = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = Array(vals.length).fill(0);
  let i = 0;
  while (i < orden.length) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1][0] === orden[i][0]) j++;
    const rangoMedio = (i + j) / 2 + 1; // rangos empatados promediados
    for (let k = i; k <= j; k++) r[orden[k][1]] = rangoMedio;
    i = j + 1;
  }
  return r;
}

function fmtPct(x) {
  return x == null ? "—" : `${(x * 100).toFixed(1)}%`;
}
