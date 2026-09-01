# Reglas del esquema — Pliegos Técnicos RIC (v1.0)

Documento de referencia para parsear los 18 pliegos restantes con el mismo criterio
usado en RIC N°01 (piloto). Cada regla surgió de un fallo real encontrado probando
el buscador contra el JSON, no de una suposición de diseño.

## 1. Estructura general del JSON por pliego

```
{
  pliego_id, numero, materia, metadata,
  referencias_normativas[],
  terminologia[],
  secciones[ { numero, titulo, puntos[ { numero, texto, subpuntos[], refs_cruzadas[], anexos_relacionados[], excepcion } ] } ],
  anexos[ { numero, titulo, tipo, ...campos según tipo, referenciado_por[] } ],
  referencias_a_otros_pliegos[]
}
```

## 2. Cada tipo de contenido va en su propio campo — nunca aplanado a texto

| Tipo de nodo | Campo donde vive el contenido | NO hacer |
|---|---|---|
| Punto normativo | `texto` (string) | — |
| Definición | `definicion` (string) | — |
| Advertencia / prohibición destacada | `advertencia` (string) | — |
| Fórmula | `formula` (string) + `variables` (objeto) | No convertir a texto libre |
| Tabla | `columnas` (array) + `filas` (array de arrays) | **Nunca** unir filas en un string tipo "BT-1 6 1 1.3..." — se pierde la tabla como tabla |
| Figura/diagrama sin datos tabulares | `descripcion_figura` (string) + referencia a imagen | No inventar la descripción; transcribir lo que se ve |

**Motivo:** la v1 del buscador de prueba aplanaba todo a texto por comodidad de búsqueda,
y el resultado fue ilegible (Anexo 1.3 mostrado como bloque de números corridos).
La estructura del JSON estaba bien desde el principio — el error estaba en cómo la interfaz
la consumía. **Regla: cualquier interfaz debe renderizar cada tipo en su formato nativo
(tabla → `<table>`, fórmula → fórmula, imagen → `<img>`), nunca aplanar por defecto.**

## 3. Imágenes: van por archivo, nunca incrustadas en el JSON

- El JSON solo guarda una referencia: `"imagen": "ric-01/anexo-1-1.png"` (ruta relativa).
- El archivo de imagen se extrae de la página del PDF correspondiente al anexo
  (`pdftoppm -png -r 150`), se recorta el encabezado con logos (~5% superior) y el
  espacio en blanco sobrante (trim automático por bounding box).
- Para pruebas rápidas offline (un solo HTML de escritorio) sí se puede incrustar en
  base64, pero **esa es una excepción de herramienta de prueba, no el formato final.**
  Incrustar en el JSON de producción rompe el peso del sitio al escalar a 19 pliegos.

## 4. Referencias cruzadas son bidireccionales

- Un punto que depende de un anexo lleva `anexos_relacionados: ["1.4"]`.
- El anexo, a su vez, lleva `referenciado_por: ["7.8.5", "7.9.2"]`.
- Un punto que depende de otro pliego lleva `refs_cruzadas: ["RIC N°15 punto 7.2"]`,
  y además se resume al final del documento en `referencias_a_otros_pliegos[]`.

**Motivo:** sin esto, mostrar "aquí se prohíben las cajas de distribución" (Anexo 1.6)
al leer el punto 7.14 requiere que el usuario adivine que existe esa advertencia en
otro lugar del documento.

## 5. Búsqueda: por palabras, no por frase exacta, y sin distinguir tildes

- Nunca buscar coincidencia de la frase completa tal cual fue escrita.
- Partir la consulta en palabras y exigir que **todas** aparezcan en el texto del nodo
  (lógica AND), en cualquier orden, sin importar singular/plural.
- Normalizar tildes antes de comparar (`NFD` + remover marcas diacríticas), en la
  consulta y en el contenido, para que "monofasico" y "monofásico" sean equivalentes.

**Motivo:** "empalme monofásico" (singular) no encontraba nada porque el texto real dice
"empalmes monofásicos" (plural) — coincidencia de frase exacta es demasiado rígida para
cómo escribe la gente en terreno.

**Nota para producción:** esto se resuelve mejor con Fuse.js (tokenización, tolerancia a
errores de tipeo y ranking por relevancia de fábrica) en vez de mantener a mano la lógica
de tokenizar+normalizar. La versión de prueba lo hizo a mano solo para validar el esquema
sin agregar una dependencia externa todavía.

## 6. El JSON no lleva un campo "resumen buscable" duplicado

Se evaluó agregar un campo único que concentrara todo el texto de un nodo para
facilitar la búsqueda. Se descartó: duplica contenido y arriesga desincronización si
se edita un campo y no el otro. La combinación de campos para búsqueda es
responsabilidad de la capa de búsqueda (configuración de `keys` en Fuse.js), no del
dato en sí.

## 7bis. Extensiones agregadas en RIC N°04 (Conductores y canalizaciones)

RIC N°04 es, por lejos, el pliego más largo y con más tablas hasta ahora (90 páginas, 29 tablas,
12 anexos). Aparecieron patrones nuevos:

- **Campo `lista`**: para viñetas simples sin numeración ni letra propia en el PDF (ej. punto 5.5,
  "los materiales deberán ser: • Retardante de llama. • No propagador..."). Distinto de `subpuntos`,
  que se reserva para ítems que sí tienen numeración (`7.1.1.1`) o letra (`a)`, `b)`) propia en el
  original.
- **Tablas con celdas verticalmente combinadas** (ej. Tabla N°4.2, características de conductores):
  cuando una misma descripción larga aplica a varias filas de datos (y dentro de esas filas cambia
  además la letra de identificación del conductor), no se aplana a una fila por dato — se usa una
  fila por descripción, con la última columna siendo un array de objetos
  `{letra, seccion_nominal_mm2 (o _awg), espesor_mm[, tension_servicio_V]}` que preserva la relación
  letra↔sección↔espesor sin repetir párrafos completos de texto.
- **Columnas de tabla con encabezado rotado en el PDF** (Tablas N°4.8 y N°4.9): el extractor de
  texto fusiona encabezados de columna rotados verticalmente en una sola cadena. Si el número de
  valores por fila no calza con el número de encabezados que sugiere el texto plano, hay que
  renderizar la página como imagen (`pdftoppm`) para confirmar si es una columna combinada real o
  varias columnas separadas — no asumir por conteo de texto. En RIC N°04 se confirmó visualmente
  que es una única columna combinada ("Escalerillas portaconductores / Bandejas tipo pesado /
  Canastillos portaconductores").
- **`"tipo": "mixto"` para anexos**: cuando un anexo combina párrafos introductorios numerados,
  varias tablas de definición, un apéndice con sus propios calibres/diagramas y texto explicativo
  suelto (caso del Anexo 4.1, grados de protección IP/IK), no calza con ningún `tipo` anterior
  (`figura`, `figura_texto`, `tabla`, `formula`, `figura_referencias`, `figura_multiple`). Se creó
  `"tipo": "mixto"` con los campos que correspondan (`texto_introductorio`, `tablas`, `apendice`, etc.).
- **Campo `diagramas`** (Anexo 4.4): para anexos que muestran una disposición espacial de valores
  (ductos como círculos con un porcentaje inscrito, agrupados en distintos arreglos), no una tabla
  columnas/filas convencional. Se usa un array de `{disposicion, filas}` donde `filas` es la matriz
  de valores tal como aparece agrupada.
- **Si el equipo no tiene poppler/pdftoppm instalado**: no bloquear el pliego por eso — completar
  igual todo el texto y las tablas, dejando las rutas de imagen esperadas en el campo `imagen`
  (convención `ric-0X/anexo-X-Y.png`) y anotando en `extensiones_no_previstas_en_v1` que las
  imágenes quedan pendientes. Si es viable, instalar poppler vía gestor de paquetes (en Windows,
  `winget install oschwartz10612.Poppler`) e ImageMagick (`winget install ImageMagick.Q16`, usado
  para el recorte por bounding-box en vez de Python+Pillow) y completar las imágenes en la misma
  sesión — así se evita dejar el pliego a medias.

## 7ter. Extensiones agregadas en RIC N°05 (Tensiones peligrosas)

RIC N°05 es chico (19 páginas) pero tiene muchas figuras (esquemas TN-S/TN-C/TN-C-S/TT/IT)
**intercaladas dentro del cuerpo del texto**, no reunidas en un anexo al final como en los
pliegos anteriores. Patrones nuevos:

- **Campo `figura` en un punto**: cuando el PDF referencia "Ver figura N.N" y la figura aparece
  ahí mismo, en medio del texto (no en un anexo), se agrega un campo `figura` al punto que la
  cita, con la forma `{numero, titulo, descripcion_figura, imagen}` — mismo patrón de imagen que
  los anexos, pero sin ser un anexo formal (no tiene entrada en el array `anexos[]`, no tiene
  `referenciado_por`, porque ya vive junto al único punto que la usa).
- **Campo `nota_final`**: cuando después de una lista de sub-ítems con letra hay uno o dos
  párrafos de cierre sin numeración propia en el PDF (ej. "Este tipo de protección se utiliza
  en instalaciones que se efectúen en o sobre calderas..."), se agregan en un campo `nota_final`
  (string) en el punto padre — es la contraparte de `notas_adicionales` (que va después de una
  tabla) pero para cuando lo que precede es una lista de subpuntos, no una tabla.
- **Sub-ítems con numeral romano** (i., ii., iii.): mismo patrón que los sub-ítems con letra
  (numero sintético + campo `letra_original` con el numeral romano tal como aparece en el PDF).

## 7quater. Extensiones agregadas en RIC N°06 (Puesta a tierra y enlace equipotencial)

RIC N°06 es el primer pliego cuyos anexos dejan de ser "texto + una figura o tabla" y pasan a
tener estructura interna propia (subsecciones, múltiples fórmulas, ilustraciones sin numerar).
Patrones nuevos, todos a nivel de anexo (objeto dentro de `anexos[]`):

- **`"tipo": "formula"` para anexos sin ninguna imagen**: el Anexo 6.1 (criterios de tensión de
  paso y de contacto tolerables, IEEE 80) es puramente matemático — siete fórmulas relacionadas
  y su tabla de variables, sin ningún diagrama. Se agregó el campo `formulas` (array de
  `{descripcion, formula}`) para no forzar siete fórmulas distintas dentro de un único campo
  `formula` string. No se generó archivo de imagen para este anexo — no hace falta forzar uno
  cuando el PDF no trae ningún diagrama.
- **Campo `secciones` dentro de un anexo** (Anexo 6.3, metodología de medición de RPT; también
  Anexo 6.6, procedimiento de resistividad de terreno): cuando el anexo trae sus propias
  subsecciones tituladas ("1. Método de la caída de potencial", "2. Gradientes de Potencial",
  etc.), cada una con su propio texto y, opcionalmente, sus propias figuras o fórmulas, se
  anida un array `secciones` (`{titulo, texto, figuras[]?, formula?, formula_adicional?,
  nota_final?}`) dentro del anexo — el mismo patrón que ya estructura el cuerpo del pliego,
  pero un nivel más adentro. Se usa `"tipo": "mixto"` cuando hay figuras, `"tipo": "texto"`
  cuando el anexo es solo narrativo (sin ninguna tabla ni figura, como el 6.6).
- **Campo `ilustracion_complementaria`** (Anexo 6.4): una ilustración grande, con leyenda
  extensa de símbolos, que aparece después de las figuras numeradas del anexo pero sin traer
  numeral de figura propio en el PDF (no dice "Figura 3", solo un título en mayúsculas). No
  encaja como un elemento más del array `figuras`, así que se agregó como objeto separado
  `{titulo, imagen, nota?, leyenda?, nota_final?}` al nivel del anexo.
- **Figuras de anexo con `formula` y `leyenda` propias**: hasta ahora el array `figuras` de un
  anexo solo llevaba `{numero, titulo, imagen}`. Cuando una figura individual trae su propia
  fórmula de dimensionamiento (ej. `Sb ≥ 0,5 · SPE`) y su propia tabla de símbolos, se agregan
  los campos opcionales `formula`, `leyenda` (objeto símbolo→significado) y `nota_final`
  directamente en ese objeto de figura.
- **Campo `advertencia` en una figura**: cuando el PDF marca una figura con una X roja como
  configuración expresamente prohibida (Anexo 6.5, figuras 2 y 3: "una sola puesta a tierra
  para todas las necesidades" y "puestas a tierra separadas o independientes"), se usa el mismo
  campo `advertencia` (string) ya definido para puntos normativos, pero ahora dentro de un
  objeto de `figuras`.
- **`"tipo": "tabla"` para anexos que son solo una tabla** (Anexo 6.7): sin texto normativo
  adicional ni figura, solo la tabla y su nota al pie. Se usa el campo `tabla` (singular, no
  `tablas`) directamente en el anexo — mismo campo que ya usan los puntos normativos.

## 7quinquies. Extensiones agregadas en RIC N°07 (Instalaciones de equipos)

RIC N°07 es un pliego chico (18 páginas, un único anexo que es solo tabla, sin diagramas) pero
con dos artefactos de extracción de PDF que no habían aparecido antes:

- **Campo `nota_documento` en un punto**: el punto 5.3.1 trae una nota al pie numerada que no es
  contenido normativo, sino una nota editorial sobre el propio documento ("Se agregó texto
  eliminado en la versión del PDF publicado el 12.01.2021."). Se agregó el campo opcional
  `nota_documento` (string) en el punto afectado — distinto de `nota_final` (cierre de una lista
  con letra) y de `notas_adicionales` (nota técnica tras una tabla), porque esta nota habla del
  historial de edición del PDF, no de la instalación eléctrica.
- **Reconstrucción de un ítem de lista partido por salto de página**: en el punto 5.2.5, el
  extractor de texto entremezcló el marcador "v)" en medio de la oración del ítem "u)" por un
  salto de página con maquetación en columnas. Se resolvió el corte entre ambos ítems siguiendo
  la posición visible del marcador "v)" en el texto extraído, sin agregar ni quitar palabras —
  documentado como precedente para el caso (poco frecuente, pero puede repetirse) de un ítem de
  lista cuyo texto quedó dividido de forma ambigua por un salto de página.

## 7sexies. Extensiones agregadas en RIC N°08 (Sistemas de emergencia)

RIC N°08 es chico (14 páginas, 4 anexos con diagramas simples) pero aportó tres variantes nuevas
sobre patrones ya existentes:

- **Campo `lista` reutilizado para notas al pie de una tabla**: el punto 10.10 ("Condiciones de
  aplicación de la tabla Nº8.3") es una lista de notas numeradas (1) a (8) que se referencian
  desde dentro de esa tabla y desde otros puntos — no una enumeración libre de requisitos como
  los usos anteriores de `lista`. Se representó igual con `lista`, incluyendo el marcador
  numérico entre paréntesis como parte del texto de cada ítem.
- **Columna de categoría repetida en vez de celda combinada**: la Tabla Nº8.1 (tipo de conductor
  por servicio de seguridad) tiene una categoría que agrupa verticalmente varias filas
  ("Sistemas de detección y extinción de incendios" → 4 servicios distintos). En vez del patrón
  de arreglo de objetos en una celda usado en RIC N°04 (Tabla 4.2), se usó una columna adicional
  (`Detalle`) y se repitió el nombre de la categoría en cada fila del grupo, dejando `null` en
  las filas que no pertenecen a ningún grupo — más simple cuando no hay más de un nivel de
  agrupación.
- **Figura sin numeral dentro de un anexo `mixto`**: el Anexo 8.2 trae, después de sus dos
  secciones de texto numeradas, una figura de ejemplo sin numeral propio en el PDF. En vez de
  crear un campo separado (como `ilustracion_complementaria` en RIC N°06), se agregó igual al
  array `figuras` del anexo con `numero: null` — más simple cuando es la única figura de la
  sección y no trae una leyenda de símbolos extensa que justifique un campo aparte.

## 7septies. Extensiones agregadas en RIC N°09 (Sistemas de autogeneración)

RIC N°09 es el primer pliego cuyos anexos son, casi en su totalidad, esquemas unilineales de
ingeniería eléctrica (diagramas de bloques de protecciones), no fotos ni cortes constructivos.
También tiene la profundidad de anidamiento de subpuntos más alta hasta ahora (5 niveles:
`6.5.7.8.5`), pero eso no requirió ningún cambio de esquema — el mismo `subpuntos` recursivo ya
lo soporta. Patrones realmente nuevos:

- **Campo `texto_placa` en un punto**: el punto 11.2 exige una placa de advertencia con un texto
  exacto y obligatorio ("PRECAUCIÓN / ESTA PROPIEDAD CUENTA CON UN SISTEMA DE
  AUTOGENERACIÓN"), recuadrado en el PDF. Se agregó el campo `texto_placa` (string, con `\n`
  donde el recuadro tiene línea aparte) para distinguirlo de la prosa normativa — es un rótulo
  que debe reproducirse tal cual, no una definición ni una nota.
- **`"tipo": "opciones_multiples"` para anexos con variantes completas**: los Anexos 9.2 y 9.4
  no traen una figura con sub-figuras numeradas, sino varias "Opciones" (A, B, C, D) que son casi
  anexos completos en sí mismas — cada una con su propio título normativo largo, su propio
  diagrama, sus propios párrafos explicativos y sus propias notas al pie. Se agregó el campo
  `opciones` (array de `{letra, titulo, imagen, descripcion_figura, texto_introductorio, notas}`)
  a nivel de anexo, distinto del array `figuras` (reservado para figuras numeradas dentro de una
  misma explicación) y de `laminas` (reservado para láminas que comparten una sola explicación).
- **Diagramas de bloques descritos en prosa, sin campo nuevo**: los diagramas de este pliego son
  esquemas unilineales (cajas rotuladas como TABLERO GENERAL, INTERRUPTOR ACOPLAMIENTO,
  GEN. ERNC, unidas por líneas de mando), muy distintos de los cortes constructivos de pliegos
  anteriores. Se optó por describirlos en detalle dentro del campo `descripcion_figura` ya
  existente, nombrando cada bloque y su conexión tal como aparece en el PDF — no hizo falta un
  campo nuevo porque no hay datos tabulares que extraer, solo topología a describir en palabras.

## 7octies. Extensiones agregadas en RIC N°10 (Instalaciones de uso general)

RIC N°10 es el pliego con la tabla más grande vista hasta ahora — el Anexo 10.1 son más de 40
tablas de niveles de iluminación agrupadas en 8 categorías temáticas — y el primero cuyo Anexo
10.2 reproduce, casi íntegro, el cuerpo técnico de una norma UNE (con fórmulas, tablas y notas
intercaladas dentro del mismo texto corrido).

- **Sub-términos sin numeral propio**: en la terminología (4.3 Canalización, 4.6 Circuito, 4.8
  Conductor), el PDF trae sub-definiciones ("A la vista", "Embutida", "Circuito de iluminación",
  "Conductor activo") sin numeral 4.3.1/4.3.2 como sí tenían los sub-términos de RIC N°07. Se
  representaron igual dentro de `subterminos`, pero con `"id": null` — mismo criterio ya usado
  para figuras sin numeral (`numero: null`, RIC N°08), ahora aplicado a terminología.
- **`"tipo": "tabla_agrupada"` para anexos que son solo tablas agrupadas en categorías**: el
  Anexo 10.1 se representó con un array `grupos` (cada uno `{numero, titulo, subgrupos?: [
  {numero, titulo, tabla}], tabla?}`) — un grupo puede tener sub-grupos anidados (la mayoría de
  los 8 grupos) o, si el PDF no subdivide esa categoría (ej. grupo 3 "Oficinas"), traer una
  `tabla` directamente. Es el mismo patrón `secciones` ya usado para anexos con subdivisiones,
  con un nivel adicional de anidamiento porque aquí cada subdivisión es una tabla completa, no
  texto con figuras.
- **Campos `tabla`/`tablas`/`variables`/`lista` dentro de una `seccion` de anexo `mixto`**: el
  Anexo 10.2 intercala, dentro de una misma subsección de texto (ej. "4.4 Deslumbramiento"),
  tablas normativas, una fórmula con sus variables y notas — no fue necesario ningún campo
  nuevo, solo confirmar que los campos que ya existían a nivel de anexo (`tabla`, `tablas`,
  `formula`, `variables`, `lista`, `notas_adicionales`) pueden coexistir libremente también
  dentro de un objeto de `secciones`, igual que ya coexisten dentro de un punto normativo.

## 7novies. Extensiones agregadas en RIC N°11 (Instalaciones especiales)

RIC N°11 es, con 79 páginas y 22 secciones temáticas independientes (centros asistenciales,
ambientes húmedos, baños y duchas, grúas, ascensores, data center, construcciones
prefabricadas/agrícolas/flotantes, cercos eléctricos, faenas mineras, muelles, instalaciones
provisionales, carnavales/circos/ferias, teatros, lugares públicos, letreros publicitarios,
recintos deportivos, instalaciones inteligentes), el pliego estructuralmente más complejo y
heterogéneo procesado hasta ahora — cada sección funciona casi como un mini-pliego con sus
propias referencias y terminología.

- **Referencias normativas y terminología locales por sección, en vez de únicas y globales**:
  a diferencia de todos los pliegos anteriores (una sola sección global "Referencias
  normativas" y "Terminología" antes del cuerpo numerado), RIC N°11 repite subsecciones
  "x.2 Referencias normativas" y "x.3 Terminología" **dentro de cada una** de sus 22 secciones
  temáticas — y no todas las secciones tienen ambas (algunas no tienen referencias normativas
  locales, algunas no tienen terminología local, sección 3 tiene ambas y son extensas). Se
  resolvió dejando los campos de nivel superior `referencias_normativas` y `terminologia`
  vacíos (`[]`), con una nota explicativa en `notas_referencias` de nivel superior, y agregando
  esos mismos campos — con la misma forma que ya tenían a nivel de pliego — directamente en
  cada objeto de `secciones[]` cuando la sección de origen los trae. Esto evita inventar una
  estructura nueva: el lector del JSON reconoce el mismo patrón, solo que anidado un nivel más.
- **Notas al pie por celda dentro de una tabla (superíndices)**: el anexo 11.3.2 (Tabla B.1,
  guía de clasificación de locales de uso médico por grupo/tiempo de conmutación) tiene celdas
  con superíndices (`xᵃ`, `xᵇ`) que remiten a notas explicativas al pie de la tabla. Se
  resolvió incorporando el superíndice como parte del texto de la celda (ej. `"xᵃ"`) y
  agregando un array `notas` dentro del objeto `tabla` (mismo nivel que `columnas`/`filas`),
  con el texto íntegro de cada nota indexado por su letra — sin inventar un mecanismo de
  referencia cruzada dentro de la celda misma, que habría sido sobre-ingeniería para un caso
  que solo ocurre en un anexo.
- **Campo `referenciado_por` en anexos**: dado el altísimo número de anexos de este pliego (14)
  y de puntos que los referencian desde secciones muy distintas entre sí, se agregó el campo
  opcional `referenciado_por` (array de números de punto) en los objetos de `anexos[]`, como
  contraparte explícita de `anexos_relacionados` que ya existe en los puntos — mismo patrón
  bidireccional usado para `referencias_a_otros_pliegos`, ahora aplicado también a anexos
  internos del propio pliego.
- **Discrepancia de numeración de origen preservada tal cual**: en el PDF, la subsección de
  referencias normativas de la sección 21 (Recintos deportivos) aparece rotulada como "22.2.x"
  en vez de "21.2.x" — aparente error de numeración del documento original. Se mantuvo el
  texto normativo íntegro sin "corregir" la numeración, documentando la discrepancia en el
  campo `notas_referencias` local de esa sección — coherente con la regla de no inventar ni
  alterar contenido, aplicada también a metadatos de numeración.

## 7decies. Extensiones agregadas en RIC N°12 (Instalaciones en ambientes explosivos)

RIC N°12 vuelve al patrón "clásico" de un único bloque global de referencias normativas
(55 normas UNE-EN/IEC/NFPA de la serie 60079) y terminología antes del cuerpo — a diferencia
de RIC N°11 — pero introduce dos formas de anexo nunca vistas antes: un anexo puramente
textual (sin diagrama) y una figura sin numeral dentro de una serie de figuras numeradas.

- **Anexo de tipo `"texto"` con `secciones` sin tabla ni figura**: el Anexo 12.2 ("Ejemplos
  de emplazamientos peligrosos") es una lista de ejemplos agrupada en dos categorías (Grupo
  II, Grupo III), sin ningún diagrama ni tabla. Se representó con `"tipo": "texto"` y el
  campo `secciones` ya existente (cada una `{titulo, lista}`), en vez de crear un campo
  nuevo — mismo principio de reutilizar lo que ya existe antes de extender el esquema.
- **Figura sin numeral intercalada entre figuras numeradas**: el Anexo 12.1 trae 5 figuras
  numeradas (FIG. 1 a FIG. 5) más una lámina de detalle sin número ni título propio en el
  PDF (comparación IP<23 vs IP≥23 de las barreras de vapor), ubicada entre la Fig. 4 y la
  Fig. 5. Se representó dentro del mismo array `figuras` con `"numero": null`, mismo
  criterio ya usado para figuras sin numeral en RIC N°08 y terminología sin numeral en
  RIC N°10.
- **Dos tablas normativas distintas bajo un mismo punto, cada una con su propio nombre**:
  el punto 11.3.1 trae dos tablas (Tabla 12.1 de tuberías, Tabla 12.2 de bandejas) bajo el
  mismo texto introductorio. Se usó el campo `tablas` (array) ya existente, cada tabla con
  su propio `nombre` — no fue necesario ningún campo nuevo.

## 7undecies. Extensiones agregadas en RIC N°13 (Subestaciones y salas eléctricas)

RIC N°13 es el pliego más corto y simple procesado hasta ahora (13 páginas, patrón clásico
de referencias/terminología globales), y el primero sin ningún anexo.

- **`anexos: []` explícito para un pliego sin anexos**: sus tres tablas normativas (Tabla
  N°13.1, N°13.2, N°13.3) están embebidas directamente en los puntos 6.4.1, 6.4.6 y 13.5 del
  cuerpo, sin ningún anexo con diagrama, tabla independiente o contenido complementario. Se
  mantuvo el campo `anexos` como array vacío (no se omitió el campo) para que la forma del
  esquema sea idéntica en los 19 pliegos, facilitando el trabajo del futuro buscador.

## 7duodecies. Extensiones agregadas en RIC N°15 (Infraestructura para la recarga de vehículos eléctricos)

RIC N°15 (Versión 2024, el pliego con la fecha de emisión más reciente de todos) es un pliego
de 50 páginas y 8 anexos, con una terminología muy extensa (44 términos) y varios anexos cuyas
figuras se representan mediante diagramas de configuración con leyendas alfabéticas en vez de
numeradas.

- **Figura cuyo contenido gráfico se extiende a varias páginas del PDF**: la figura 15.3.1
  (Empalmes) ocupa 5 páginas del documento fuente y la figura 15.4.1 (Configuraciones de
  protecciones) ocupa 2 páginas, ambas conservando un único número y título de figura. Se
  representó el campo `imagen` de esa figura como un array de nombres de archivo (mismo
  patrón ya usado para anexos con múltiples imágenes), en vez de dividir en varias figuras
  numeradas artificialmente — el documento fuente trata cada una como una sola figura.
- **Leyendas alfabéticas o alfanuméricas por sub-configuración**: varias figuras de este
  pliego (15.2.3, 15.3.1, 15.4.1, 15.5.1, 15.6.1, 15.7.1, 15.7.3) identifican sub-diagramas
  con letras o combinaciones letra.número (a, b, c, d.1, d.2...) en vez de identificar
  componentes físicos individuales como en pliegos anteriores. Se representaron igual dentro
  del campo `leyenda` ya existente (objeto clave-valor), usando esa letra o combinación como
  clave — sin inventar una estructura nueva para "sub-figura dentro de figura".
- **Tabla comparativa embebida en una imagen, sin datos editables como texto**: la figura
  15.1.2 (Resumen de Tipos de Conectores) es una tabla de 9 filas × 5 columnas que forma
  parte del diagrama de imagen, no texto extraíble por separado. Se documentó su contenido en
  el campo `nota_final` de la figura en vez de estructurarla como `tabla` (que sí se reserva
  para tablas normativas del cuerpo del texto, no para contenido que solo existe dentro de
  una imagen).
- **Campo `referenciado_por` en anexos**: reutilizado del mismo patrón introducido en RIC
  N°11 y N°12, dado el alto número de referencias cruzadas hacia los 8 anexos desde secciones
  muy distintas (empalmes, protecciones, tipos de instalación, montaje de equipos).

## 7ter decies. Extensiones agregadas en RIC N°16 (Subsistemas de distribución)

RIC N°16 es el pliego más corto de todos (2 páginas), sin anexos ni tablas propias.

- **Pliego sin sección de Referencias Normativas**: a diferencia de todos los demás pliegos
  (que numeran su sección 3 como "Referencias normativas" y la 4 como "Terminología"), este
  documento no cita ninguna norma UNE/IEC/NFPA y va directo de la sección 2 "Alcance" a la
  sección 3 "Terminología" (sin sección de referencias normativas intermedia), seguida de la
  sección 4 "Exigencias generales". Se dejó `referencias_normativas: []` con una
  `notas_referencias` explicando la ausencia — mismo criterio ya usado para desviaciones de
  numeración de origen en pliegos anteriores (preservar la estructura real del documento, no
  forzarla a encajar en el patrón usual).

## 7quater decies. Extensiones agregadas en RIC N°18 (Presentación de proyectos)

RIC N°18 (17 páginas, 5 anexos) es el pliego de reglas administrativas/de dibujo para
presentar proyectos ante la Superintendencia — incluye dos catálogos completos de
simbología normativa para planos eléctricos (anexo 18.3) con más de 80 símbolos.

- **Tabla de simbología con columna gráfica omitida**: las figuras 18.3.1 y 18.3.2
  (Anexo 18.3) son tablas de designación/símbolo donde la columna "Símbolo" contiene
  glifos gráficos (no texto) que no pueden representarse fielmente en JSON. Se conservó
  únicamente la columna "Designación" (texto normativo, íntegramente buscable) en un
  objeto `tabla` anidado dentro de la `figura`, con una `nota_final` que documenta la
  omisión y remite a la imagen para ver los símbolos reales — nunca se inventó una
  representación textual de los glifos.
- **Campo `tabla`/`tablas` dentro de una `figura` de anexo**: hasta ahora `tabla` solo
  coexistía con `figuras` a nivel de punto o de anexo, nunca anidado dentro de un objeto
  de `figuras[]`. Se extendió `renderAnexoFigura` en el visor de prueba para soportar
  `f.tabla`/`f.tablas` igual que ya soportaba `f.leyenda` — necesario porque el anexo
  18.3 tiene su tabla de designaciones asociada a una figura concreta (una imagen de
  página), no al anexo completo.
- **Anexo de tipo `"mixto"` con tabla + múltiples figuras + texto introductorio**: el
  anexo 18.1 combina un texto explicativo, una tabla normativa (formatos de papel NCh 13)
  y dos figuras con diagramas, todos coexistiendo al mismo nivel del anexo — patrón ya
  usado en pliegos anteriores para anexos combinados, sin necesidad de campos nuevos.

## 7quindecies. Extensiones agregadas en RIC N°19 (Puesta en servicio) — último pliego de los 19

RIC N°19 (24 páginas, 4 anexos) cierra el conjunto de los 19 pliegos técnicos. Define los
procedimientos de ensayo/verificación previos a energizar una instalación, con anexos que
desarrollan fórmulas de impedancia de bucle de falla y métodos de medición.

- **Punto sin numeral antes del primer punto numerado de una sección**: la sección 8
  ("Tipos de verificación") trae un párrafo introductorio entre el título de sección y el
  punto 8.1, sin numeral propio en el PDF. Se representó como un punto con
  `"numero": null`, extendiendo a puntos normativos de cuerpo el mismo criterio ya usado
  para figuras y términos sin numeral (RIC N°08, N°10, N°12).
- **Nota al pie del propio PDF documentando una renumeración editorial**: el punto 9.2.8
  conserva, en su `nota_final`, una nota a pie de página del documento fuente que explica
  que la numeración de sus subpuntos fue corregida (de 9.2.9.x a 9.2.8.x) en una versión
  posterior del PDF publicada el 12.01.2021. Se documentó tal cual aparece impresa, sin
  alterar la numeración ya corregida que usa el resto del JSON.
- **Anexos con desarrollo expositivo continuo** (19.1 y 19.2): a diferencia de los anexos
  tipo lista de la mayoría de los pliegos, estos anexos son prosa técnica extensa que
  intercala fórmulas, variables, tablas y figuras de forma fluida, similar al Anexo 10.2 de
  RIC N°10. Se usó el campo `secciones` ya validado para anexos tipo `"mixto"`
  (`{titulo, texto, formula, variables, lista, tabla, notas_adicionales, figuras}`), sin
  inventar campos nuevos — una revisión antes de la entrega detectó y corrigió dos campos
  ad hoc (`puntos_informativos`, `texto_metodo_ensayo`) que no correspondían al esquema del
  visor y habrían quedado sin renderizar; se replegaron dentro de `secciones`.

## 7. Checklist de validación por pliego nuevo (repetir el Paso 0 en miniatura)

Antes de dar por bueno el JSON de un pliego nuevo, verificar:

- [ ] ¿Todo punto y subpunto tiene su `numero` y `texto` completo, no resumido?
- [ ] ¿Las tablas quedaron como `columnas`/`filas`, no como texto corrido?
- [ ] ¿Las fórmulas quedaron en `formula`, no mezcladas en el texto de un punto?
- [ ] ¿Cada anexo con diagrama tiene su imagen extraída y recortada?
- [ ] ¿Las referencias a otros pliegos y a anexos son bidireccionales?
- [ ] ¿Se probó con 5-8 preguntas reales de terreno sobre ese pliego específico,
      no solo palabras sueltas frecuentes?
