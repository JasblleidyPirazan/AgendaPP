// Port en JS de agendapp/indices.py + transform.py + build_metrics.py
// Permite recalcular metrics.json en el navegador desde la data cruda del
// endpoint Apps Script, sin necesidad de Python ni rebuild de Netlify.

const UMBRAL_JACCARD = 0.5;
// Pares "grandes" para el resumen interpartidista: ambos partidos con >= N
// concejales. Con menos casos el perfil no es estimable y el promedio global
// se contamina (Documentacion_Convergencia_Agendas, seccion 5.2).
const UMBRAL_N_CONCEJALES = 10;
const ROL_DEFAULT = ["Proponente", "Ponente", "Coordinador"];
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

// Convergencia de agendas (Sigelman & Buell 2004), escala 0-1.
// C(A,B) = sum_k min(p_Ak, p_Bk) = 1 - (1/2) * sum |p_Ak - p_Bk|.
// Espera vectores alineados al mismo universo de categorias; renormaliza
// internamente (protege contra proporciones ya redondeadas).
// Lectura literal: C = 0.75 => comparten el 75% de su agenda.
// Devuelve null si algun perfil suma cero (partido sin instrumentos).
export function convergenciaAgendas(a, b) {
  if (a.length !== b.length) throw new Error("perfiles de distinta forma");
  const sa = a.reduce((s, v) => s + v, 0);
  const sb = b.reduce((s, v) => s + v, 0);
  if (sa === 0 || sb === 0) return null;
  let c = 0;
  for (let i = 0; i < a.length; i++) c += Math.min(a[i] / sa, b[i] / sb);
  return c;
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
  // Filtro de municipios: set de codigos DANE (5 digitos) o nombres en minuscula. Vacio = todos.
  const munSel = new Set((opciones.municipios || []).map((m) => String(m).trim().toLowerCase()).filter(Boolean));
  // Filtro de clasificacion legal (Acuerdo / Proyecto de Acuerdo / ...). Vacio = todas.
  // El "" representa filas sin clasificacion (se conserva, no se filtra).
  const claseSel = new Set((opciones.clasificaciones || []).map((c) => String(c).trim().toLowerCase()));

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

  // Mapa DANE -> municipio y lista de municipios disponibles (antes de filtrar)
  const daneAMunicipio = new Map();
  for (const r of inst) {
    const dane = String(r["Codigo DANE"] ?? "").trim().padStart(5, "0");
    if (dane && dane !== "00000" && !daneAMunicipio.has(dane)) {
      daneAMunicipio.set(dane, String(r.municipio_origen || r.municipio || "").trim());
    }
  }
  const municipiosDisponibles = Array.from(daneAMunicipio.entries())
    .map(([dane, municipio]) => ({ dane, municipio }))
    .sort((a, b) => String(a.municipio || a.dane).localeCompare(String(b.municipio || b.dane), "es"));

  const municipioDe = (cid) => {
    const s = String(cid);
    const dane = s.includes("-") ? s.split("-")[0].padStart(5, "0") : "";
    return daneAMunicipio.get(dane) || "";
  };

  // Filtro de municipios (por DANE o nombre) + clasificacion legal + exclusion ADMINISTRACION
  const pasaMun = (r) => {
    if (munSel.size === 0) return true;
    const dane = String(r["Codigo DANE"] ?? "").trim().padStart(5, "0");
    const nombre = String(r.municipio_origen || r.municipio || "").trim().toLowerCase();
    return munSel.has(dane) || munSel.has(nombre);
  };
  const pasaClase = (r) => claseSel.size === 0 || claseSel.has(String(r["Clasificacion legal"] ?? "").trim().toLowerCase());
  // ADMINISTRACION (iniciativas del ejecutivo) se excluye de todos los conteos.
  const noAdmin = (r) => !(claveNorm(r["Partido / Movimiento"]).startsWith("ADMINISTRAC") || claveNorm(r.ID_Concejal).startsWith("ADMINISTRAC"));
  const instFiltrado = inst.filter((r) => pasaMun(r) && pasaClase(r) && noAdmin(r));

  // Dedup (id_instrumento, Rol, ID_Concejal)
  const vistosDedup = new Set();
  const dedup = [];
  for (const r of instFiltrado) {
    const k = `${r.id_instrumento}|${r.Rol}|${r.ID_Concejal}`;
    if (vistosDedup.has(k)) continue;
    vistosDedup.add(k);
    dedup.push(r);
  }

  // Incluir todo salvo lo marcado "No" (vacio = incluido). Cubre plantilla v2
  // (inclusion en blanco) y vieja ("Si"). Solo "No" excluye.
  const incluidos = dedup.filter((r) => String(r["Incluir en analisis"] ?? "").trim().toLowerCase() !== "no");

  // Canonizacion de categorias: une variantes que solo difieren en
  // mayusculas / tildes / espacios (conserva la variante mas frecuente como etiqueta).
  // Incluye partido: una tilde de diferencia ("DEMOCRÁTICO" vs "DEMOCRATICO")
  // parte un partido en dos y distorsiona perfiles y convergencia.
  const canonTema = construirCanon(incluidos.map((r) => r[colTema]));
  const canonSector = construirCanon(incluidos.map((r) => r.Sector));
  const canonPartido = construirCanon(incluidos.map((r) => String(r["Partido / Movimiento"] || "").trim().toUpperCase()));
  const temaDe = (r) => canonTema.get(claveNorm(r[colTema])) || String(r[colTema] || "").trim();
  const sectorDe = (r) => canonSector.get(claveNorm(r.Sector)) || String(r.Sector || "").trim();
  const partidoDe = (r) => {
    const p = String(r["Partido / Movimiento"] || "").trim().toUpperCase();
    return canonPartido.get(claveNorm(p)) || p;
  };

  const universoTemas = sortedUnique(incluidos.map(temaDe).filter(Boolean));
  const universoSectores = sortedUnique(incluidos.map(sectorDe).filter(Boolean));
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
      const p = partidoDe(r);
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
    const t = temaDe(r);
    if (!cid || !t) continue;
    if (!matriz.has(cid)) matriz.set(cid, new Map());
    const m = matriz.get(cid);
    m.set(t, (m.get(t) || 0) + 1);
  }

  // H por concejal + perfil tematico individual (conteos enteros crudos,
  // no proporciones: cualquier calculo externo posterior queda exacto).
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
      municipio: municipioDe(cid),
      n_instrumentos: n,
      shannon_norm: round(h, 4),
      // Objeto disperso {categoria: n}: solo categorias con >= 1 instrumento.
      // Un instrumento con k autores aporta 1 a cada autor (mismo criterio
      // que n_instrumentos). Los ceros se derivan de universo_temas.
      conteos: Object.fromEntries(m),
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
  const conteosPorPartido = new Map(); // partido -> Map(tema -> conteo crudo)
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
    conteosPorPartido.set(partido, sumaTemas);

    // Shannon del bloque: diversidad de la agenda agregada del partido.
    const hPartido = total > 0 ? shannonNorm(Array.from(sumaTemas.values())) : NaN;

    partidos_out.push({
      nombre: partido,
      n_concejales: validos.length,
      n_concejales_aptos: aptos.length,
      shannon_partido: isNaN(hPartido) ? null : round(hPartido, 4),
      jaccard_intra: isNaN(j) ? null : round(j, 4),
      perfil_tematico: Object.fromEntries(Object.entries(perfilObj).filter(([_, v]) => v > 0)),
    });
  }

  // Convergencia inter-partido (Sigelman & Buell 2004) como metrica principal,
  // Pearson como prueba de robustez. La convergencia se calcula desde los
  // conteos crudos por categoria (no desde el perfil redondeado a 4 decimales).
  const nConcejalesPorPartido = new Map(partidos_out.map((p) => [p.nombre, p.n_concejales]));
  const interpartido = [];
  const nombresPartidos = Array.from(perfiles.keys());
  for (let i = 0; i < nombresPartidos.length; i++) {
    for (let j = i + 1; j < nombresPartidos.length; j++) {
      const a = nombresPartidos[i], b = nombresPartidos[j];
      const ca = conteosPorPartido.get(a), cb = conteosPorPartido.get(b);
      const cva = universoTemas.map((t) => ca.get(t) || 0);
      const cvb = universoTemas.map((t) => cb.get(t) || 0);
      const c = convergenciaAgendas(cva, cvb);
      const va = universoTemas.map((t) => perfiles.get(a)[t] || 0);
      const vb = universoTemas.map((t) => perfiles.get(b)[t] || 0);
      const r = pearsonCorr(va, vb);
      const na = nConcejalesPorPartido.get(a) || 0;
      const nb = nConcejalesPorPartido.get(b) || 0;
      interpartido.push({
        a, b,
        convergencia: c === null ? null : round(c, 4),
        pearson: isNaN(r) ? null : round(r, 4),
        n_concejales_a: na,
        n_concejales_b: nb,
        par_grande: na >= UMBRAL_N_CONCEJALES && nb >= UMBRAL_N_CONCEJALES,
      });
    }
  }

  const convGrandes = interpartido
    .filter((p) => p.par_grande && p.convergencia !== null)
    .map((p) => p.convergencia);
  const resumenInterpartido = {
    convergencia_media_pares_grandes: convGrandes.length
      ? round(convGrandes.reduce((s, x) => s + x, 0) / convGrandes.length, 4) : null,
    convergencia_min_pares_grandes: convGrandes.length ? round(Math.min(...convGrandes), 4) : null,
    convergencia_max_pares_grandes: convGrandes.length ? round(Math.max(...convGrandes), 4) : null,
    n_pares_grandes: convGrandes.length,
  };

  // Veredicto segun convergencia tematica (Jaccard): J >= umbral => H1, J < umbral => H2.
  let h1 = 0, h2 = 0, neutros = 0;
  for (const p of partidos_out) {
    if (p.jaccard_intra === null) neutros++;
    else if (p.jaccard_intra >= UMBRAL_JACCARD) h1++;
    else h2++;
  }

  return {
    generadoEn: new Date().toISOString(),
    parametros: {
      // 2.1 = incluye conteos por concejal (perfil tematico individual).
      version_esquema: "2.1",
      rol: opciones.roles || ROL_DEFAULT,
      tema: colTema,
      min_instrumentos: minInst,
      municipios: (opciones.municipios && opciones.municipios.length) ? opciones.municipios : "todos",
      clasificaciones: (opciones.clasificaciones && opciones.clasificaciones.length) ? opciones.clasificaciones : "todas",
    },
    municipios: municipiosDisponibles,
    universo_temas: universoTemas,
    universo_sectores: universoSectores,
    n_instrumentos_unicos_incluidos: nUnicosIncluidos,
    n_instrumentos_unicos_total: nUnicosTotal,
    concejales: conceales_out,
    partidos: partidos_out,
    interpartido,
    parametros_interpartido: {
      metrica_principal: "convergencia_sigelman_buell_2004",
      umbral_n_concejales: UMBRAL_N_CONCEJALES,
    },
    resumen_interpartido: resumenInterpartido,
    excluidos_min_instrumentos: excluidos,
    veredicto: {
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

// Clave de normalizacion: sin tildes, espacios colapsados, mayusculas.
// Usada para agrupar variantes de la misma categoria y detectar ADMINISTRACION.
export function claveNorm(v) {
  return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

// Construye un mapa claveNorm -> etiqueta canonica (la variante original mas
// frecuente; desempate alfabetico). Une "X innovacion" y "X Innovacion", etc.
export function construirCanon(valores) {
  const grupos = new Map();
  for (const v of valores) {
    const orig = String(v ?? "").trim();
    if (!orig) continue;
    const key = claveNorm(orig);
    if (!grupos.has(key)) grupos.set(key, new Map());
    const m = grupos.get(key);
    m.set(orig, (m.get(orig) || 0) + 1);
  }
  const map = new Map();
  for (const [key, m] of grupos) {
    let best = "", bestN = -1;
    for (const [orig, n] of m) {
      if (n > bestN || (n === bestN && orig.localeCompare(best, "es") < 0)) { best = orig; bestN = n; }
    }
    map.set(key, best);
  }
  return map;
}

function round(x, decimals) {
  if (isNaN(x)) return x;
  const k = 10 ** decimals;
  return Math.round(x * k) / k;
}
