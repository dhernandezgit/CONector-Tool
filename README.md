# CONector Tool · Artist Alley Sandbox

**Un montador 3D editable para planificar un puesto de artistas.**

CONector Tool es ahora un sandbox local-first para componer un puesto con paneles, expositores, estantes, accesorios y toldo. Puedes mover y girar piezas, conectarlas por sus puertos, agrupar composiciones, trabajar sobre una o varias mesas en L, deshacer cambios y generar una lista de materiales antes de montar el puesto real. La escena inicial es una **doble torre de cuatro cubos sobre una base rosa de seis cajas y seis toldos**, organizada en grupos y subgrupos. La estantería de organizadores sigue disponible como grupo opcional. Al arrastrar, las piezas se imantan a los puertos cercanos y verás el destino y el conector antes de soltar; solo se ofrecen conectores reales del pack y el tipo se elige automáticamente.

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
- **Base de torre:** seis cajas rosas abiertas por abajo y por detrás, de 40 × 30 × 20 cm, enrasadas por detrás y con 10 cm de vuelo delantero. Cada caja lleva 4 `Edge2_Corner` y 2 `Edge3_Corner`; las cajas y la torre se enlazan con `360 Connector`.
- **Accesorios:** gancho de estante, clips de panel, bandejas Skadis, toldo de 30 y 35 cm con faldón curvo a 30° y sin patas al suelo, y mango de abanico con bloqueo.
- **Grupos rápidos:** bahía slatwall 3+2, pared slatwall 2×4, estantería de organizadores, base rosa 6 cajas, pared Skadis 2×4, esquina, rejilla angular, mini pared 1/4 y 1/2, fondo liso + rejilla, remate triangular, doble torre de 4 cubos, torre individual, stand en U angular, pared escalonada y dos configuraciones de mesa en L. Los ejemplos combinan paneles con baldas y organizadores; los conectores se generan como uniones al colocar las piezas.

### Colocación y conexiones

- **Añadir rápido** coloca un panel, una rejilla, una balda, una estantería de organizadores completa o un toldo sin buscar en el catálogo.
- Cámara **isométrica** para colocar sin distorsión y cámara en **perspectiva** para ver el resultado realista.
- **Cubo de vistas** arriba a la derecha: toca una zona del cubo para cambiar de vista o arrástralo para orbitar.
- Arrastra piezas sobre la mesa con rejilla y **snapping generoso**: al acercarte a un puerto, la pieza se imanta, se mueve en directo y muestra una línea y un marcador del conector que se formará.
- **Vista previa de unión:** mientras arrastras verás el nombre del panel destino, cuántas piezas participan y el conector elegido. Al soltar, la pieza queda unida; no hace falta acertar al píxel.
- **Esferas rosas** en los puertos de esquina y borde: solo aparecen al seleccionar una pieza. Rosa suave para libre, rosa oscuro para conectado, rosa intenso para el origen elegido y rosa brillante para un destino compatible.
- Toca dos esferas compatibles y las piezas se acercan para formar la unión.
- La lista de conectores muestra **solo las piezas reales que encajan**: `Edge2_Flat`, `Edge2_Corner`, `Angled30`, `Angled45`, `Edge3_Corner/Flat/L/LFlipped/T`, `Edge4_Corner/Flat/L/LFlipped`, `Edge5_Corner/L/LFlipped`, `Edge7_Corner`, placas Skadis, cola de milano, rejilla, ranura de organizador, montaje de toldo integrado y **360 Connector** para la base. El botón **Volver a automático** recupera la recomendación según la geometría.
- Las mezclas útiles siguen permitidas cuando el conector real sirve para ambas piezas: slatwall, Skadis y rejilla pueden compartir una unión de borde, y el conector se ajusta automáticamente si la geometría cambia.

### Toldo y organizadores

- El **toldo** tiene una lona de 30 × 30 cm y un faldón frontal de cuatro lóbulos curvos inclinado unos 30°. Su esquina superior trasera coincide con la **esquina superior del panel** y la lona baja hacia delante; las patas cortas se insertan en los **conectores de esquina estándar** (no incluidos con el toldo) y dos brazos visibles sostienen la lona. No hay patas que lleguen al suelo. Selecciona primero el panel y añade el toldo desde el catálogo: se coloca a la altura correcta y crea la unión automáticamente.
- Si añades el toldo sin seleccionar un panel, queda suelto sobre la mesa; selecciona un panel y vuelve a añadirlo para anclarlo en sus conectores.
- El **organizador de panel** es un lateral con cuatro ranuras. Coloca **dos, uno a cada lado**, y desliza baldas o paneles en las ranuras para formar una estantería. No se cuelga de un panel: se apoya en la mesa y queda estabilizado por las baldas y los paneles que lo rodean.
- La **base rosa** son seis cajas sin fondo y sin trasera de 40 × 30 × 20 cm. La torre se eleva 20 cm y queda enrasada por detrás. Cada caja lleva 4 `Edge2_Corner` y 2 `Edge3_Corner`; las cajas entre sí y con los paneles de la torre usan **360 Connector**.
- La **doble torre** incluye la base rosa unida al grupo de torres y **seis toldos**, uno en cada panel frontal superior. La estantería de organizadores es opcional y se añade desde su grupo; la **torre individual** mantiene sus cuatro baldas de rejilla.
- El grupo **Estantería de organizadores** coloca las dos estructuras laterales y cuatro baldas listas para usar.

### Edición segura

- Rotación en pasos de 90° con **R** o **E** (y **Q** en sentido contrario), además de ajuste fino.
- **Herramientas:** `1` seleccionar/mover, `2` selección por rectángulo arrastrable, `3` medir distancias y `4` orbitar sin seleccionar.
- **Auto unir / Libre:** el botón del visor alterna entre imán de puertos al arrastrar y movimiento libre sin conexión automática. Las esferas siguen disponibles para conectar a mano.
- **Cambiar panel:** al seleccionar un panel, el inspector ofrece sus equivalentes del mismo tamaño (slatwall, Skadis, rejilla o liso) conservando posición, giro, grupo y accesorios montados.
- **Fondo del visor:** se puede cambiar entre fondos oscuros de contraste y tonos claros. El modo claro es el predeterminado y el fondo se guarda en el navegador.
- Selección múltiple con Mayús + clic o con un **rectángulo de selección**; al arrastrar una pieza seleccionada se mueve todo el conjunto.
- **Ctrl+C / Ctrl+V** para copiar y pegar piezas o grupos completos; **Ctrl+A** selecciona todo.
- Flechas para mover 1 cm (Mayús: 5 cm); **Ctrl + ↑/↓** para subir o bajar 1 cm, **PageUp/PageDown** para 5 cm, y botones ↑/↓ en la barra flotante de selección.
- Arrastra una **mesa** desde una zona libre del tablero para moverla junto con todo lo que tiene encima. Después puedes **bloquearla** desde el inspector de mesas para que no se mueva por accidente.
- **Grupos anidados:** un grupo puede contener subgrupos. Al desagrupar se separa solo ese nivel y los subgrupos se mantienen. Mayús + clic en la lista de grupos selecciona varios grupos para crear un grupo padre.
- Duplicado sin apilar piezas: si una copia cae exactamente sobre otra, se reutiliza la existente.
- Eliminar un panel no rompe el resto: las conexiones se recalculan y los accesorios montados se liberan.
- Deshacer y rehacer con historial.
- Los accesorios se pueden montar en la cara frontal o dorsal de un panel y recolocar arrastrándolos.
- Atajos: **1/2/3/4** cambian de herramienta, **R/E** giran +90°, **Q** gira -90°, **Ctrl+C/V** copia y pega, **Ctrl+D** duplica, **G/Ctrl+G** agrupa, **Supr** elimina, **F** encuadra, **Ctrl+Z** deshace, **Ctrl+Mayús+Z / Ctrl+Y** rehace, **Esc** cancela una conexión y vuelve a Seleccionar.

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

1. Abre la app: se carga la **Doble torre 4 cubos** sobre la base rosa, con seis toldos y los grupos anidados.
2. Elige piezas o grupos en el catálogo de la izquierda. Prueba **Estantería de organizadores**, **Base rosa 6 cajas**, **Torre 4 cubos** o **Mesa en L de trabajo** para ver otras composiciones.
3. Usa el cubo de vistas para colocar en isométrico y revisar en perspectiva.
4. Arrastra una pieza cerca de un puerto: verás el destino y el conector real previsto. Suelta para dejarla unida. También puedes seleccionar una pieza y tocar dos esferas rosas, o usar la herramienta de rectángulo (`2`) para seleccionar varias.
5. Selecciona una unión para cambiar el conector o volver al automático; selecciona una pieza para moverla, girarla, colorearla o montarla en un panel. El color y los campos de transformación se aplican a todo el grupo. Para el toldo, selecciona antes el panel.
6. Con Mayús + clic o con el rectángulo selecciona varias piezas, arrastra para moverlas juntas, copia con Ctrl+C y pega con Ctrl+V. La sección **Color de la selección** recolorea todas las piezas y sus grupos. La lista **Tus grupos** permite seleccionar grupos completos y crear grupos anidados.
7. En **Mesas de trabajo** añade o edita mesas. Arrastra una mesa desde una zona libre del tablero para moverla con todo lo que tiene encima y actívala como **Bloqueada** cuando esté en su sitio. Usa **Archivo** y **Abrir** para guardar o recuperar un proyecto local.
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
