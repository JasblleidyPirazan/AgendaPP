# Metodología AgendaPP

## Hipótesis a contrastar

| Hipótesis | Mecanismo | Predicción |
|---|---|---|
| **H1 — Uniformidad Partidista** | Las agendas las determinan las directrices del partido. | Alta uniformidad **intra**-partido (concejales del mismo partido se parecen). Alta diferencia **entre** partidos. |
| **H2 — Autonomía Individual** | Las agendas responden a motivaciones individuales. | Baja uniformidad intra. Baja diferencia entre partidos (cada concejal se parece más a su propia idiosincrasia que a su partido). |

## Datos

- **Unidad de observación**: instrumento legislativo (Acuerdo, Proyecto de Acuerdo, Política Pública, etc.) — fila `Identificador` en hoja `Instrumentos`.
- **Atribución a actores**: cada instrumento puede tener varias filas con distintos `Rol` (Proponente, Ponente, Coordinador, ...).
- **Filtro inicial**: se incluye toda fila **salvo** las marcadas `Incluir en analisis == "No"` (vacío = incluido). La plantilla v2 deja en blanco lo que entra y marca solo lo excluido con "No"; la plantilla vieja usa "Si". Ambas funcionan con esta regla.
- **Atribución temática por defecto**: `Rol ∈ {Proponente, Ponente, Coordinador}` (autoría, ponencia y coordinación). Cambiable con `--rol` (o con los chips de rol en el dashboard).
- **Filtro por municipio**: opcional, con `--municipios` (nombres o códigos DANE) o los chips de municipio del dashboard. Vacío = todos. Permite contrastar si la diferenciación temática varía entre municipios.
- **Variable temática por defecto**: `Tematica` OPPAM. Alternativas: `Sector` (agregación más alta) o `Tema segun Concejo` (texto libre, no estandarizado — solo para auditoría).
- **Umbral mínimo**: por defecto **N = 1** (todos los concejales con al menos un instrumento entran a CV y Jaccard). Un concejal con un único instrumento tiene `H = 0` por construcción — eso **es** información (hiperespecialización), no ruido. El parámetro se puede subir con `--min-instrumentos` si se quiere ser conservador (p. ej., 3 para sólo concejales con volumen suficiente para que su `H` sea estadísticamente más estable).

## Índices

### 1. Diversidad temática individual — Shannon normalizado (Pielou)

$$H'_{\text{norm}}(c) = \frac{-\sum_{t \in T_c} p_{c,t} \ln p_{c,t}}{\ln |T_c|}$$

donde $p_{c,t}$ es la proporción de instrumentos del concejal $c$ en el tema $t$, y $|T_c|$ es la **riqueza observada** (temas con conteo positivo). Si $|T_c| \le 1$, se define $H' = 0$.

- $H' = 0$: especialización total (un solo tema).
- $H' = 1$: uniformidad perfecta (instrumentos repartidos por igual entre todos los temas que toca).
- $H' = 0.5$: especialización moderada.

Referencias: [Shannon (1948)](https://en.wikipedia.org/wiki/Shannon%27s_entropy), [Pielou (1966)](https://en.wikipedia.org/wiki/Species_evenness#Pielou's_evenness_index), [statology — Shannon](https://www.statology.org/shannon-diversity-index/), [statology — Pielou](https://www.statology.org/how-to-calculate-interpret-pielous-evenness-index/), [LibreTexts — diversity](https://bio.libretexts.org/Courses/Gettysburg_College/01:_Ecology_for_All/22:_Biodiversity/22.02:_Diversity_Indices).

### 2. Diversidad temática por partido — Shannon del bloque

$$H'_{\text{norm}}(P) = \frac{-\sum_{t \in T_P} \pi_P(t) \ln \pi_P(t)}{\ln |T_P|}$$

donde $\pi_P(t)$ es la proporción de los instrumentos del partido $P$ en el tema $t$ (perfil agregado, ver índice 4) y $|T_P|$ es la riqueza observada del partido (temas con al menos un instrumento). Si $|T_P| \le 1$, se define $H' = 0$.

- **H' ≈ 0**: el partido concentra su actividad en muy pocos temas (agenda focalizada).
- **H' ≈ 1**: reparte sus instrumentos de forma pareja entre los temas que aborda (agenda amplia).

Mide al partido **como bloque**, no la dispersión entre sus concejales. No mide convergencia (eso es Jaccard, índice 3).

> Nota: el coeficiente de variación de Shannon intra-partido (CV = σ/μ de los $H'_c$) se retiró del pipeline y del dashboard por defecto. La función `cv_shannon` sigue disponible en `agendapp.indices` para análisis ad-hoc.

### 3. Convergencia temática intra-partido — Jaccard pareado promedio

Para cada partido $P$ con concejales $\{c_1, \ldots, c_n\}$, sea $A_i$ = conjunto de temas con al menos un instrumento atribuido al concejal $c_i$. El índice es:

$$J(P) = \binom{n}{2}^{-1} \sum_{i<j} \frac{|A_i \cap A_j|}{|A_i \cup A_j|}$$

- **J ≥ 0.5**: alta convergencia (los concejales tocan temas comunes).
- **J < 0.5**: baja convergencia (cada uno aborda temas distintos).

Cuando ambos conjuntos están vacíos se define $J = 1$ (igualdad por ausencia). Requiere ≥ 2 concejales aptos.

Referencias: [Jaccard (1912)](https://en.wikipedia.org/wiki/Jaccard_index).

### 4. Convergencia inter-partido — Pearson sobre perfiles agregados

Para cada partido se calcula el **perfil temático**:

$$\pi_P(t) = \frac{\sum_{c \in P} n_{c,t}}{\sum_{c \in P} \sum_{t'} n_{c,t'}}$$

(proporción de los instrumentos del partido que tocan el tema $t$, alineado al universo global de temas).

Entre pares de partidos $(A, B)$ se reporta $r_{AB} = \text{Pearson}(\pi_A, \pi_B) \in [-1, 1]$.

- $r \approx 1$: perfiles temáticos iguales.
- $r \approx 0$: independientes.
- $r \approx -1$: opuestos.

## Veredicto operativo

Para cada partido con J definido (≥ 2 concejales aptos), la convergencia temática intra-partido (Jaccard) decide la lectura:

| Condición | Lectura |
|---|---|
| J ≥ 0.5 | Apoya H1 (los concejales convergen en temas → señal de agenda partidista) |
| J < 0.5 | Apoya H2 (cada concejal aborda temas distintos → autonomía) |
| J indefinido (< 2 aptos) | Ambiguo |

El veredicto global toma la mayoría de partidos. El Shannon por partido (índice 2) y las correlaciones inter-partido (índice 4) se reportan como evidencia adicional: bajo H1 esperamos correlaciones predominantemente bajas/negativas entre partidos rivales; bajo H2 esperamos correlaciones altas (todos los partidos tendrían perfiles parecidos a la "media legislativa").

## Limitaciones y notas

1. **Adaptación a partir de la ecología.** Shannon y Pielou fueron diseñados para diversidad de especies; aquí se aplican a temas legislativos. La literatura de cohesión partidista típicamente usa **roll-call votes** ([B-Call, Frontiers 2025](https://www.frontiersin.org/journals/political-science/articles/10.3389/fpos.2025.1670089/full)). Aplicarlos a la composición temática de **instrumentos** es razonable pero **no es el estándar** — debe declararse en cualquier reporte.

2. **Sensibilidad a la atribución de autoría.** El default incluye `Proponente`, `Ponente` y `Coordinador`, lo que maximiza el `n` por concejal a costa de diluir la señal de "agenda propia" (ponencia y coordinación no implican iniciativa). Para aislar solo la autoría estricta, correr con `--rol Proponente`; comparar escenarios es recomendable. Los chips de rol del dashboard permiten alternar en vivo.

3. **Riqueza observada vs. universo.** El Shannon se normaliza por la **riqueza observada del concejal** (no por el universo global). Esto evita penalizar a concejales de bajo volumen y se alinea con la práctica ecológica; el costo es que dos concejales con `H = 1` pero distintos `|T_c|` no son directamente comparables. Usar `n_instrumentos` como contexto.

4. **Universo de temas.** Para Pearson inter-partido **sí** se alinea al universo global (rellenando con 0 los temas no tocados), porque la comparación requiere vectores de la misma dimensión.

5. **Concejales con baja actividad.** El default `N=1` los incluye. Si se elige subir el umbral (p. ej., 3), reportar siempre cuántos se excluyeron — el filtro descarta justamente a los más especializados, lo que puede sesgar el CV intra-partido hacia menores valores (al excluir los outliers de `H=0`).

6. **ADMINISTRACION excluida.** Las filas con `Partido / Movimiento` o `ID_Concejal` que empiezan por `ADMINISTRAC...` (incl. "ADMINISTRACIÓN MUNICIPAL") representan iniciativas del ejecutivo, no del concejo. **El pipeline las excluye de todos los conteos y métricas por defecto** (Python y dashboard).

7. **Canonización de categorías.** Antes de calcular, las variantes de `Tematica`/`Sector` que solo difieren en **mayúsculas, tildes o espacios** se unifican (se conserva la variante original más frecuente como etiqueta). Evita que, p. ej., "...e innovacion" y "...e Innovacion" cuenten como dos temas distintos y fragmenten Shannon/Jaccard/Pearson.

## Referencias

- Shannon, C. E. (1948). *A mathematical theory of communication.* Bell System Technical Journal.
- Pielou, E. C. (1966). *The measurement of diversity in different types of biological collections.* Journal of Theoretical Biology.
- Jaccard, P. (1912). *The distribution of the flora in the alpine zone.* New Phytologist.
- Operativas: [Statology — Shannon](https://www.statology.org/shannon-diversity-index/), [Statology — Pielou](https://www.statology.org/how-to-calculate-interpret-pielous-evenness-index/), [LibreTexts — Diversity Indices](https://bio.libretexts.org/Courses/Gettysburg_College/01:_Ecology_for_All/22:_Biodiversity/22.02:_Diversity_Indices).
- Cohesión legislativa: [B-Call (Frontiers, 2025)](https://www.frontiersin.org/journals/political-science/articles/10.3389/fpos.2025.1670089/full), [Wikipedia — Jaccard index](https://en.wikipedia.org/wiki/Jaccard_index).
