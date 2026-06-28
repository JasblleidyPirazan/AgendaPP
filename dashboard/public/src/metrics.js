// Port en JS de agendapp/indices.py + transform.py + build_metrics.py
// Permite recalcular metrics.json en el navegador desde la data cruda del
// endpoint Apps Script, sin necesidad de Python ni rebuild de Netlify.

const UMBRAL_CV = 0.3;
const UMBRAL_JACCARD = 0.5;
const ROL_DEFAULT = ["Proponente", "Ponente"];
const COL_TEMA_DEFAULT = "Tematica";
const MIN_INSTRUMENTOS_DEFAULT = 1;

// ---------- indices ----------

export function shannonNorm(counts) {
  let total = 0;
  for (const c of counts) {
    if (c < 0) throw new Error("counts no admite valores negativos");
    total += c;
  }
  if (total === 0) return 0;
  const positivos = counts.filter((c) => c > 0).map((c) => c / total);
  const s = positivos.length;
  if (s <= 1) return 0;
  let h = 0;
  for (const p of positivos) h -= p * Math.log(p);
  return h / Math.log(s);
}

export function cvShannon(values) {
  const arr = values.filter((v) => !isNaN(v));
  if (arr.length < 2) return NaN;
  const mu = arr.reduce((s, x) => s + x, 0) / arr.length;
  if (mu === 0) return NaN;
  let sq = 0;
  for (const v of arr) sq += (v - mu) ** 2;
  const sigma = Math.sqrt(sq / (arr.length - 1));
  return sigma / mu;
}

export function jaccardPairwiseMean(binaryMatrix) {
  const n = binaryMatrix.length;
  if (n < 2) return NaN;
  const vals = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = binaryMatrix[i], b = binaryMatrix[j];
      let inter = 0, uni = 0;
      for (let k = 0; k < a.length; k++) {
        const va = a[k] ? 1 : 0, vb = b[k] ? 1 : 0;
        if (va || vb) uni++;
        if (va && vb) inter++;
      }
      vals.push(uni === 0 ? 1 : inter / uni);
    }
  }
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}

export function pearsonCorr(a, b) {
  if (a.length !== b.length) throw new Error("vectores de distinta forma");
  if (a.length < 2) return NaN;
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db; sa += da * da; sb += db * db;
  }
  if (sa === 0 || sb === 0) return NaN;
  return num / Math.sqrt(sa * sb);
}

// ---------- pipeline ----------

export function construirMetrics(rawInstrumentos, rawConcejales, opciones = {}) {
  const roles = (opciones.roles || ROL_DEFAULT).map((r) => r.trim().toLowerCase());
  const colTema = opciones.colTema || COL_TEMA_DEFAULT;
  const minInst = opciones.minInstrumentos ?? MIN_INSTRUMENTOS_DEFAULT;

  // map ID_Concejal -> nombre
  const nombres = new Map();
  for (const c of rawConcejales || []) {
    if (c.ID_Concejal) nombres.set(c.ID_Concejal, c["Nombre completo"] || "");
  }

  // id_instrumento canonico
  const inst = (rawInstrumentos || []).map((r) => {
    if (!r.id_instrumento && r["Codigo DANE"] && r.Identificador) {
      r.id_instrumento = `${String(r["Codigo DANE"]).padStart(5, "0")}-${String(r.Identificador).trim()}`;
    }
    return r;
  });

  // Dedup (id_instrumento, Rol, ID_Concejal)
  const vistosDedup = new Set();
  const dedup = [];
  for (const r of inst) {
    const k = `${r.id_instrumento}|${r.Rol}|${r.ID_Concejal}`;
    if (vistosDedup.has(k)) continue;
    vistosDedup.add(k);
    dedup.push(r);
  }

  // Solo incluidos para universos
  const incluidos = dedup.filter((r) => String(r["Incluir en analisis"] ?? "").toLowerCase() === "si");
  const universoTemas = sortedUnique(incluidos.map((r) => (r[colTema] || "").trim()).filter(Boolean));
  const universoSectores = sortedUnique(incluidos.map((r) => (r.Sector || "").trim()).filter(Boolean));
  const nUnicosIncluidos = new Set(incluidos.map((r) => r.id_instrumento)).size;
  const nUnicosTotal = new Set(dedup.map((r) => r.id_instrumento)).size;

  // Filas relevantes para indices (incluidos + rol en lista)
  const filas = incluidos.filter((r) =>
    roles.includes(String(r.Rol || "").trim().toLowerCase()) && (r[colTema] || "").trim()
  );

  // Mapeo concejal -> partido (mas frecuente en filas relevantes)
  const partidoPorConcejal = new Map();
  {
    const conteo = new Map(); // concejal -> Map(partido -> n)
    for (const r of filas) {
      const cid = r.ID_Concejal;
      const p = (r["Partido / Movimiento"] || "").trim().toUpperCase();
      if (!cid || !p) continue;
      if (!conteo.has(cid)) conteo.set(cid, new Map());
      const m = conteo.get(cid);
      m.set(p, (m.get(p) || 0) + 1);
    }
    for (const [cid, m] of conteo.entries()) {
      let best = "", bestN = -1;
      for (const [p, n] of m.entries()) if (n > bestN) { best = p; bestN = n; }
      partidoPorConcejal.set(cid, best);
    }
  }

  // Matriz concejal x tema (counts)
  const matriz = new Map(); // cid -> Map(tema -> count)
  for (const r of filas) {
    const cid = r.ID_Concejal;
    const t = (r[colTema] || "").trim();
    if (!cid || !t) continue;
    if (!matriz.has(cid)) matriz.set(cid, new Map());
    const m = matriz.get(cid);
    m.set(t, (m.get(t) || 0) + 1);
  }

  // H por concejal
  const hPorConcejal = new Map();
  const conceales_out = [];
  for (const [cid, m] of matriz.entries()) {
    const counts = Array.from(m.values());
    const h = shannonNorm(counts);
    hPorConcejal.set(cid, h);
    const n = counts.reduce((s, x) => s + x, 0);
    conceales_out.push({
      id: cid,
      nombre: nombres.get(cid) || "",
      partido: partidoPorConcejal.get(cid) || null,
      n_instrumentos: n,
      shannon_norm: round(h, 4),
    });
  }

  // Agrupacion por partido
  const cidsPorPartido = new Map();
  for (const [cid, p] of partidoPorConcejal.entries()) {
    if (!cidsPorPartido.has(p)) cidsPorPartido.set(p, []);
    cidsPorPartido.get(p).push(cid);
  }

  const partidos_out = [];
  const perfiles = new Map();
  const excluidos = [];

  for (const [partido, cids] of cidsPorPartido.entries()) {
    const validos = cids.filter((c) => matriz.has(c));
    if (!validos.length) continue;

    const conN = validos.map((c) => {
      const counts = Array.from(matriz.get(c).values());
      return { cid: c, n: counts.reduce((s, x) => s + x, 0) };
    });
    const aptos = conN.filter((x) => x.n >= minInst).map((x) => x.cid);
    conN.filter((x) => x.n < minInst).forEach((x) => excluidos.push({ id: x.cid, partido }));

    const hs = aptos.map((c) => hPorConcejal.get(c));
    const cv = hs.length >= 2 ? cvShannon(hs) : NaN;

    // binary matrix para Jaccard
    const binaria = aptos.map((c) => {
      const m = matriz.get(c);
      return universoTemas.map((t) => (m.get(t) || 0) > 0);
    });
    const j = binaria.length >= 2 ? jaccardPairwiseMean(binaria) : NaN;

    // perfil del partido sobre TODOS los concejales del partido (no solo aptos)
    const sumaTemas = new Map();
    let total = 0;
    for (const c of validos) {
      const m = matriz.get(c);
      for (const [t, n] of m.entries()) {
        sumaTemas.set(t, (sumaTemas.get(t) || 0) + n);
        total += n;
      }
    }
    const perfilObj = {};
    if (total > 0) {
      for (const [t, n] of sumaTemas.entries()) perfilObj[t] = round(n / total, 4);
    }
    perfiles.set(partido, perfilObj);

    partidos_out.push({
      nombre: partido,
      n_concejales: validos.length,
      n_concejales_aptos: aptos.length,
      cv_shannon: isNaN(cv) ? null : round(cv, 4),
      jaccard_intra: isNaN(j) ? null : round(j, 4),
      perfil_tematico: Object.fromEntries(Object.entries(perfilObj).filter(([_, v]) => v > 0)),
    });
  }

  // Correlaciones inter-partido (Pearson sobre perfiles alineados al universo)
  const interpartido = [];
  const nombresPartidos = Array.from(perfiles.keys());
  for (let i = 0; i < nombresPartidos.length; i++) {
    for (let j = i + 1; j < nombresPartidos.length; j++) {
      const a = nombresPartidos[i], b = nombresPartidos[j];
      const va = universoTemas.map((t) => perfiles.get(a)[t] || 0);
      const vb = universoTemas.map((t) => perfiles.get(b)[t] || 0);
      const r = pearsonCorr(va, vb);
      interpartido.push({ a, b, pearson: isNaN(r) ? null : round(r, 4) });
    }
  }

  // Veredicto
  let h1 = 0, h2 = 0, neutros = 0;
  for (const p of partidos_out) {
    if (p.cv_shannon === null || p.jaccard_intra === null) { neutros++; continue; }
    if (p.cv_shannon <= UMBRAL_CV && p.jaccard_intra >= UMBRAL_JACCARD) h1++;
    else if (p.cv_shannon > UMBRAL_CV && p.jaccard_intra < UMBRAL_JACCARD) h2++;
    else neutros++;
  }

  return {
    generadoEn: new Date().toISOString(),
    parametros: { rol: opciones.roles || ROL_DEFAULT, tema: colTema, min_instrumentos: minInst },
    universo_temas: universoTemas,
    universo_sectores: universoSectores,
    n_instrumentos_unicos_incluidos: nUnicosIncluidos,
    n_instrumentos_unicos_total: nUnicosTotal,
    concejales: conceales_out,
    partidos: partidos_out,
    interpartido,
    excluidos_min_instrumentos: excluidos,
    veredicto: {
      umbral_cv: UMBRAL_CV,
      umbral_jaccard: UMBRAL_JACCARD,
      partidos_apoyan_H1: h1,
      partidos_apoyan_H2: h2,
      partidos_ambiguos: neutros,
      interpretacion: h1 > h2 ? "H1 apoyada" : h2 > h1 ? "H2 apoyada" : "Resultado mixto / no concluyente",
    },
    _origen: "navegador",
  };
}

function sortedUnique(arr) {
  return Array.from(new Set(arr)).sort((a, b) => String(a).localeCompare(String(b), "es"));
}

function round(x, decimals) {
  if (isNaN(x)) return x;
  const k = 10 ** decimals;
  return Math.round(x * k) / k;
}
