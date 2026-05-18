// Punto de entrada: carga config + metrics.json, renderiza vistas, gestiona navegacion.
import { renderResumen } from "/src/views/resumen.js";
import { renderShannon } from "/src/views/shannon.js";
import { renderCV } from "/src/views/cv.js";
import { renderJaccard } from "/src/views/jaccard.js";
import { renderCorr } from "/src/views/correlaciones.js";
import { renderAuditoria } from "/src/views/auditoria.js";

const VIEWS = {
  resumen: renderResumen,
  shannon: renderShannon,
  cv: renderCV,
  jaccard: renderJaccard,
  corr: renderCorr,
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

  if (ctx.metrics.generadoEn) {
    document.getElementById("generado-en").textContent =
      `Métricas generadas: ${new Date(ctx.metrics.generadoEn).toLocaleString("es-CO")}`;
  }

  document.querySelectorAll("nav button").forEach((b) => {
    b.addEventListener("click", () => activarVista(b.dataset.view, ctx));
  });

  activarVista("resumen", ctx);
}

main();
