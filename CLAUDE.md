# Proyecto: Base de datos JSON de los Pliegos Técnicos RIC (SEC, Chile)

## Objetivo
Convertir los 19 pliegos técnicos normativos RIC (Reglamento de Seguridad de Instalaciones
de Consumo, SEC) de PDF a archivos JSON estructurados y navegables, más las imágenes de
sus anexos con diagramas. Este JSON es la base de datos que luego alimentará un buscador
(no es parte de este proyecto todavía — por ahora, **solo hacemos los pliegos**).

Ya están hechos y validados en terreno: **RIC N°01 (Empalmes), N°02 (Tableros Eléctricos),
N°03 (Alimentadores y demanda)**. Siguen del N°04 en adelante.

## Estructura de carpetas del proyecto

```
/
├── CLAUDE.md                          <- este archivo
├── schema-notes.md                    <- reglas del esquema (fuente de verdad, ver abajo)
├── pdfs-fuente/                       <- yo (el usuario) dejo aquí el PDF de cada pliego nuevo
│   └── RIC-N04-...pdf
└── pliegos/
    ├── ric-01/
    │   ├── ric-01-empalmes.json
    │   └── imagenes/
    │       ├── anexo-1-1.png
    │       └── ...
    ├── ric-02/
    │   ├── ric-02-tableros-electricos.json
    │   └── imagenes/
    ├── ric-03/
    │   ├── ric-03-alimentadores.json
    │   └── imagenes/
    └── ric-04/                        <- se crea al procesar el pliego 4, y así sucesivamente
```

## Flujo de trabajo por cada pliego nuevo (repetir para el 04 al 19)

1. **Leer `schema-notes.md` completo antes de tocar el PDF.** Contiene las reglas de
   estructura (cómo va cada tipo de contenido: punto, tabla, fórmula, figura, anexo,
   referencia cruzada) más las extensiones que fueron apareciendo pliego a pliego
   (tablas inline dentro de un punto, sub-ítems con letra, notas al pie, terminología
   anidada, anexos con múltiples figuras agrupadas por página). Son reglas reales,
   no teóricas — cada una salió de un caso concreto en un pliego ya hecho.

2. **Extraer las imágenes de los anexos con diagrama**, si el pliego tiene:
   ```bash
   pdftoppm -png -r 150 -f <pagina_inicio> -l <pagina_fin> pdfs-fuente/RIC-N0X-....pdf /tmp/pag
   ```
   Luego recortar el logo superior (~5% de la altura) y el espacio en blanco sobrante
   (bounding box trim automático — usar el mismo script de Python con Pillow que se usó
   en los pliegos 1-3). Guardar el resultado en `pliegos/ric-0X/imagenes/`.

3. **Construir el JSON** siguiendo exactamente la forma de `ric-01-empalmes.json`,
   `ric-02-tableros-electricos.json` y `ric-03-alimentadores.json` como referencia de
   estilo. Campos esperados: `pliego_id`, `numero`, `materia`, `metadata`,
   `referencias_normativas`, `terminologia`, `secciones` (con `puntos`/`subpuntos`
   recursivos), `anexos`, `referencias_a_otros_pliegos`.

4. **Si aparece un patrón que `schema-notes.md` no cubre** (como pasó con las tablas
   inline en el N°02, o los sub-ítems con letra en el N°03): resolverlo de la forma más
   simple y consistente con lo ya hecho, y **anotarlo tanto en el JSON del pliego**
   (campo `extensiones_no_previstas_en_v1`) **como agregarlo a `schema-notes.md`**
   para que el siguiente pliego ya lo tenga disponible. No preguntar primero si hay
   una solución razonable — resolver y avisar, igual que se hizo en el chat original.

5. **Validar que el JSON es sintácticamente correcto** (`python3 -m json.tool archivo.json`
   o equivalente) antes de darlo por terminado.

6. **No inventar contenido.** Todo el texto normativo debe ser el texto real del PDF,
   completo, no resumido ni parafraseado. Las tablas deben quedar como `columnas`/`filas`
   estructuradas, nunca como texto corrido.

## Reglas de comportamiento para el asistente en este proyecto

- Ir pliego por pliego, no adelantarse a procesar varios de una vez sin confirmación.
- Al terminar un pliego, avisar qué extensiones nuevas (si las hubo) se agregaron al
  esquema, igual que se hizo en el chat original — no dar por sentado que el usuario
  se va a dar cuenta solo.
- El usuario no es programador de formación pero está aprendiendo; explicaciones
  técnicas claras están bien, no hace falta simplificarlas en exceso, pero sí evitar
  dar por sabido el uso de la terminal si no ha quedado claro antes.
- Este proyecto es solo de datos (PDF → JSON + imágenes). No construir todavía ningún
  buscador, interfaz o app — eso es un proyecto aparte que se retomará después de tener
  los 19 pliegos listos.

## Pliegos pendientes
N°04 al N°19 (el N°04, Conductores y Canalizaciones, es el más largo — considerar
dividir su PDF fuente en 2-3 partes si es muy pesado para procesar de una vez).
