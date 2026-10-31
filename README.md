# CONector Tool

**Conectores paramétricos para rejas de exposición, listos para imprimir en 3D.**

CONector Tool es una aplicación local-first: el motor de geometría está escrito en **Python** y se ejecuta en el navegador con **Pyodide/WebAssembly**. La interfaz React + Three.js permite diseñar conectores, importar siluetas para decorarlos y montar el puesto completo en un editor 3D con medidas, colores y lista de materiales.

- Web: `https://dhernandezgit.github.io/CONector-Tool/`
- Repo: `https://github.com/dhernandezgit/CONector-Tool`
- Sin servidor, sin cuenta y sin subir archivos.
- Exporta **STL** por pieza y **3MF** con el kit completo.
- Proyecto `.conector` portátil.

## Qué incluye

### Conectores paramétricos

- **Reja de alambre de 4 mm, marco metálico, foam y medidas personalizadas.** Control de holgura, boca del clip, pared, diámetro y número de cables.
- **Cupón de calibración** con cinco canales para escoger la holgura real de tu impresora.
- **Solo 7 bases:** la biblioteca muestra únicamente las **7 uniones de referencia** que aportaste (cubo completo, cubo alternativo, tres lados, doble 90, esquina 90, vertical doble y estándar). Los presets generativos antiguos quedan ocultos para no llenar la galería de formas que no usas.
- **Bases exactas:** cada base se carga tal cual, con tests que comprueban dimensiones, volumen y estanqueidad contra el manifiesto original.
- **Patas paramétricas:** añade una extensión completa en uno o varios **lados libres** (sin canal de reja). La pata tiene brazo, poste y pie; con altura 0 se convierte en una extensión plana. La app marca los lados libres y avisa si tapas un canal.
- **Decoraciones paramétricas:** 22 siluetas originales montadas en la cara que elijas, con tamaño, grosor, altura, desplazamiento y color. Se imprimen aparte, planas, y se encolan en la base.
- **Orientación segura:** 0/90/180/270° y giro fino alrededor de Z. La pieza siempre descansa en la cama y las patas siguen verticales; nunca aparece inclinada en un ángulo raro.
- **Escala y espejo:** ajustes avanzados para adaptar la base sin perder su geometría de canales.
- **Presets propios:** guarda cualquier combinación de base + patas + decoración como preset de usuario.
- **Impresión:** material, boquilla, altura de capa, cama, comprobaciones de estanqueidad, voladizos, tamaño y estimación de material.

### Puesto 3D

- Editor libre con cuadrícula.
- Añade, selecciona y **arrastra paneles y uniones**. Las uniones solo pueden colocarse en los puntos de los paneles: nunca quedan sueltas.
- Giro rápido de paneles con botones de ±15°/±90° o con la tecla **R** (Shift+R hacia el otro lado).
- Escena inicial en forma de **cubo** de cuatro paneles, más plantilla de **dos torres de cuatro alturas** separadas por dos paneles y unidas por arriba.
- Color independiente para cada panel y cada unión.
- Tipos de reja: **alambre**, **reja sólida**, **Skadis** y **foam/liso**.
- Paneles cuadrados de 20×20, 25×25, 30×30, 35×35, 40×40, 45×45, 50×50 y 60×60 cm, además de 30×60 y 25×40 cm y medidas personalizadas.
- Plantillas: cubo, dos torres, pared 3×2, esquina, torre y fondo Skadis.
- Medidas de ancho, fondo, alto y altura de mesa.
- Lista de materiales y **exportación de kit 3MF** con todos los conectores repetidos por cantidad.
- Exportación de captura PNG y JSON de la escena.

## Cómo se usa

1. Abre la app y espera a que el motor Python termine de cargar.
2. Elige una de las **7 bases** de la biblioteca.
3. Añade **patas** en los lados libres y/o una **decoración** con la forma que quieras.
4. Gira la pieza con los botones 0/90/180/270° o el giro fino; siempre queda apoyada en la cama.
5. Revisa la vista 3D, las comprobaciones y exporta STL/3MF. Guarda tu variante como preset si la vas a repetir.
6. Pasa a **Puesto 3D** para componer el puesto, medir y generar el kit completo.

## Impresión recomendada

- **PETG o ASA** para conectores que vayan a soportar peso; PLA para prototipos.
- 4 paredes, 0,2 mm de capa y 30–40 % de relleno.
- Con patas, la base queda elevada: revisa el aviso de voladizos y activa soportes bajo la base solo si tu laminador lo necesita.
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

Los tests cubren mallas estancas, perfiles de agarre, cupón de calibración, split, familias de conector, ángulos, patas, ganchos, placas, importación SVG/raster, exportación 3MF, kits y utilidades del simulador.

## Despliegue

GitHub Actions ejecuta los tests, compila la web en `dist/` y la publica con **GitHub Pages → Source: GitHub Actions**.

La app queda en `https://dhernandezgit.github.io/CONector-Tool/`.

## Arquitectura

```
conectors/
  engine.py      # conectores, placas, patas, split, comprobaciones
  template.py    # las 7 bases exactas de referencia
  templates/     # manifiesto + STL de referencia (CC BY-NC 4.0)
  spool.py       # generador paramétrico tipo carrete
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
- Inspiración de formas y gramática de producto: **CloudedCat**, *Wire Grid Connector Set*, publicado en Printables con licencia **CC BY-NC 4.0** (`https://www.printables.com/model/1721006-wire-grid-connector-set`).
- Las **7 bases exactas** de `conectors/templates/` son tus modelos de referencia, derivados de ese set y distribuidos bajo **CC BY-NC 4.0** con atribución a CloudedCat. No son MIT y no deben usarse comercialmente. El resto de la app y los generadores paramétricos son código original bajo MIT.
- Reutiliza patrones y utilidades MIT del proyecto [CalicoCutters](https://github.com/dhernandezgit/CalicoCutters-Tool), en particular `earcut` y el lector `svg.path`.
- No se incluyen ni redistribuyen los STL de pago de Etsy u otras tiendas; las siluetas y geometrías de esta app son originales.
- Pyodide, NumPy, Shapely, Pillow, OpenCV y React/Three.js conservan sus licencias.

Hecho para que un puesto de mercado se monte en un rato y se vea como tú quieras.
