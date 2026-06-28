export function renderResumen(root, ctx) {
  const m = ctx.metrics;
  const v = m.veredicto;

  const munSel = m.parametros?.municipios;
  const nMunicipios = Array.isArray(munSel) ? munSel.length
    : (m.municipios?.length ?? ctx.raw?.municipios?.length ?? "—");
  const nInstrumentos = m.n_instrumentos_unicos_incluidos ?? "—";
  const nInstrumentosTotal = m.n_instrumentos_unicos_total ?? "—";
  const municipiosTxt = Array.isArray(munSel) ? munSel.join(", ") : "Todos";

  root.innerHTML = `
    <div class="veredicto">
      <h3>Veredicto preliminar: ${v.interpretacion}</h3>
      <p>
        Partidos que apoyan <strong>H1 (Uniformidad Partidista)</strong>: ${v.partidos_apoyan_H1}
        · <strong>H2 (Autonomía Individual)</strong>: ${v.partidos_apoyan_H2}
        · ambiguos: ${v.partidos_ambiguos}
      </p>
      <p style="font-size:0.85rem;color:var(--muted)">
        Veredicto por convergencia temática (Jaccard): J ≥ ${v.umbral_jaccard} → apoya H1; J &lt; ${v.umbral_jaccard} → apoya H2.
      </p>
    </div>

    <div class="cards">
      <div class="card"><div class="label">Concejales</div><div class="value">${m.concejales.length}</div></div>
      <div class="card"><div class="label">Partidos</div><div class="value">${m.partidos.length}</div></div>
      <div class="card"><div class="label">Sectores</div><div class="value">${(m.universo_sectores ?? []).length}</div></div>
      <div class="card"><div class="label">Niveles (${m.parametros?.tema ?? "Temática"})</div><div class="value">${m.universo_temas.length}</div></div>
      <div class="card"><div class="label">Municipios</div><div class="value">${nMunicipios}</div></div>
      <div class="card">
        <div class="label">Instrumentos (incluidos)</div>
        <div class="value">${nInstrumentos}</div>
        <div style="color:var(--muted);font-size:0.75rem;margin-top:0.25rem">${nInstrumentosTotal} en total (Si + No)</div>
      </div>
    </div>

    <h3>Parámetros del análisis</h3>
    <table>
      <tr><th>Rol(es)</th><td>${m.parametros.rol.join(", ")}</td></tr>
      <tr><th>Municipios</th><td>${municipiosTxt}</td></tr>
      <tr><th>Columna de tema</th><td>${m.parametros.tema}</td></tr>
      <tr><th>Mínimo de instrumentos</th><td>${m.parametros.min_instrumentos}</td></tr>
      <tr><th>Concejales excluidos por mínimo</th><td>${m.excluidos_min_instrumentos.length}</td></tr>
    </table>
  `;
}
