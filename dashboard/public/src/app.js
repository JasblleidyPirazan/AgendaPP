// Punto de entrada: carga config + metrics.json, renderiza vistas, gestiona navegacion.
import { renderResumen } from "/src/views/resumen.js";
import { renderInstrumentos } from "/src/views/instrumentos.js";
import { renderPartidos } from "/src/views/partidos.js";
import { renderShannon } from "/src/views/shannon.js";
import { renderShannonPartido } from "/src/views/shannon_partido.js";
import { renderJaccard } from "/src/views/jaccard.js";
import { renderCorr } from "/src/views/correlaciones.js";
import { renderComparar } from "/src/views/comparar.js";
import { renderContadores } from "/src/views/contadores.js";
import { renderCamaleones } from "/src/views/camaleones.js";
import { renderAuditoria } from "/src/views/auditoria.js";
import { construirMetrics } from "/src/metrics.js";

const VIEWS = {
  resumen: renderResumen,
  instrumentos: renderInstrumentos,
  partidos: renderPartidos,
  shannon: renderShannon,
  shannon_partido: renderShannonPartido,
  jaccard: renderJaccard,
  corr: renderCorr,
  comparar: renderComparar,
  contadores: renderContadores,
  camaleones: renderCamaleones,
  auditoria: renderAuditoria,
};

async function fetchJSON(url, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
    return r.json();
  } catch (e) {
    throw e.name === "AbortError" ? new Error(`Timeout (${timeoutMs / 1000}s) en ${url}`) : e;
  } finally {
    clearTimeout(t);
  }
}

// Carga la data cruda tolerando el bloqueo CORS de Apps Script. El fetch
// cross-origin a un Web App suele fallar con "Failed to fetch" (la redireccion
// de Google no es legible por CORS), asi que si el fetch directo falla se cae
// a JSONP: la respuesta se carga como <script>, que no pasa por CORS. Requiere
// que el endpoint soporte ?callback= (ver apps-script/src/WebApp.gs).
// Ademas se reintenta por si el fallo es transitorio (cuota, respuesta lenta).
async function cargarRaw(appsScriptUrl, { nocache = false, intentos = 2 } = {}) {
  const url = `${appsScriptUrl}?recurso=todo${nocache ? "&nocache=1" : ""}`;
  let ultimoError = null;
  for (let i = 0; i < intentos; i++) {
    try {
      return validarRaw(await fetchJSON(url, 60000));
    } catch (e) {
      ultimoError = e;
    }
    try {
      return validarRaw(await cargarRawJSONP(appsScriptUrl, { nocache }));
    } catch (e) {
      ultimoError = e;
    }
    if (i < intentos - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw ultimoError;
}

// Apps Script devuelve {error, stack} (como JSON/JSONP legible) cuando doGet
// lanza. Eso no es data utilizable: se convierte en error para que el banner
// muestre el mensaje real en vez de dejar las vistas vacias.
function validarRaw(data) {
  if (data && data.error && !Array.isArray(data.instrumentos)) {
    throw new Error(`El endpoint respondió con error: ${data.error}`);
  }
  return data;
}

// Carga vía <script> (JSONP): inmune al bloqueo CORS del fetch cross-origin.
let jsonpSeq = 0;
function cargarRawJSONP(appsScriptUrl, { nocache = false, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = `__agendappJSONP_${Date.now()}_${jsonpSeq++}`;
    const sep = appsScriptUrl.includes("?") ? "&" : "?";
    const url = `${appsScriptUrl}${sep}recurso=todo&callback=${cb}${nocache ? "&nocache=1" : ""}`;
    const script = document.createElement("script");
    let hecho = false;
    const limpiar = () => {
      hecho = true;
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      clearTimeout(t);
      script.remove();
    };
    const t = setTimeout(() => {
      if (!hecho) { limpiar(); reject(new Error(`Timeout JSONP (${timeoutMs / 1000}s)`)); }
    }, timeoutMs);
    window[cb] = (data) => { if (!hecho) { limpiar(); resolve(data); } };
    script.onerror = () => { if (!hecho) { limpiar(); reject(new Error("Failed to fetch (JSONP)")); } };
    script.src = url;
    document.head.appendChild(script);
  });
}

// Carga SOLO lo necesario para el primer pintado (config + metrics.json).
// La data cruda del endpoint se pide despues, en segundo plano, para que un
// endpoint caido o lento nunca deje la pagina en blanco.
async function loadAll() {
  let config = { appsScriptUrl: "" };
  try { config = await fetchJSON("/config.json", 15000); } catch (_) { /* ok */ }

  let metrics = null;
  try {
    metrics = await fetchJSON("/data/metrics.json", 30000);
  } catch (e) {
    showError("No se pudo cargar /data/metrics.json. Corre `python build_metrics.py` en analysis/.");
    return null;
  }

  return { config, metrics, raw: null, rawError: null };
}

// Pide la data cruda sin bloquear el primer render. Mientras carga, el banner
// informa; al llegar, reconstruye filtros y vista activa; si falla, muestra
// el error con boton Reintentar.
function cargarRawEnSegundoPlano(ctx) {
  if (!ctx.config.appsScriptUrl) return;
  const el = document.getElementById("aviso-endpoint");
  if (el) {
    el.hidden = false;
    el.classList.add("cargando");
    el.innerHTML = "⏳ Cargando data en vivo del endpoint Apps Script… (mientras tanto se muestra el metrics.json precalculado)";
  }
  cargarRaw(ctx.config.appsScriptUrl, { intentos: 2 })
    .then((raw) => {
      ctx.raw = raw;
      ctx.rawError = null;
      if (el) el.classList.remove("cargando");
      pintarAvisoEndpoint(ctx); // lo oculta
      // configurarFiltros -> recompute() recalcula metrics y repinta la vista activa
      configurarFiltros(ctx);
    })
    .catch((e) => {
      ctx.rawError = e.message;
      console.warn("No se pudo cargar endpoint Apps Script:", e.message);
      if (el) el.classList.remove("cargando");
      pintarAvisoEndpoint(ctx);
    });
}

// Banner de estado del endpoint: visible cuando la data cruda no cargo, con
// el error real y un boton para reintentar sin recargar la pagina.
function pintarAvisoEndpoint(ctx) {
  const el = document.getElementById("aviso-endpoint");
  if (!el) return;
  if (ctx.raw || !ctx.config.appsScriptUrl) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <strong>⚠ No se pudo cargar la data cruda del endpoint Apps Script.</strong>
    Las vistas en vivo (Contadores, Auditoría, filtros) quedan deshabilitadas y se muestra solo
    el <code>metrics.json</code> precalculado.
    <span style="opacity:.85">Error: ${ctx.rawError || "desconocido"}.</span>
    <button id="btn-reintentar-raw" type="button">↻ Reintentar</button>
    <span id="estado-reintento" style="font-style:italic"></span>
  `;
  const btn = document.getElementById("btn-reintentar-raw");
  const estado = document.getElementById("estado-reintento");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    estado.textContent = "Cargando…";
    try {
      const raw = await cargarRaw(ctx.config.appsScriptUrl, { nocache: true });
      ctx.raw = raw;
      ctx.rawError = null;
      ctx.metrics = construirMetrics(raw.instrumentos, raw.concejales, {});
      el.hidden = true;
      refrescarTimestamp(ctx);
      configurarFiltros(ctx);
      const vista = document.querySelector("nav button.active")?.dataset.view || "resumen";
      activarVista(vista, ctx);
    } catch (e) {
      ctx.rawError = e.message;
      estado.textContent = `✗ Siguió fallando: ${e.message}`;
      btn.disabled = false;
    }
  });
}

function showError(msg) {
  document.querySelectorAll(".view").forEach((s) => {
    s.innerHTML = `<div class="error">${msg}</div>`;
  });
}

function activarVista(nombre, ctx) {
  document.querySelectorAll("nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === nombre)
  );
  document.querySelectorAll(".view").forEach((s) =>
    s.classList.toggle("active", s.id === `view-${nombre}`)
  );
  const target = document.getElementById(`view-${nombre}`);
  target.innerHTML = "";
  const render = VIEWS[nombre];
  if (render) render(target, ctx);
}

// Espera a Plotly con tope: si el CDN no responde, la pagina igual debe
// renderizar (tablas y tarjetas); solo las graficas muestran un aviso.
function esperarPlotly(maxMs = 10000) {
  return new Promise((resolve) => {
    if (window.Plotly) return resolve(true);
    let transcurrido = 0;
    const id = setInterval(() => {
      transcurrido += 50;
      if (window.Plotly) { clearInterval(id); resolve(true); }
      else if (transcurrido >= maxMs) { clearInterval(id); resolve(false); }
    }, 50);
  });
}

function instalarPlotlyFallback() {
  window.Plotly = {
    newPlot(id) {
      const el = typeof id === "string" ? document.getElementById(id) : id;
      if (el) el.innerHTML = '<p class="empty">No se pudo cargar la librería de gráficas (cdn.plot.ly). Revisa la conexión y recarga la página.</p>';
      return Promise.resolve();
    },
  };
}

async function main() {
  const plotlyListo = await esperarPlotly();
  if (!plotlyListo) instalarPlotlyFallback();
  const ctx = await loadAll();
  if (!ctx) return;

  refrescarTimestamp(ctx);

  document.querySelectorAll("nav button").forEach((b) => {
    b.addEventListener("click", () => activarVista(b.dataset.view, ctx));
  });

  const btnRecalc = document.getElementById("btn-recalcular");
  const btnDescargar = document.getElementById("btn-descargar");
  const btnDescargarClasif = document.getElementById("btn-descargar-clasif");
  const estado = document.getElementById("estado-recalculo");

  if (!ctx.config.appsScriptUrl) {
    btnRecalc.disabled = true;
    btnRecalc.title = "Configura appsScriptUrl en /config.json para habilitar recálculo en vivo.";
  }

  btnRecalc.addEventListener("click", async () => {
    btnRecalc.disabled = true;
    estado.textContent = "Obteniendo datos del endpoint…";
    try {
      const teniaRaw = !!(ctx.raw && Array.isArray(ctx.raw.instrumentos));
      const raw = await cargarRaw(ctx.config.appsScriptUrl, { nocache: true });
      ctx.raw = raw;
      ctx.rawError = null;
      estado.textContent = "Calculando índices…";
      // pequeña pausa para que pinte el "Calculando..."
      await new Promise((r) => setTimeout(r, 16));
      const nuevasMetrics = construirMetrics(raw.instrumentos, raw.concejales, {});
      ctx.metrics = nuevasMetrics;
      refrescarTimestamp(ctx);
      pintarAvisoEndpoint(ctx);
      // Si la carga inicial habia fallado, la barra de filtros quedo vacia:
      // reconstruirla ahora que hay data cruda.
      if (!teniaRaw) configurarFiltros(ctx);
      const vistaActiva = document.querySelector("nav button.active")?.dataset.view || "resumen";
      activarVista(vistaActiva, ctx);
      estado.textContent = `✓ Recalculado ${new Date(nuevasMetrics.generadoEn).toLocaleTimeString("es-CO")}`;
      setTimeout(() => { estado.textContent = ""; }, 8000);
    } catch (err) {
      ctx.rawError = err.message;
      pintarAvisoEndpoint(ctx);
      estado.textContent = `✗ Error: ${err.message}`;
      console.error(err);
    } finally {
      btnRecalc.disabled = false;
    }
  });

  btnDescargar.addEventListener("click", () => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `agendapp_metrics_${ts}.json`;

    let payload;
    if (ctx.raw && Array.isArray(ctx.raw.instrumentos)) {
      // Exporta AMBOS niveles (Sector y Temática) con los filtros activos.
      const base = ctx._filtros || {};
      payload = {
        generadoEn: new Date().toISOString(),
        filtros: {
          roles: base.roles ?? "todos",
          municipios: (base.municipios && base.municipios.length) ? base.municipios : "todos",
          clasificaciones: (base.clasificaciones && base.clasificaciones.length) ? base.clasificaciones : "todas",
        },
        por_tematica: construirMetrics(ctx.raw.instrumentos, ctx.raw.concejales, { ...base, colTema: "Tematica" }),
        por_sector: construirMetrics(ctx.raw.instrumentos, ctx.raw.concejales, { ...base, colTema: "Sector" }),
      };
    } else {
      // Sin endpoint solo hay el nivel precalculado en metrics.json.
      payload = ctx.metrics;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    const doble = ctx.raw && Array.isArray(ctx.raw.instrumentos);
    estado.textContent = `↓ ${filename}${doble ? " (Temática + Sector)" : ""}`;
    setTimeout(() => { estado.textContent = ""; }, 6000);
  });

  // Descarga separada por Clasificacion legal: un bloque de metricas completo
  // (Tematica + Sector) por cada clasificacion presente (Acuerdo, Proyecto de
  // Acuerdo, ...). Respeta roles y municipios activos; el filtro de
  // clasificacion de la barra NO aplica aqui (la particion lo reemplaza).
  if (!ctx.raw || !Array.isArray(ctx.raw.instrumentos)) {
    btnDescargarClasif.disabled = true;
    btnDescargarClasif.title = "Requiere el endpoint Apps Script (configura appsScriptUrl en config.json).";
  }
  btnDescargarClasif.addEventListener("click", () => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `agendapp_metrics_por_clasificacion_${ts}.json`;
    const base = ctx._filtros || {};
    const filtrosBase = { roles: base.roles, municipios: base.municipios };

    const clasificaciones = Array.from(new Set(
      ctx.raw.instrumentos.map((r) => String(r["Clasificacion legal"] ?? "").trim())
    )).sort((a, b) => a.localeCompare(b, "es"));

    const porClasificacion = {};
    for (const c of clasificaciones) {
      const etiqueta = c || "(sin clasificacion)";
      porClasificacion[etiqueta] = {
        por_tematica: construirMetrics(ctx.raw.instrumentos, ctx.raw.concejales, { ...filtrosBase, clasificaciones: [c], colTema: "Tematica" }),
        por_sector: construirMetrics(ctx.raw.instrumentos, ctx.raw.concejales, { ...filtrosBase, clasificaciones: [c], colTema: "Sector" }),
      };
    }

    const payload = {
      generadoEn: new Date().toISOString(),
      filtros: {
        roles: filtrosBase.roles ?? "todos",
        municipios: (filtrosBase.municipios && filtrosBase.municipios.length) ? filtrosBase.municipios : "todos",
        particion: "Clasificacion legal",
      },
      clasificaciones: Object.keys(porClasificacion),
      por_clasificacion: porClasificacion,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    estado.textContent = `↓ ${filename} (${Object.keys(porClasificacion).length} clasificaciones × Temática + Sector)`;
    setTimeout(() => { estado.textContent = ""; }, 6000);
  });

  configurarFiltros(ctx);
  activarVista("resumen", ctx);
  cargarRawEnSegundoPlano(ctx);
}

const DEFAULT_ROLES = ["Proponente", "Ponente", "Coordinador"];

// Construye la barra de filtros (roles + municipios) y recalcula las métricas
// en vivo desde la data cruda del endpoint. Sin endpoint, la barra queda
// informativa porque metrics.json es precalculado y no se puede refiltrar.
function configurarFiltros(ctx) {
  const barra = document.getElementById("barra-filtros");
  const contRoles = document.getElementById("filtro-roles");
  const contMun = document.getElementById("filtro-municipios");
  const estado = document.getElementById("filtros-estado");
  barra.hidden = false;

  const tieneRaw = ctx.raw && Array.isArray(ctx.raw.instrumentos) && ctx.raw.instrumentos.length;
  barra.classList.toggle("deshabilitado", !tieneRaw);
  if (!tieneRaw) {
    contRoles.innerHTML = "";
    contMun.innerHTML = "";
    estado.textContent = "Filtros en vivo: requieren el endpoint Apps Script (configura appsScriptUrl en config.json).";
    return;
  }

  const rolesDisp = Array.from(new Set(
    ctx.raw.instrumentos.map((r) => String(r.Rol || "").trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, "es"));

  const munDisp = (ctx.raw.municipios || [])
    .map((m) => ({ dane: String(m.dane || "").padStart(5, "0"), municipio: m.municipio || m.dane }))
    .filter((m) => m.dane && m.dane !== "00000")
    .sort((a, b) => String(a.municipio).localeCompare(String(b.municipio), "es"));

  // Clasificaciones legales presentes (Acuerdo, Proyecto de Acuerdo, ...). "" = sin clasificacion.
  const clasDisp = Array.from(new Set(
    ctx.raw.instrumentos.map((r) => String(r["Clasificacion legal"] ?? "").trim())
  )).sort((a, b) => a.localeCompare(b, "es"));

  const selRoles = new Set(rolesDisp.filter((r) => DEFAULT_ROLES.some((d) => d.toLowerCase() === r.toLowerCase())));
  if (selRoles.size === 0) rolesDisp.forEach((r) => selRoles.add(r));
  const selMun = new Set(munDisp.map((m) => m.dane));
  const selClase = new Set(clasDisp); // todas por defecto
  let selColTema = "Tematica"; // nivel de analisis: "Tematica" (fino) o "Sector" (agregado)

  function chip(label, checked, onToggle) {
    const wrap = document.createElement("label");
    wrap.className = "chip";
    wrap.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""}><span></span>`;
    wrap.querySelector("span").textContent = label;
    wrap.querySelector("input").addEventListener("change", (e) => onToggle(e.target.checked));
    return wrap;
  }

  // Nivel: chips tipo radio (exclusivos)
  const contNivel = document.getElementById("filtro-nivel");
  const NIVELES = [{ val: "Tematica", label: "Temática" }, { val: "Sector", label: "Sector" }];
  function pintarNivel() {
    contNivel.innerHTML = "";
    NIVELES.forEach((n) => {
      const c = chip(n.label, selColTema === n.val, () => { selColTema = n.val; pintarNivel(); recompute(); });
      c.querySelector("input").type = "radio";
      contNivel.appendChild(c);
    });
  }
  pintarNivel();

  contRoles.innerHTML = "";
  rolesDisp.forEach((r) =>
    contRoles.appendChild(chip(r, selRoles.has(r), (on) => { on ? selRoles.add(r) : selRoles.delete(r); recompute(); }))
  );
  contMun.innerHTML = "";
  munDisp.forEach((m) =>
    contMun.appendChild(chip(m.municipio, selMun.has(m.dane), (on) => { on ? selMun.add(m.dane) : selMun.delete(m.dane); recompute(); }))
  );

  const contClase = document.getElementById("filtro-clasificacion");
  contClase.innerHTML = "";
  clasDisp.forEach((c) =>
    contClase.appendChild(chip(c || "(sin clasif.)", selClase.has(c), (on) => { on ? selClase.add(c) : selClase.delete(c); recompute(); }))
  );

  let pendiente = null;
  function recompute() {
    estado.textContent = "Recalculando…";
    clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      try {
        // Filtros activos (sin colTema): se guardan para poder exportar ambos niveles.
        ctx._filtros = {
          roles: Array.from(selRoles),
          municipios: Array.from(selMun),
          clasificaciones: selClase.size === clasDisp.length ? [] : Array.from(selClase),
        };
        ctx.metrics = construirMetrics(ctx.raw.instrumentos, ctx.raw.concejales, {
          ...ctx._filtros,
          colTema: selColTema,
        });
        refrescarTimestamp(ctx);
        const vista = document.querySelector("nav button.active")?.dataset.view || "resumen";
        activarVista(vista, ctx);
        const nivelTxt = selColTema === "Sector" ? "Sector" : "Temática";
        estado.textContent = `✓ ${nivelTxt} · ${selRoles.size} rol(es), ${selMun.size}/${munDisp.length} municipio(s) · ${ctx.metrics.concejales.length} concejales`;
      } catch (err) {
        estado.textContent = `✗ ${err.message}`;
        console.error(err);
      }
    }, 30);
  }

  // Recalcula una vez al cargar para reflejar el set de roles por defecto
  // (incluye Coordinador) sobre la data en vivo, aunque metrics.json sea viejo.
  recompute();
}

function refrescarTimestamp(ctx) {
  const el = document.getElementById("generado-en");
  if (!ctx.metrics.generadoEn) return;
  const origen = ctx.metrics._origen === "navegador" ? " (recalculado en navegador)" : "";
  el.textContent = `Métricas generadas: ${new Date(ctx.metrics.generadoEn).toLocaleString("es-CO")}${origen}`;
}

main();
