# Glosario AgendaPP

| Término | Definición |
|---|---|
| **Concejal** | Miembro del Concejo Municipal. Identificado por `ID_Concejal` = `<DANE>-<NNN>`. |
| **Instrumento** | Pieza legislativa (acuerdo, proyecto de acuerdo, política pública, lineamiento). Identificada por `<Numero>-<Anio>` dentro del municipio. |
| **Rol** | Participación del actor en el instrumento: `Proponente` (autoría), `Ponente`, `Coordinador`, `Administracion` (cuando lo presenta el ejecutivo). |
| **OPPAM** | Observatorio de Política Pública del Área Metropolitana. Provee la taxonomía cerrada de **Sector** y **Tematica** que se usa para clasificar instrumentos. |
| **Sector** | Agregación temática alta (Ambiente y desarrollo sostenible, Cultura, Economía, Salud, …). Columna `Sector` en `Instrumentos`. |
| **Tematica** | Sub-clasificación dentro del sector (Bienestar animal, Cambio climático, Audiovisual, …). Columna `Tematica`. Es la columna por defecto para los índices. |
| **Tema segun Concejo** | Texto libre que el propio concejo le asignó al instrumento (no estandarizado). Solo para auditoría. |
| **DANE** | Código del Departamento Administrativo Nacional de Estadística para el municipio (5 dígitos). |
| **Periodo de Gobierno** | Cuatrienio del concejal (`2012 - 2015`, `2016 - 2019`, `2020 - 2023`, …). |
| **Camaleón** | Concejal que cambió de partido entre periodos o dentro del periodo. Flag `Es camaleon` en `MaestroConcejales`. |
| **Coalición** | Alianza temporal de partidos. Marcada como `TIPO = COALICION` en `MaestroPartidos`. |
| **Plantilla AgendaPP** | Estructura idéntica de Excel/Sheet que comparten todos los municipios (hojas Instructivo, DatosMunicipio, MaestroConcejales, MaestroPartidos, Instrumentos, Proyectos_a_Acuerdo, Ejemplo, Listas). |
| **Universo de temas** | Conjunto global de temas (`Tematica`) observados en al menos un instrumento `Incluir=Si`. Sirve para alinear vectores entre partidos al calcular Pearson. |
| **Concejal apto** | Concejal con ≥ N instrumentos atribuidos como autor (Proponente o Ponente; default N=1). Solo los aptos cuentan para CV y Jaccard intra-partido. |
| **CV** | Coeficiente de Variación. Aquí: σ/μ de los Shannon normalizados de los concejales de un partido. |
| **Jaccard pareado** | Promedio de los Jaccard sobre todos los pares de concejales del partido (matriz binarizada concejal × tema). |
