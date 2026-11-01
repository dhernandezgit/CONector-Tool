# CONector Tool · Artist Alley Sandbox

**Un montador 3D editable para planificar un puesto de artistas.**

CONector Tool es ahora un sandbox local-first para componer un puesto con paneles, expositores, estantes, accesorios y toldo. Puedes mover y girar piezas, conectarlas por sus puertos, agrupar composiciones, trabajar sobre una o varias mesas en L, deshacer cambios y generar una lista de materiales antes de montar el puesto real.

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
- **Estantes:** riser de 1 y 3 niveles, mini estante y organizador de panel de 4 niveles.
- **Accesorios:** gancho de estante, clips de panel, bandejas Skadis, toldo de 30 y 35 cm y mango de abanico con bloqueo.
- **Grupos rápidos:** puesto completo, pared slatwall, pared Skadis, esquina, toldo con rejilla, set de expositores, panel organizado, doble torre de 4 cubos, stand en U, pared escalonada y dos configuraciones de mesa en L.

### Colocación y conexiones

- Cámara **isométrica** para colocar sin distorsión y cámara en **perspectiva** para ver el resultado realista.
- **Cubo de vistas** arriba a la derecha: toca una zona del cubo para cambiar de vista o arrástralo para orbitar.
- Arrastra piezas sobre la mesa con rejilla y snapping.
- **Esferas grandes** en los puertos de esquina y borde: teal para libre, verde para conectado, rosa para el origen elegido y amarillo para un destino compatible.
- Toca dos esferas compatibles y las piezas se acercan para formar la unión.
- Cambia el tipo de conector desde el inspector: recto, esquina, 30°, 45°, 3/4/5 lados, Skadis H/V/X/Z, cola de milano integrada, rejilla y anclaje de toldo.
- Solo se ofrecen conectores válidos para el número de paneles y su ángulo.

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

1. Abre la app: el puesto de ejemplo se carga automáticamente.
2. Elige piezas o grupos en el catálogo de la izquierda. Prueba **Doble torre 4 cubos** o **Mesa en L de trabajo** para ver composiciones grandes.
3. Usa el cubo de vistas para colocar en isométrico y revisar en perspectiva.
4. Toca una esfera y luego otra compatible para conectar.
5. Selecciona una unión para cambiar el conector; selecciona una pieza para moverla, girarla, colorearla o montarla en un panel.
6. Con Mayús + clic selecciona varias piezas, arrastra para moverlas juntas, copia con Ctrl+C y pega con Ctrl+V.
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
