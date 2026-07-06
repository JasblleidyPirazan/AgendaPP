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

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.json();
}

async function loadAll() {
  let config = { appsScriptUrl: "" };
  try { config = await fetchJSON("/config.json"); } catch (_) { /* ok */ }

  let metrics = null;
  try {
    metrics = await fetchJSON("/data/metrics.json");
  } catch (e) {
    showError("No se pudo cargar /data/metrics.json. Corre `python build_metrics.py` en analysis/.");
    return null;
  }

  let raw = null;
  if (config.appsScriptUrl) {
    try {
      raw = await fetchJSON(`${config.appsScriptUrl}?recurso=todo`);
    } catch (e) {
      console.warn("No se pudo cargar endpoint Apps Script:", e.message);
    }
  }

  return { config, metrics, raw };
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

function esperarPlotly() {
  return new Promise((resolve) => {
    if (window.Plotly) return resolve();
    const id = setInterval(() => {
      if (window.Plotly) { clearInterval(id); resolve(); }
    }, 50);
  });
}

async function main() {
  await esperarPlotly();
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
      const raw = await fetchJSON(`${ctx.config.appsScriptUrl}?recurso=todo&nocache=1`);
      ctx.raw = raw;
      estado.textContent = "Calculando índices…";
      // pequeña pausa para que pinte el "Calculando..."
      await new Promise((r) => setTimeout(r, 16));
      const nuevasMetrics = construirMetrics(raw.instrumentos, raw.concejales, {});
      ctx.metrics = nuevasMetrics;
      refrescarTimestamp(ctx);
      const vistaActiva = document.querySelector("nav button.active")?.dataset.view || "resumen";
      activarVista(vistaActiva, ctx);
      estado.textContent = `✓ Recalculado ${new Date(nuevasMetrics.generadoEn).toLocaleTimeString("es-CO")}`;
      setTimeout(() => { estado.textContent = ""; }, 8000);
    } catch (err) {
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
  if (!tieneRaw) {
    barra.classList.add("deshabilitado");
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
