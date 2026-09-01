# Buscador RIC

Base de datos estructurada (JSON) de los 19 pliegos técnicos normativos del **RIC**
(Reglamento de Seguridad de las Instalaciones de Consumo de Energía Eléctrica, Decreto
N°8/2019 del Ministerio de Energía, dictado por la Superintendencia de Electricidad y
Combustibles — SEC), más un buscador de texto completo servido como página estática.

## Ver el buscador

Abrí `index.html` directamente en el navegador, o si este repo tiene **GitHub Pages**
habilitado (Settings → Pages → Source: rama `main`, carpeta `/`), quedará disponible en
`https://<usuario>.github.io/<repo>/`.

El buscador funciona sin backend: toda la data (puntos normativos, terminología, normas
referenciadas) va embebida en `index.html`; las imágenes de los anexos se cargan por
demanda desde `pliegos/ric-XX/imagenes/`.

## Estructura

```
/
├── index.html              <- el buscador (self-contained, embebe todo el texto)
├── combined-all.json        <- export de conveniencia: los 19 JSON combinados en un array
├── CLAUDE.md                 <- notas de contexto del proyecto de conversión PDF → JSON
├── schema-notes.md           <- reglas del esquema y extensiones descubiertas pliego a pliego
├── pdfs-fuentes/              <- PDF oficiales originales de cada pliego (SEC)
└── pliegos/
    ├── ric-01/
    │   ├── ric-01-empalmes.json
    │   └── imagenes/          <- diagramas/anexos recortados de cada PDF
    ├── ric-02/
    │   └── ...
    └── ric-19/
        └── ...
```

Cada `ric-XX-*.json` sigue el mismo esquema: `metadata`, `referencias_normativas`,
`terminologia`, `secciones` (con `puntos`/`subpuntos` recursivos), `anexos` y
`referencias_a_otros_pliegos`. El detalle completo del esquema y sus extensiones vive en
`schema-notes.md`.

## Regenerar `combined-all.json` o `index.html`

Si editás cualquier `pliegos/ric-XX/*.json`, `combined-all.json` e `index.html` quedan
desactualizados hasta que se regeneren. No hay build tool — es un combine simple:

```powershell
# Combina los 19 JSON en combined-all.json
$files = Get-ChildItem "pliegos" -Recurse -Filter "ric-*.json" | Sort-Object Name
$combined = @()
foreach ($f in $files) { $combined += (Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json) }
$combined | ConvertTo-Json -Depth 30 -Compress | Set-Content -Path "combined-all.json" -Encoding UTF8
```

Este proyecto es solo de datos y consulta — no reemplaza al reglamento oficial vigente
ni a los PDF fuente. Verificar siempre contra la fuente oficial de la SEC.
