# CONector Tool · Artist Alley Sandbox

**Un montador 3D editable para planificar un puesto de artistas.**

CONector Tool es ahora un sandbox local-first para componer un puesto con paneles, expositores, estantes, accesorios y toldo. Puedes mover y girar piezas, conectarlas por sus puertos, agrupar composiciones, trabajar sobre una o varias mesas en L, deshacer cambios y generar una lista de materiales antes de montar el puesto real. La escena inicial es una **doble torre de cuatro cubos con baldas, una estantería central de organizadores y dos toldos**. Al arrastrar, las piezas se imantan a los puertos cercanos y verás el destino y el conector antes de soltar; el tipo de conector se elige automáticamente y puedes cambiarlo después.

- Web: `https://dhernandezgit.github.io/CONector-Tool/`
- Repo: `https://github.com/dhernandezgit/CONector-Tool`
- Sin servidor, sin cuenta y sin subir archivos.
- Guardado automático en el navegador y archivos de proyecto locales.
- Lista de materiales con copia al portapapeles y exportación CSV.

## Qué incluye

### Catálogo editable

- **Paneles:** slatwall de 30 y 35 cm, Skadis de 30 y 35 cm, rejilla de 30 y 35 cm y panel triangular.
- **Medidas pequeñas:** paneles de 1/4 (15 × 15 cm) y 1/2 (15 × 30 cm y 30 × 15 cm) para slatwall, Skadis y rejilla.
- **Paneles lisos:** equivalentes planos y coloreados de todas las rejillas (30, 35, 1/4 y 1/2) para fondos, puertas y separadores.
- **Expositores:** 2,5", 3", 4" y 5" con varios niveles.
- **Estantes:** riser de 1 y 3 niveles, mini estante, balda horizontal de rejilla de 30 × 30 cm y organizador lateral con cuatro ranuras.
- **Accesorios:** gancho de estante, clips de panel, bandejas Skadis, toldo de 30 y 35 cm con faldón y sin patas al suelo, y mango de abanico con bloqueo.
- **Grupos rápidos:** bahía slatwall 3+2, pared slatwall 2×4, estantería de organizadores, pared Skadis 2×4, esquina, rejilla angular, mini pared 1/4 y 1/2, fondo liso + rejilla, remate triangular, doble torre de 4 cubos, torre individual, stand en U angular, pared escalonada y dos configuraciones de mesa en L. Los ejemplos combinan paneles con baldas y organizadores; los conectores se generan como uniones al colocar las piezas.

### Colocación y conexiones

- **Añadir rápido** coloca un panel, una rejilla, una balda, una estantería de organizadores completa o un toldo sin buscar en el catálogo.
- Cámara **isométrica** para colocar sin distorsión y cámara en **perspectiva** para ver el resultado realista.
- **Cubo de vistas** arriba a la derecha: toca una zona del cubo para cambiar de vista o arrástralo para orbitar.
- Arrastra piezas sobre la mesa con rejilla y **snapping generoso**: al acercarte a un puerto, la pieza se imanta, se mueve en directo y muestra una línea y un marcador del conector que se formará.
- **Vista previa de unión:** mientras arrastras verás el nombre del panel destino, cuántas piezas participan y el conector elegido. Al soltar, la pieza queda unida; no hace falta acertar al píxel.
- **Esferas rosas** en los puertos de esquina y borde: solo aparecen al seleccionar una pieza. Rosa suave para libre, rosa oscuro para conectado, rosa intenso para el origen elegido y rosa brillante para un destino compatible.
- Toca dos esferas compatibles y las piezas se acercan para formar la unión.
- Cambia el tipo de conector desde el inspector: recto, esquina, 30°, 45°, 3/4/5 lados, Skadis H/V/X/Z, cola de milano integrada, rejilla, ranura de organizador y anclaje de toldo. El botón **Volver a automático** recupera la recomendación según la geometría.
- Se ofrecen **todos los conectores compatibles con el número de paneles**. El sistema no bloquea mezclas útiles: slatwall, Skadis y rejilla pueden compartir una unión, y el conector se ajusta automáticamente si hace falta.

### Toldo y organizadores

- El **toldo** tiene una lona plana de 30 × 30 cm, un faldón frontal de 10,8 cm y dos soportes traseros que se conectan a los anclajes superiores del panel. Dos brazos horizontales sostienen la lona; no hay patas que lleguen al suelo. Selecciona primero el panel y añade el toldo desde el catálogo: se coloca a la altura correcta y crea la unión automáticamente.
- Si añades el toldo sin seleccionar un panel, queda suelto sobre la mesa; selecciona un panel y vuelve a añadirlo para anclarlo.
- El **organizador de panel** es un lateral con cuatro ranuras. Coloca **dos, uno a cada lado**, y desliza baldas o paneles en las ranuras para formar una estantería. No se cuelga de un panel: se apoya en la mesa y queda estabilizado por las baldas y los paneles que lo rodean.
- La **doble torre** incluye una estantería central con dos organizadores laterales, cuatro baldas y dos toldos sobre el puente; la **torre individual** mantiene sus cuatro baldas de rejilla.
- El grupo **Estantería de organizadores** coloca las dos estructuras laterales y cuatro baldas listas para usar.

### Edición segura

- Rotación en pasos de 90° con **R** o **E** (y **Q** en sentido contrario), además de ajuste fino.
- Selección múltiple con Mayús + clic; al arrastrar una pieza seleccionada se mueve todo el conjunto.
- **Ctrl+C / Ctrl+V** para copiar y pegar piezas o grupos completos; **Ctrl+A** selecciona todo.
- Flechas para mover 1 cm (Mayús: 5 cm); **Ctrl + ↑/↓** para subir o bajar.
- Grupos de usuario que se mueven y giran juntos.
- Duplicado sin apilar piezas: si una copia cae exactamente sobre otra, se reutiliza la existente.
- Eliminar un panel no rompe el resto: las conexiones se recalculan y los accesorios montados se liberan.
- Deshacer y rehacer con historial.
- Los accesorios se pueden montar en la cara frontal o dorsal de un panel y recolocar arrastrándolos.
- Atajos: **R/E** giran +90°, **Q** gira -90°, **Ctrl+C/V** copia y pega, **Ctrl+D** duplica, **G/Ctrl+G** agrupa, **Supr** elimina, **F** encuadra, **Ctrl+Z** deshace, **Esc** cancela una conexión.

### Mesas en L y archivos locales

- El inspector permite añadir una **mesa recta** o una **mesa en L** girada 90°.
- Las mesas comparten altura; al cambiarla, las piezas se desplazan para seguir apoyadas.
- Los ejemplos **Mesa en L de trabajo** y **Mesa en L + pared** montan la configuración completa.
- **Archivo** descarga un `.artist-alley.json` con mesas, piezas, grupos, colores y conexiones.
- **Abrir** recupera ese archivo en cualquier navegador. El guardado automático local sigue activo.

### Lista de materiales

- Cuenta cada pieza y cada conector colocado.
- Separa las **uniones integradas** (cola de milano) que no necesitan una pieza extra.
- Agrupa cantidades y muestra notas de montaje.
- Copia la lista o descarga un CSV.

## Qué no incluye

- **No se incluyen los STL del Artist Alley STL Pack.** El pack original se compra aparte y es de uso personal.
- No se cargan, sirven, publican ni redistribuyen los archivos comprados.
- El estudio de impresión 3D, la exportación STL/3MF, la calibración y la galería de conectores quedan **ocultos** en esta versión.
- Las geometrías del sandbox son **representaciones originales y simplificadas**, no copias de las mallas del pack.

## Crédito

El **Artist Alley STL Pack** es una creación de **Jessie Shi** (**Sandoik / @sandoikstitches**). Este proyecto es una herramienta de planificación independiente y no está afiliado al pack. Si quieres imprimir las piezas reales, consigue el pack original y respeta su licencia de uso personal.

## Cómo se usa

1. Abre la app: se carga la **Doble torre 4 cubos** con una estantería central de organizadores.
2. Elige piezas o grupos en el catálogo de la izquierda. Prueba **Estantería de organizadores**, **Torre 4 cubos** o **Mesa en L de trabajo** para ver otras composiciones.
3. Usa el cubo de vistas para colocar en isométrico y revisar en perspectiva.
4. Arrastra una pieza cerca de un puerto: verás el destino y el conector previsto. Suelta para dejarla unida. También puedes seleccionar una pieza y tocar dos esferas rosas.
5. Selecciona una unión para cambiar el conector o volver al automático; selecciona una pieza para moverla, girarla, colorearla o montarla en un panel. El color y los campos de transformación se aplican a todo el grupo. Para el toldo, selecciona antes el panel.
6. Con Mayús + clic selecciona varias piezas, arrastra para moverlas juntas, copia con Ctrl+C y pega con Ctrl+V. La sección **Color de la selección** recolorea todas las piezas y sus grupos.
7. En **Mesas de trabajo** añade o edita mesas; usa **Archivo** y **Abrir** para guardar o recuperar un proyecto local.
8. Abre **Lista de materiales** para copiar o descargar el CSV.

## Desarrollo

Requisitos: Node 22+ y Chrome/Edge actualizado.

```bash
npm install
npm run dev
```

Abre `http://127.0.0.1:5173/`.

### Tests

```bash
npm run test:ui
npm run typecheck
npm run build
```

La app React + Three.js se sirve como sitio estático. El módulo `src/alley/` contiene el catálogo, la geometría, las operaciones de escena, el visor y la lista de materiales.

## Despliegue

GitHub Actions compila la web en `dist/` y la publica con **GitHub Pages → Source: GitHub Actions**.

La app queda en `https://dhernandezgit.github.io/CONector-Tool/`.

## Arquitectura

```
src/
  App.tsx              # shell, tema, historial y guardado
  alley/
    types.ts           # piezas, puertos, uniones, mesas y escena
    catalog.ts         # catálogo, grupos, presets en L y conectores
    geometry.ts        # transformaciones, puertos, snapping, mesas y uniones
    scene.ts           # operaciones, mesas, portapapeles, archivos, grupos y BOM
    AlleyViewport.tsx  # Three.js, cámaras, mesas múltiples y edición
    AlleySandbox.tsx   # catálogo, inspector, mesas, atajos y controles
    ViewCube.tsx       # cubo de vistas y selector de proyección
    BomDialog.tsx      # lista de materiales y CSV
  components/          # logo, UI, ayuda y acerca de
```

La escena usa coordenadas Z-up. Las mesas se describen en `scene.tables` y comparten altura; los paneles se apoyan en `z = table.height` y sus puertos se calculan a partir de la posición y la rotación. Las uniones son datos derivados: se reconstruyen al mover, girar o eliminar piezas. El portapapeles y los archivos `.artist-alley.json` viven en `scene.ts`.

## Licencias

- Código propio: MIT.
- Geometrías del sandbox: originales y simplificadas, creadas para este proyecto.
- Artist Alley STL Pack: diseño de Jessie Shi (Sandoik). No incluido; consulta su licencia de uso personal.
- React, Three.js, Vite y Lucide conservan sus licencias.

Hecho para que un puesto de artistas se planifique en un rato y se vea como tú quieras.
