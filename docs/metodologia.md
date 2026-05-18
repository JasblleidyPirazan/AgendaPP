# Metodología AgendaPP

## Hipótesis a contrastar

| Hipótesis | Mecanismo | Predicción |
|---|---|---|
| **H1 — Uniformidad Partidista** | Las agendas las determinan las directrices del partido. | Alta uniformidad **intra**-partido (concejales del mismo partido se parecen). Alta diferencia **entre** partidos. |
| **H2 — Autonomía Individual** | Las agendas responden a motivaciones individuales. | Baja uniformidad intra. Baja diferencia entre partidos (cada concejal se parece más a su propia idiosincrasia que a su partido). |

## Datos

- **Unidad de observación**: instrumento legislativo (Acuerdo, Proyecto de Acuerdo, Política Pública, etc.) — fila `Identificador` en hoja `Instrumentos`.
- **Atribución a actores**: cada instrumento puede tener varias filas con distintos `Rol` (Proponente, Ponente, Coordinador, ...).
- **Filtro inicial**: `Incluir en analisis == "Si"`.
- **Atribución temática por defecto**: solo `Rol == Proponente` (autoría). Cambiable con `--rol`.
- **Variable temática por defecto**: `Tematica` OPPAM. Alternativas: `Sector` (agregación más alta) o `Tema segun Concejo` (texto libre, no estandarizado — solo para auditoría).
- **Umbral mínimo**: concejales con < 3 instrumentos atribuidos se reportan pero **se excluyen** del cálculo de CV y Jaccard intra-partido (su H sí se reporta, marcado).

## Índices

### 1. Diversidad temática individual — Shannon normalizado (Pielou)

$$H'_{\text{norm}}(c) = \frac{-\sum_{t \in T_c} p_{c,t} \ln p_{c,t}}{\ln |T_c|}$$

donde $p_{c,t}$ es la proporción de instrumentos del concejal $c$ en el tema $t$, y $|T_c|$ es la **riqueza observada** (temas con conteo positivo). Si $|T_c| \le 1$, se define $H' = 0$.

- $H' = 0$: especialización total (un solo tema).
- $H' = 1$: uniformidad perfecta (instrumentos repartidos por igual entre todos los temas que toca).
- $H' = 0.5$: especialización moderada.

Referencias: [Shannon (1948)](https://en.wikipedia.org/wiki/Shannon%27s_entropy), [Pielou (1966)](https://en.wikipedia.org/wiki/Species_evenness#Pielou's_evenness_index), [statology — Shannon](https://www.statology.org/shannon-diversity-index/), [statology — Pielou](https://www.statology.org/how-to-calculate-interpret-pielous-evenness-index/), [LibreTexts — diversity](https://bio.libretexts.org/Courses/Gettysburg_College/01:_Ecology_for_All/22:_Biodiversity/22.02:_Diversity_Indices).

### 2. Uniformidad de comportamiento — CV de Shannon

$$\text{CV}(P) = \frac{\sigma(H'_{c \in P})}{\mu(H'_{c \in P})}$$

con $P$ = partido, $H'_c$ los Shannon normalizados de sus concejales (aptos).

- **CV ≤ 0.3**: los concejales del partido tienen perfiles de diversidad similares → apoya H1a.
- **CV > 0.3**: dispersión amplia → apoya H2a.

(Usa desviación muestral, $\text{ddof}=1$, porque los grupos suelen ser pequeños.)

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

Para cada partido con CV y J definidos:

| Condición | Lectura |
|---|---|
| CV ≤ 0.3 **y** J ≥ 0.5 | Apoya H1 (uniformidad) |
| CV > 0.3 **y** J < 0.5 | Apoya H2 (autonomía) |
| Otra combinación | Ambiguo |

Las correlaciones inter-partido se reportan como evidencia adicional: bajo H1 esperamos correlaciones predominantemente bajas/negativas entre partidos rivales; bajo H2 esperamos correlaciones altas (todos los partidos tendrían perfiles parecidos a la "media legislativa").

## Limitaciones y notas

1. **Adaptación a partir de la ecología.** Shannon y Pielou fueron diseñados para diversidad de especies; aquí se aplican a temas legislativos. La literatura de cohesión partidista típicamente usa **roll-call votes** ([B-Call, Frontiers 2025](https://www.frontiersin.org/journals/political-science/articles/10.3389/fpos.2025.1670089/full)). Aplicarlos a la composición temática de **instrumentos** es razonable pero **no es el estándar** — debe declararse en cualquier reporte.

2. **Sensibilidad a la atribución de autoría.** El default es `Proponente`. Incluir `Ponente`/`Coordinador` aumenta el `n` por concejal pero diluye la señal de "agenda propia". Comparar ambos escenarios es recomendable.

3. **Riqueza observada vs. universo.** El Shannon se normaliza por la **riqueza observada del concejal** (no por el universo global). Esto evita penalizar a concejales de bajo volumen y se alinea con la práctica ecológica; el costo es que dos concejales con `H = 1` pero distintos `|T_c|` no son directamente comparables. Usar `n_instrumentos` como contexto.

4. **Universo de temas.** Para Pearson inter-partido **sí** se alinea al universo global (rellenando con 0 los temas no tocados), porque la comparación requiere vectores de la misma dimensión.

5. **Concejales con baja actividad.** El umbral de 3 instrumentos es heurístico. Para municipios pequeños puede ser demasiado restrictivo; ajustarlo con `--min-instrumentos` y reportar siempre cuántos se excluyeron.

6. **ADMINISTRACION como "partido".** Las filas con `Partido / Movimiento = ADMINISTRACION` representan iniciativas del ejecutivo, no del concejo. Suelen tener `ID_Concejal = ADMINISTRACION`. En análisis comparativos entre partidos políticos conviene **filtrarlas** antes de calcular CV/J/Pearson; el pipeline actual las incluye y queda a discreción del notebook excluirlas.

## Referencias

- Shannon, C. E. (1948). *A mathematical theory of communication.* Bell System Technical Journal.
- Pielou, E. C. (1966). *The measurement of diversity in different types of biological collections.* Journal of Theoretical Biology.
- Jaccard, P. (1912). *The distribution of the flora in the alpine zone.* New Phytologist.
- Operativas: [Statology — Shannon](https://www.statology.org/shannon-diversity-index/), [Statology — Pielou](https://www.statology.org/how-to-calculate-interpret-pielous-evenness-index/), [LibreTexts — Diversity Indices](https://bio.libretexts.org/Courses/Gettysburg_College/01:_Ecology_for_All/22:_Biodiversity/22.02:_Diversity_Indices).
- Cohesión legislativa: [B-Call (Frontiers, 2025)](https://www.frontiersin.org/journals/political-science/articles/10.3389/fpos.2025.1670089/full), [Wikipedia — Jaccard index](https://en.wikipedia.org/wiki/Jaccard_index).
