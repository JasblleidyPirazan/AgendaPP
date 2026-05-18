// Punto de entrada: carga config + metrics.json, renderiza vistas, gestiona navegacion.
import { renderResumen } from "/src/views/resumen.js";
import { renderInstrumentos } from "/src/views/instrumentos.js";
import { renderPartidos } from "/src/views/partidos.js";
import { renderShannon } from "/src/views/shannon.js";
import { renderCV } from "/src/views/cv.js";
import { renderJaccard } from "/src/views/jaccard.js";
import { renderCorr } from "/src/views/correlaciones.js";
import { renderAuditoria } from "/src/views/auditoria.js";
import { construirMetrics } from "/src/metrics.js";

const VIEWS = {
  resumen: renderResumen,
  instrumentos: renderInstrumentos,
  partidos: renderPartidos,
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

  refrescarTimestamp(ctx);

  document.querySelectorAll("nav button").forEach((b) => {
    b.addEventListener("click", () => activarVista(b.dataset.view, ctx));
  });

  const btnRecalc = document.getElementById("btn-recalcular");
  const btnDescargar = document.getElementById("btn-descargar");
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
    const blob = new Blob([JSON.stringify(ctx.metrics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    estado.textContent = `↓ ${filename}`;
    setTimeout(() => { estado.textContent = ""; }, 5000);
  });

  activarVista("resumen", ctx);
}

function refrescarTimestamp(ctx) {
  const el = document.getElementById("generado-en");
  if (!ctx.metrics.generadoEn) return;
  const origen = ctx.metrics._origen === "navegador" ? " (recalculado en navegador)" : "";
  el.textContent = `Métricas generadas: ${new Date(ctx.metrics.generadoEn).toLocaleString("es-CO")}${origen}`;
}

main();
