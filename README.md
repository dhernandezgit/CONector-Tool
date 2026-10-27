# CONector Tool

**Conectores paramétricos para rejas de exposición, listos para imprimir en 3D.**

CONector Tool es una aplicación local-first: el motor de geometría está escrito en **Python** y se ejecuta en el navegador con **Pyodide/WebAssembly**. La interfaz React + Three.js permite diseñar conectores, importar siluetas para decorarlos y montar el puesto completo en un editor 3D con medidas, colores y lista de materiales.

- Web: `https://dhernandezgit.github.io/CONector-Tool/`
- Repo: `https://github.com/dhernandezgit/CONector-Tool`
- Sin servidor, sin cuenta y sin subir archivos.
- Exporta **STL** por pieza y **3MF** con el kit completo.
- Proyecto `.conector` portátil.

## Qué incluye

### Bases exactas

- **7 bases de referencia** extra?das y medidas del set que adjuntaste: cubo completo, cubo alternativo, tres lados, doble 90?, esquina 90?, vertical doble y est?ndar.
- Se abren con la geometr?a original y sus dimensiones exactas; puedes escalarlas, girarlas, espejarlas y cambiarles el color.
- El modo **Base exacta** conserva los canales y el espacio de la pieza original. Para cambiar ?ngulos, n?mero de lados o agarre, se crea una **variante generativa**.
- Atribuci?n: CloudedCat, *Wire Grid Connector Set*, CC BY-NC 4.0. Uso no comercial; no se incluyen los STL de pago de Etsy.

### Estudio generativo

- **Agarre:** reja de alambre de 4 mm, marco metálico de 3,8 mm, panel foam de 5 mm y medidas personalizadas. Holgura, boca del clip, pared, largo y número de cables.
- **Cupón de calibración:** cinco canales para escoger la holgura real de tu impresora.
- **Uniones:** esquina 90°, unión plana, T, cruz, esquina 3D, 4/5/6 vías, recta, 360°, ángulos de 30/45/60°, ángulo libre de 5–175° e inclinación compuesta.
- **Brazos personalizados:** activa los ejes que necesites y crea combinaciones que no existen en las tiendas.
- **Forma:** cuerpo redondo, cuadrado redondeado, hexagonal, octógono u orgánico; tamaño, alto, redondeo y color.
- **Placas decorativas:** 22 siluetas originales, borde, relieve, color, cara frontal/trasera/ambas y montaje por presión, imanes o tornillo M3.
- **Importar dibujo:** SVG, PNG, JPG o WebP. La app detecta la silueta, conserva agujeros y la convierte en una placa decorativa o en un conector de borde.
- **Especial:** patas rectas, inclinadas a 30/45°, elevadores, recorte de apoyo en mesa, ganchos, clavijas de foam, ojales para bridas y partido por la mitad con orejetas M3.
- **Impresión:** material, boquilla, altura de capa, cama, comprobaciones de estanqueidad, voladizos, tamaño y estimación de material.

### Puesto 3D

- Editor libre con cuadrícula.
- Añade, selecciona y **arrastra paneles y uniones**.
- Color independiente para cada panel y cada unión.
- Tipos de reja: **alambre**, **reja sólida**, **Skadis** y **foam/liso**.
- Paneles de 30×30, 35×35, 40×40, 30×60 y 25×40 cm, más medidas personalizadas.
- Plantillas: mesa base, pared 3×2, esquina, torre, fondo Skadis.
- Medidas de ancho, fondo, alto y altura de mesa.
- Lista de materiales y **exportación de kit 3MF** con todos los conectores repetidos por cantidad.
- Exportación de captura PNG y JSON de la escena.

## Cómo se usa

1. Abre la app y espera a que el motor Python termine de cargar.
2. Empieza por una **base exacta** o elige un preset generativo y ajusta el agarre a tu reja.
3. Genera el cupón de calibración y pruébalo antes de imprimir el modelo final.
4. Elige la unión y la decoración. Si quieres una silueta propia, impórtala en **Forma → Placa decorativa**.
5. Revisa la vista 3D, las comprobaciones y exporta STL/3MF.
6. Pasa a **Puesto 3D** para componer el puesto, medir y generar el kit completo.

## Impresión recomendada

- **PETG o ASA** para conectores que vayan a soportar peso; PLA para prototipos.
- 4 paredes, 0,2 mm de capa y 30–40 % de relleno.
- Imprime en diagonal o usa el **partido por la mitad** cuando necesites reforzar la unión entre capas.
- El agarre depende de la impresora, el filamento y la calibración. Usa el cupón y ajusta la holgura.
- Las piezas decorativas se imprimen planas y sin soportes.

## Desarrollo

Requisitos: Node 22+, Python 3.12+ y Chrome/Edge actualizado.

```bash
python -m pip install -r requirements-dev.txt
npm install
python scripts/build_python_zip.py
npm run dev
```

Abre `http://127.0.0.1:5173/`.

### Tests

```bash
python -m pytest -q
npm run test:ui
npm run typecheck
npm run build
```

Los tests cubren:

- Mallas estancas, extrusiones con huecos y uniones por corte.
- Perfiles de agarre, cupón de calibración y split con orejetas.
- Familias de conector, ángulos, patas, ganchos y placas.
- Importación de SVG y raster.
- Exportación 3MF y kits con cantidades.
- Utilidades del simulador: límites, plantillas, BOM y configuración de uniones.
- Mezcla profunda y utilidades de formato.

## Despliegue

GitHub Actions ejecuta los tests, compila la web en `dist/` y la publica con **GitHub Pages → Source: GitHub Actions**.

La app queda en `https://dhernandezgit.github.io/CONector-Tool/`.

## Arquitectura

```
conectors/
  engine.py      # conectores, placas, patas, split, comprobaciones
  mesh.py        # mallas, extrusiones, corte planar, STL/3MF
  shapes.py      # siluetas decorativas originales
  shape.py       # importación SVG/raster
  webapi.py      # puente JSON para Pyodide
src/
  App.tsx
  components/    # estudio, presets, ajustes, exportación
  simulator/     # editor libre, paneles, uniones, medidas
  data/          # presets y materiales
  workers/       # Pyodide
tests/           # tests Python
```

La geometría se construye con perfiles 2.5D, extrusiones y transformaciones. Las carcasas pueden solaparse y el laminador las une; así se evita depender de un motor CSG nativo en el navegador. El corte de las mitades utiliza un capador planar propio y se valida con tests de estanqueidad.

## Créditos y licencias

- Código propio: MIT.
- Reutiliza patrones y utilidades MIT del proyecto [CalicoCutters](https://github.com/dhernandezgit/CalicoCutters-Tool), en particular `earcut` y el lector `svg.path`.
- Inspiración de producto y categorías: conectores modulares para rejas de exposición de tiendas como SandoikStitches y modelos abiertos de conectores de cubo. **No se incluyen ni redistribuyen los STL de pago de esas tiendas**; las siluetas y geometrías de esta app son originales.
- Pyodide, NumPy, Shapely, Pillow, OpenCV y React/Three.js conservan sus licencias.

Hecho para que un puesto de mercado se monte en un rato y se vea como tú quieras.
