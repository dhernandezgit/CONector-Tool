import type {
  AlleyCatalogItem,
  AlleyGroupItemSpec,
  AlleyGroupPreset,
  AlleyPortDef,
  AlleySystem,
  AlleyTableSpec,
  BomLine,
  ConnectorDef,
  ConnectorType,
} from "./types";

const TABLE = 750;
/** Four usable shelf heights inside the panel organizer side frame. */
const ORGANIZER_SLOT_HEIGHTS = [40, 95, 150, 205] as const;
/** The tower sits on the 20 cm pink base boxes. */
const TOWER_BASE = 200;

function bom(name: string, qty: number, category: string, note?: string): BomLine {
  return { name, qty, category, note };
}

function corner(
  id: string,
  label: string,
  x: number,
  z: number,
  nx: number,
  nz: number,
  system: AlleySystem,
): AlleyPortDef {
  return {
    id,
    label,
    system,
    pos: [x, 0, z],
    normal: [nx, 0, nz],
  };
}

/** Four structural corners plus the two upper anchors used by awnings. */
function panelPorts(w: number, h: number, system: AlleySystem): AlleyPortDef[] {
  return [
    corner("bl", "Esquina inferior izquierda", -w / 2, 0, -1, -1, system),
    corner("br", "Esquina inferior derecha", w / 2, 0, 1, -1, system),
    corner("tl", "Esquina superior izquierda", -w / 2, h, -1, 1, system),
    corner("tr", "Esquina superior derecha", w / 2, h, 1, 1, system),
    { id: "awning-left", label: "Toma de toldo izquierda", system, pos: [-(w / 2 - 7), 0, h], normal: [0, 0, 1] },
    { id: "awning-right", label: "Toma de toldo derecha", system, pos: [w / 2 - 7, 0, h], normal: [0, 0, 1] },
  ];
}

function sidePorts(w: number, h: number, system: AlleySystem = "dovetail"): AlleyPortDef[] {
  return [
    { id: "side-left", label: "Lado izquierdo", system, pos: [-w / 2, 0, h / 2], normal: [-1, 0, 0] },
    { id: "side-right", label: "Lado derecho", system, pos: [w / 2, 0, h / 2], normal: [1, 0, 0] },
  ];
}

function panel(
  type: string,
  name: string,
  subtitle: string,
  w: number,
  h: number,
  d: number,
  system: AlleySystem,
  color: string,
  icon: string,
  bomName: string,
  description: string,
): AlleyCatalogItem {
  return {
    type,
    name,
    subtitle,
    category: "paneles",
    dims: { w, d, h },
    color,
    icon,
    ports: panelPorts(w, h, system),
    bom: [bom(bomName, 1, "Paneles")],
    defaultBase: "table",
    description,
    tags: ["panel", system, `${w}`],
  };
}

const display = (
  type: string,
  name: string,
  subtitle: string,
  w: number,
  levels: number,
  color: string,
  description: string,
): AlleyCatalogItem => ({
  type,
  name,
  subtitle,
  category: "expositores",
  dims: { w, d: 234, h: 305 },
  color,
  icon: "🖼️",
  ports: sidePorts(w, 305),
  bom: [
    bom(`Expositor ${subtitle}`, 1, "Expositores", `Kit de ${levels} niveles: 2 laterales, fondo, base, frente, tapa y separadores`),
  ],
  defaultBase: "table",
  description,
  tags: ["expositor", "stickers", "postales", `${levels}`],
});

const riser = (
  type: string,
  name: string,
  subtitle: string,
  w: number,
  h: number,
  d: number,
  levels: number,
  color: string,
  description: string,
): AlleyCatalogItem => ({
  type,
  name,
  subtitle,
  category: "estantes",
  dims: { w, d, h },
  color,
  icon: "🪜",
  ports: sidePorts(w, h),
  bom: [
    bom(`Estante ${subtitle}`, levels, "Estantes", `Balda de ${Math.round(w / 10)} cm`),
    bom(`Soporte lateral ${subtitle}`, 2, "Estantes", "Imprimir dos, izquierdo y derecho"),
  ],
  defaultBase: "table",
  description,
  tags: ["estante", "riser", `${levels}`],
});

const accessory = (
  type: string,
  name: string,
  subtitle: string,
  dims: { w: number; d: number; h: number },
  color: string,
  icon: string,
  bomLines: BomLine[],
  description: string,
  tags: string[],
): AlleyCatalogItem => ({
  type,
  name,
  subtitle,
  category: "accesorios",
  dims,
  color,
  icon,
  ports: [],
  bom: bomLines,
  defaultBase: "table",
  description,
  mountable: true,
  tags,
});

export const CATALOG: AlleyCatalogItem[] = [
  panel(
    "slatwall30",
    "Panel slatwall 30",
    "300 × 300 mm",
    300,
    300,
    18,
    "dovetail",
    "#f3c7d4",
    "▤",
    "Panel slatwall 30 cm",
    "Panel de lamas horizontales. Las colas de milano integradas permiten unir paneles en pared o en esquina.",
  ),
  panel(
    "slatwall35",
    "Panel slatwall 35",
    "350 × 350 mm",
    350,
    350,
    18,
    "dovetail",
    "#f3c7d4",
    "▤",
    "Panel slatwall 35 cm",
    "Versión grande del panel de lamas. Ideal para una pared de fondo.",
  ),
  panel(
    "slatwall15",
    "Slatwall 1/4",
    "150 × 150 mm",
    150,
    150,
    18,
    "dovetail",
    "#f3c7d4",
    "▤",
    "Panel slatwall 15 cm",
    "Cuarto de panel slatwall para completar huecos, escalones y remates.",
  ),
  panel(
    "slatwall15x30",
    "Slatwall 1/2 vertical",
    "150 × 300 mm",
    150,
    300,
    18,
    "dovetail",
    "#f3c7d4",
    "▯",
    "Panel slatwall 15 × 30 cm",
    "Medio panel slatwall vertical para columnas estrechas y laterales.",
  ),
  panel(
    "slatwall30x15",
    "Slatwall 1/2 horizontal",
    "300 × 150 mm",
    300,
    150,
    18,
    "dovetail",
    "#f3c7d4",
    "▭",
    "Panel slatwall 30 × 15 cm",
    "Medio panel slatwall horizontal para remates y baldas visuales.",
  ),
  panel(
    "skadis30",
    "Panel Skadis 30",
    "300 × 300 mm",
    300,
    300,
    10,
    "skadis",
    "#f7d9e4",
    "▦",
    "Panel Skadis 30 cm",
    "Panel perforado compatible con accesorios Skadis. Se une con placas de presión en los bordes.",
  ),
  panel(
    "skadis35",
    "Panel Skadis 35",
    "350 × 350 mm",
    350,
    350,
    10,
    "skadis",
    "#f7d9e4",
    "▦",
    "Panel Skadis 35 cm",
    "Panel perforado grande para una pared de accesorios.",
  ),
  panel(
    "skadis15",
    "Skadis 1/4",
    "150 × 150 mm",
    150,
    150,
    10,
    "skadis",
    "#f7d9e4",
    "▦",
    "Panel Skadis 15 cm",
    "Cuarto de panel Skadis para completar una pared o crear remates.",
  ),
  panel(
    "skadis15x30",
    "Skadis 1/2 vertical",
    "150 × 300 mm",
    150,
    300,
    10,
    "skadis",
    "#f7d9e4",
    "▯",
    "Panel Skadis 15 × 30 cm",
    "Medio panel Skadis vertical para columnas y laterales.",
  ),
  panel(
    "skadis30x15",
    "Skadis 1/2 horizontal",
    "300 × 150 mm",
    300,
    150,
    10,
    "skadis",
    "#f7d9e4",
    "▭",
    "Panel Skadis 30 × 15 cm",
    "Medio panel Skadis horizontal para remates y filas bajas.",
  ),
  {
    type: "triangle",
    name: "Panel triangular",
    subtitle: "300 × 300 mm",
    category: "paneles",
    dims: { w: 300, d: 12, h: 300 },
    color: "#cfe8e2",
    icon: "◺",
    ports: [
      { id: "bl", label: "Vértice inferior izquierdo", system: "dovetail", pos: [-150, 0, 0], normal: [-1, 0, -1] },
      { id: "br", label: "Vértice inferior derecho", system: "dovetail", pos: [150, 0, 0], normal: [1, 0, -1] },
      { id: "tl", label: "Vértice superior", system: "dovetail", pos: [-150, 0, 300], normal: [-1, 0, 1] },
    ],
    bom: [bom("Panel triangular", 1, "Paneles")],
    defaultBase: "table",
    description: "Panel triangular con cola de milano. Combínalo con otro triángulo para crear esquinas y formas.",
    tags: ["panel", "triángulo", "dovetail"],
  },
  panel(
    "wire30",
    "Rejilla 30",
    "300 × 300 mm",
    300,
    300,
    10,
    "wire",
    "#d9dee3",
    "▥",
    "Panel de rejilla 30 cm",
    "Rejilla metálica de 30 cm. El toldo se ancla en sus dos puntos superiores.",
  ),
  panel(
    "wire35",
    "Rejilla 35",
    "350 × 350 mm",
    350,
    350,
    10,
    "wire",
    "#d9dee3",
    "▥",
    "Panel de rejilla 35 cm",
    "Rejilla metálica grande para el toldo de 35 cm.",
  ),
  panel(
    "wire15",
    "Rejilla 1/4",
    "150 × 150 mm",
    150,
    150,
    10,
    "wire",
    "#d9dee3",
    "▥",
    "Panel de rejilla 15 cm",
    "Cuarto de rejilla para completar cubos, escalones y remates.",
  ),
  panel(
    "wire15x30",
    "Rejilla 1/2 vertical",
    "150 × 300 mm",
    150,
    300,
    10,
    "wire",
    "#d9dee3",
    "▯",
    "Panel de rejilla 15 × 30 cm",
    "Media rejilla vertical para torres estrechas y laterales.",
  ),
  panel(
    "wire30x15",
    "Rejilla 1/2 horizontal",
    "300 × 150 mm",
    300,
    150,
    10,
    "wire",
    "#d9dee3",
    "▭",
    "Panel de rejilla 30 × 15 cm",
    "Media rejilla horizontal para filas bajas y remates.",
  ),
  {
    ...panel(
      "flat30",
      "Panel liso 30",
      "300 × 300 mm · color",
      300,
      300,
      12,
      "wire",
      "#cfe8e2",
      "▧",
      "Panel liso 30 cm",
      "Versión plana y coloreada de la rejilla de 30 cm. Sirve de fondo, separador o puerta.",
    ),
    tags: ["panel", "liso", "flat", "wire", "300"],
  },
  {
    ...panel(
      "flat35",
      "Panel liso 35",
      "350 × 350 mm · color",
      350,
      350,
      12,
      "wire",
      "#cfe8e2",
      "▧",
      "Panel liso 35 cm",
      "Versión plana y coloreada de la rejilla de 35 cm.",
    ),
    tags: ["panel", "liso", "flat", "wire", "350"],
  },
  {
    ...panel(
      "flat15",
      "Panel liso 1/4",
      "150 × 150 mm · color",
      150,
      150,
      12,
      "wire",
      "#cfe8e2",
      "▧",
      "Panel liso 15 cm",
      "Cuarto de panel liso para remates y huecos.",
    ),
    tags: ["panel", "liso", "flat", "wire", "150"],
  },
  {
    ...panel(
      "flat15x30",
      "Panel liso 1/2 vertical",
      "150 × 300 mm · color",
      150,
      300,
      12,
      "wire",
      "#cfe8e2",
      "▯",
      "Panel liso 15 × 30 cm",
      "Medio panel liso vertical para columnas y laterales.",
    ),
    tags: ["panel", "liso", "flat", "wire", "150", "300"],
  },
  {
    ...panel(
      "flat30x15",
      "Panel liso 1/2 horizontal",
      "300 × 150 mm · color",
      300,
      150,
      12,
      "wire",
      "#cfe8e2",
      "▭",
      "Panel liso 30 × 15 cm",
      "Medio panel liso horizontal para filas bajas y remates.",
    ),
    tags: ["panel", "liso", "flat", "wire", "300", "150"],
  },
  display("display25", "Expositor 2.5\"", "2.5\" · 6 niveles", 180, 6, "#f6c9d7", "Expositor compacto de seis niveles para stickers pequeños."),
  display("display3", "Expositor 3\"", "3\" · 5 niveles", 220, 5, "#f3c7d4", "Expositor de cinco niveles para stickers de 3 pulgadas."),
  display("display4", "Expositor 4\"", "4\" · 4 niveles", 289, 4, "#f0b8c8", "El expositor clásico de cuatro niveles para stickers y postales de 4 pulgadas."),
  display("display5", "Expositor 5\"", "5\" · 3 niveles", 330, 3, "#eeadc1", "Expositor ancho de tres niveles para postales y prints grandes."),
  riser("riser1", "Riser 1 nivel", "1 nivel", 305, 164, 102, 1, "#e8c9a8", "Estante escalonado de un nivel para dar altura a los productos del fondo."),
  riser("riser3", "Riser 3 niveles", "3 niveles", 305, 248, 243, 3, "#e8c9a8", "Estante escalonado de tres niveles. La pieza central de cualquier mesa de artista."),
  {
    type: "minishelf",
    name: "Mini estante",
    subtitle: "1 nivel",
    category: "estantes",
    dims: { w: 160, d: 102, h: 164 },
    color: "#ead0b4",
    icon: "🪑",
    ports: sidePorts(160, 164),
    bom: [
      bom("Mini estante", 1, "Estantes", "Balda de 16 cm"),
      bom("Soporte lateral mini", 2, "Estantes"),
    ],
    defaultBase: "table",
    description: "Estante pequeño para huecos, tarjetas y detalles.",
    tags: ["estante", "mini"],
  },
  {
    type: "wireshelf30",
    name: "Balda de rejilla 30",
    subtitle: "300 × 300 mm",
    category: "estantes",
    dims: { w: 300, d: 300, h: 12 },
    color: "#d9dee3",
    icon: "▤",
    ports: [
      { id: "fl", label: "Esquina frontal izquierda", system: "wire", pos: [-150, -150, 0], normal: [0, 0, -1] },
      { id: "fr", label: "Esquina frontal derecha", system: "wire", pos: [150, -150, 0], normal: [0, 0, -1] },
      { id: "bl", label: "Esquina trasera izquierda", system: "wire", pos: [-150, 150, 0], normal: [0, 0, -1] },
      { id: "br", label: "Esquina trasera derecha", system: "wire", pos: [150, 150, 0], normal: [0, 0, -1] },
      { id: "ml-front", label: "Soporte izquierdo frontal", system: "wire", pos: [-150, -69, 0], normal: [1, 0, 0] },
      { id: "mr-front", label: "Soporte derecho frontal", system: "wire", pos: [150, -69, 0], normal: [-1, 0, 0] },
      { id: "ml-back", label: "Soporte izquierdo trasero", system: "wire", pos: [-150, 69, 0], normal: [1, 0, 0] },
      { id: "mr-back", label: "Soporte derecho trasero", system: "wire", pos: [150, 69, 0], normal: [-1, 0, 0] },
    ],
    bom: [bom("Balda de rejilla 30", 1, "Estantes", "Balda horizontal para crear un nivel de exposición")],
    defaultBase: "table",
    description:
      "Balda horizontal de rejilla de 30 × 30 cm. Se apoya en las esquinas de una torre y convierte cada cubo en una superficie útil.",
    horizontal: true,
    tags: ["balda", "rejilla", "horizontal", "torre"],
  },
  {
    type: "basebox40",
    name: "Caja base 40 × 30 × 20",
    subtitle: "Abierta por abajo y detrás",
    category: "expositores",
    dims: { w: 300, d: 400, h: 200 },
    color: "#f3c7d4",
    icon: "▣",
    ports: [
      { id: "top-front-left", label: "Tapa frontal izquierda", system: "dovetail", pos: [-150, -100, 200], normal: [0, 0, 1] },
      { id: "top-front-right", label: "Tapa frontal derecha", system: "dovetail", pos: [150, -100, 200], normal: [0, 0, 1] },
      { id: "top-back-left", label: "Tapa trasera izquierda", system: "dovetail", pos: [-150, 200, 200], normal: [0, 0, 1] },
      { id: "top-back-right", label: "Tapa trasera derecha", system: "dovetail", pos: [150, 200, 200], normal: [0, 0, 1] },
      { id: "side-left", label: "Lateral izquierdo", system: "dovetail", pos: [-150, 0, 100], normal: [-1, 0, 0] },
      { id: "side-right", label: "Lateral derecho", system: "dovetail", pos: [150, 0, 100], normal: [1, 0, 0] },
    ],
    bom: [
      bom("Panel base rosa 40 × 30 cm", 1, "Paneles", "Tapa superior"),
      bom("Panel frontal rosa 40 × 20 cm", 1, "Paneles"),
      bom("Panel lateral rosa 30 × 20 cm", 2, "Paneles"),
      bom("Edge2_Corner", 4, "Conectores de borde", "Esquinas inferiores frontales y superiores traseras"),
      bom("Edge3_Corner", 2, "Conectores de borde", "Esquinas superiores frontales"),
    ],
    defaultBase: "table",
    description:
      "Caja rosa de 40 cm de largo, 30 cm de ancho y 20 cm de alto, sin fondo y sin trasera. Seis cajas forman la base de la torre, enrasadas por detrás y con 10 cm de vuelo delantero.",
    tags: ["base", "caja", "40", "rosa", "abierta"],
  },
  {
    type: "organizer",
    name: "Organizador de panel",
    subtitle: "Lateral · 4 ranuras",
    category: "estantes",
    dims: { w: 150, d: 12, h: 245 },
    color: "#d9c2e8",
    icon: "🗄️",
    ports: ORGANIZER_SLOT_HEIGHTS.flatMap((z, index) => [
      {
        id: `slot-${index + 1}-front`,
        label: `Ranura ${index + 1} frontal`,
        system: "dovetail" as AlleySystem,
        pos: [0, -69, z] as [number, number, number],
        normal: [1, 0, 0] as [number, number, number],
      },
      {
        id: `slot-${index + 1}-back`,
        label: `Ranura ${index + 1} trasera`,
        system: "dovetail" as AlleySystem,
        pos: [0, 69, z] as [number, number, number],
        normal: [1, 0, 0] as [number, number, number],
      },
    ]),
    bom: [bom("Lateral de organizador", 1, "Estantes", "Se necesitan dos para formar una estantería")],
    defaultBase: "table",
    description:
      "Lateral con cuatro ranuras para baldas. Coloca dos, uno a cada lado, y desliza paneles o baldas para convertir el hueco en una estantería.",
    tags: ["organizador", "estantería", "panel", "4 alturas"],
  },
  accessory(
    "shelfhook",
    "Gancho de estante",
    "1 gancho",
    { w: 30, d: 60, h: 34 },
    "#c9a87c",
    "🪝",
    [bom("Gancho de estante", 1, "Accesorios")],
    "Gancho que se engancha en una lama o en un panel Skadis.",
    ["gancho", "hook"],
  ),
  accessory(
    "panelclips",
    "Clips de panel",
    "Set de 4",
    { w: 120, d: 30, h: 26 },
    "#f0b8c8",
    "📎",
    [bom("Clip de panel", 4, "Accesorios")],
    "Cuatro clips para sujetar carteles, tela o guirnaldas al borde de un panel.",
    ["clip", "cartel"],
  ),
  accessory(
    "bins",
    "Bandejas Skadis",
    "Set de 4",
    { w: 160, d: 80, h: 60 },
    "#f5c6d8",
    "🧺",
    [bom("Bandeja Skadis", 4, "Accesorios", "Set de cuatro bandejas")],
    "Cuatro bandejas abiertas que se cuelgan de un panel Skadis para separar productos pequeños.",
    ["bandeja", "skadis", "organizador"],
  ),
  {
    type: "awning30",
    name: "Toldo 30 cm",
    subtitle: "Tela A–D · patas a conectores",
    category: "accesorios",
    dims: { w: 300, d: 306, h: 210 },
    color: "#f4a7bb",
    icon: "⛱️",
    ports: [
      { id: "foot-left", label: "Pata izquierda", system: "edge", pos: [-143, 0, 210], normal: [0, 0, -1] },
      { id: "foot-right", label: "Pata derecha", system: "edge", pos: [143, 0, 210], normal: [0, 0, -1] },
    ],
    bom: [
      bom("Tela de toldo A", 1, "Toldo"),
      bom("Tela de toldo B", 1, "Toldo"),
      bom("Tela de toldo C", 1, "Toldo"),
      bom("Tela de toldo D", 1, "Toldo"),
      bom("Soporte trasero de toldo 30 cm", 2, "Toldo"),
      bom("Brazo de toldo 30 cm", 2, "Toldo"),
      bom("Enlace de toldo", 1, "Toldo"),
    ],
    defaultBase: "table",
    description:
      "Toldo plegable de 30 cm con tela a rayas y faldón curvo. Sus dos patas se insertan en los conectores de esquina del panel (no incluidos) y no llegan al suelo.",
    tags: ["toldo", "awning", "anclaje", "panel"],
  },
  {
    type: "awning35",
    name: "Toldo 35 cm",
    subtitle: "Tela A–D · patas a conectores",
    category: "accesorios",
    dims: { w: 350, d: 356, h: 225 },
    color: "#f4a7bb",
    icon: "⛱️",
    ports: [
      { id: "foot-left", label: "Pata izquierda", system: "edge", pos: [-168, 0, 225], normal: [0, 0, -1] },
      { id: "foot-right", label: "Pata derecha", system: "edge", pos: [168, 0, 225], normal: [0, 0, -1] },
    ],
    bom: [
      bom("Tela de toldo A", 1, "Toldo"),
      bom("Tela de toldo B", 1, "Toldo"),
      bom("Tela de toldo C", 1, "Toldo"),
      bom("Tela de toldo D", 1, "Toldo"),
      bom("Soporte trasero de toldo 35 cm", 2, "Toldo"),
      bom("Brazo de toldo 35 cm", 2, "Toldo"),
      bom("Enlace de toldo", 1, "Toldo"),
    ],
    defaultBase: "table",
    description:
      "Toldo plegable de 35 cm con tela a rayas y faldón curvo. Sus dos patas se insertan en los conectores de esquina del panel (no incluidos) y no llegan al suelo.",
    tags: ["toldo", "awning", "anclaje", "panel"],
  },
  {
    type: "fanhandle",
    name: "Mango de abanico",
    subtitle: "Mango + bloqueo",
    category: "accesorios",
    dims: { w: 39, d: 131, h: 3 },
    color: "#e8c9a8",
    icon: "🪭",
    ports: [],
    bom: [
      bom("Mango de abanico", 1, "Accesorios"),
      bom("Pieza de bloqueo de abanico", 1, "Accesorios"),
    ],
    defaultBase: "table",
    description: "Mango impreso para abanico de mano con su pieza de bloqueo. Es un accesorio decorativo, no estructural.",
    tags: ["abanico", "mango", "accesorio"],
  },
];

export const CATALOG_BY_TYPE = Object.fromEntries(CATALOG.map((item) => [item.type, item])) as Record<
  string,
  AlleyCatalogItem
>;

const GRID = 300;

/**
 * Place a panel so one of its vertical edges meets `anchor`. `corner` names
 * the panel corner that lands on the anchor, which lets examples reuse the
 * same corner ports at 30°, 45° or 90° without hand-written trigonometry.
 */
function panelAtCorner(
  type: string,
  anchor: { x: number; y: number },
  rotation: number,
  corner: "left" | "right",
  baseZ: number,
  width = GRID,
): AlleyGroupItemSpec {
  const sign = corner === "left" ? 1 : -1;
  const radians = (rotation * Math.PI) / 180;
  return {
    type,
    x: anchor.x + (sign * width * Math.cos(radians)) / 2,
    y: anchor.y + (sign * width * Math.sin(radians)) / 2,
    baseZ,
    rotation,
  };
}

/** Three-sided 30 cm cube: front + two sides, deliberately open at the back. */
function towerSpecs(centerX: number, levels = 4): AlleyGroupItemSpec[] {
  const specs: AlleyGroupItemSpec[] = [];
  for (let level = 0; level < levels; level += 1) {
    const baseZ = level * GRID;
    specs.push({ type: "wire30", x: centerX, y: -GRID / 2, baseZ });
    specs.push({ type: "wire30", x: centerX - GRID / 2, y: 0, baseZ, rotation: 90 });
    specs.push({ type: "wire30", x: centerX + GRID / 2, y: 0, baseZ, rotation: 90 });
  }
  return specs;
}

/** Two side frames facing each other, with four horizontal shelves between. */
const ORGANIZER_SHELF_ITEMS: AlleyGroupItemSpec[] = [
  { type: "organizer", x: -150, y: 0, baseZ: 0 },
  { type: "organizer", x: 150, y: 0, baseZ: 0 },
  ...ORGANIZER_SLOT_HEIGHTS.map((z) => ({ type: "wireshelf30", x: 0, y: 0, baseZ: z })),
];

const BASE_BOX_ITEMS: AlleyGroupItemSpec[] = [-750, -450, -150, 150, 450, 750].map((x) => ({
  type: "basebox40",
  x,
  y: -50,
  baseZ: 0,
}));

const TOWER_CORE_ITEMS: AlleyGroupItemSpec[] = [
  ...towerSpecs(-750).map((spec) => ({ ...spec, baseZ: spec.baseZ + TOWER_BASE })),
  ...towerSpecs(750).map((spec) => ({ ...spec, baseZ: spec.baseZ + TOWER_BASE })),
  ...[-450, -150, 150, 450].map((x) => ({
    type: "wire30",
    x,
    y: -GRID / 2,
    baseZ: 900 + TOWER_BASE,
  })),
  ...[-750, 750].flatMap((centerX) =>
    [0, 1, 2, 3].map((level) => ({
      type: "wireshelf30",
      x: centerX,
      y: 0,
      baseZ: level * GRID + TOWER_BASE,
    })),
  ),
];

const TOWER_AWNING_ITEMS: AlleyGroupItemSpec[] = [-750, -450, -150, 150, 450, 750].map((x) => ({
  type: "awning30",
  x,
  y: -GRID / 2,
  baseZ: 1200 + TOWER_BASE - 210,
}));

const TWIN_TOWER_ITEMS: AlleyGroupItemSpec[] = [
  // Six pink open-bottom boxes form a 20 cm base; the tower sits on top.
  ...BASE_BOX_ITEMS,
  ...TOWER_CORE_ITEMS,
  // The organizer shelf sits behind the tower, on the artist side of the table.
  ...ORGANIZER_SHELF_ITEMS.map((spec) => ({ ...spec, y: spec.y + 300 })),
  // One awning on each of the six top-front panels.
  ...TOWER_AWNING_ITEMS,
];

const SINGLE_TOWER_ITEMS: AlleyGroupItemSpec[] = [
  ...towerSpecs(0),
  ...[0, 1, 2, 3].map((level) => ({ type: "wireshelf30", x: 0, y: 0, baseZ: level * GRID })),
];

/** A symmetric slatwall bay: three panels at the front and two 45° wings. */
const STARTER_ITEMS: AlleyGroupItemSpec[] = [
  ...[-GRID, 0, GRID].flatMap((x) => [
    { type: "slatwall30", x, y: 200, baseZ: 0 },
    { type: "slatwall30", x, y: 200, baseZ: GRID },
  ]),
  ...[-1, 1].flatMap((side) =>
    [0, GRID].map((baseZ) =>
      panelAtCorner("slatwall30", { x: side * (GRID * 1.5), y: 200 }, side * 45, side < 0 ? "right" : "left", baseZ),
    ),
  ),
];

/** Wire-grid bay with 30° wings to show angled panels in the wire family. */
const WIRE_ANGLED_ITEMS: AlleyGroupItemSpec[] = [
  ...[-GRID, 0, GRID].flatMap((x) => [
    { type: "wire30", x, y: 0, baseZ: 0 },
    { type: "wire30", x, y: 0, baseZ: GRID },
  ]),
  ...[-1, 1].flatMap((side) =>
    [0, GRID].map((baseZ) =>
      panelAtCorner("wire30", { x: side * (GRID * 1.5), y: 0 }, side * 30, side < 0 ? "right" : "left", baseZ),
    ),
  ),
];

/** Every small slatwall size in one 30 × 75 cm sample wall. */
const SMALL_PANEL_ITEMS: AlleyGroupItemSpec[] = [
  { type: "slatwall15x30", x: -GRID / 4, y: 0, baseZ: 0 },
  { type: "slatwall15x30", x: GRID / 4, y: 0, baseZ: 0 },
  { type: "slatwall30x15", x: 0, y: 0, baseZ: GRID },
  { type: "slatwall30x15", x: 0, y: 0, baseZ: GRID + GRID / 2 },
  { type: "slatwall15", x: -GRID / 4, y: 0, baseZ: GRID * 2 },
  { type: "slatwall15", x: GRID / 4, y: 0, baseZ: GRID * 2 },
];

/** Flat coloured panels below, wire grids above; both use wire connectors. */
const FLAT_WIRE_ITEMS: AlleyGroupItemSpec[] = [
  { type: "flat30", x: -GRID, y: 0, baseZ: 0, color: "#f3c7d4" },
  { type: "flat30", x: 0, y: 0, baseZ: 0, color: "#cfe8e2" },
  { type: "flat30", x: GRID, y: 0, baseZ: 0, color: "#f7e3b0" },
  ...[-GRID, 0, GRID].map((x) => ({ type: "wire30", x, y: 0, baseZ: GRID })),
];

/** Two slatwall panels capped by two triangles for a sloped silhouette. */
const TRIANGLE_FINISH_ITEMS: AlleyGroupItemSpec[] = [
  { type: "slatwall30", x: 0, y: 0, baseZ: 0 },
  { type: "slatwall30", x: 0, y: 0, baseZ: GRID },
  { type: "triangle", x: GRID, y: 0, baseZ: 0 },
  { type: "triangle", x: GRID, y: 0, baseZ: GRID },
];

/** Five-panel back wall with two 45° side wings, all slatwall. */
const U_BOOTH_ITEMS: AlleyGroupItemSpec[] = [
  ...[-2, -1, 0, 1, 2].flatMap((column) => [
    { type: "slatwall30", x: column * GRID, y: 200, baseZ: 0 },
    { type: "slatwall30", x: column * GRID, y: 200, baseZ: GRID },
  ]),
  ...[-1, 1].flatMap((side) =>
    [0, GRID].map((baseZ) =>
      panelAtCorner("slatwall30", { x: side * (GRID * 2.5), y: 200 }, side * 45, side < 0 ? "right" : "left", baseZ),
    ),
  ),
];

/** Stepped 3-2-1 wall with two 30° returns at the base. */
const STEPPED_WALL_ITEMS: AlleyGroupItemSpec[] = [
  ...[-GRID, 0, GRID].flatMap((x, index) =>
    [0, 1, 2].slice(0, 3 - index).map((level) => ({ type: "slatwall30", x, y: 100, baseZ: level * GRID })),
  ),
  panelAtCorner("slatwall30", { x: -GRID * 1.5, y: 100 }, -30, "right", 0),
  panelAtCorner("slatwall30", { x: GRID * 1.5, y: 100 }, 30, "left", 0),
];

/**
 * Two equal 180 × 60 cm tables meeting at a true 90° corner. The lateral table
 * starts flush with the primary table's front edge, so both arms are the same
 * length and there is no T-shaped overhang at the joint.
 */
const L_TABLES: AlleyTableSpec[] = [
  { name: "Mesa principal", width: 1800, depth: 600, x: -450, y: 0, rotation: 0 },
  { name: "Mesa lateral", width: 1800, depth: 600, x: 750, y: 600, rotation: 90 },
];

/** Low one-level slatwall screens along the back edge of both L tables. */
const L_WORK_ITEMS: AlleyGroupItemSpec[] = [
  ...[-900, -600, -300, 0].map((x) => ({ type: "slatwall30", x, y: 200, baseZ: 0 })),
  ...[150, 450, 750, 1050].map((y) => ({ type: "slatwall30", x: 900, y, baseZ: 0, rotation: 90 })),
];

const L_WALL_ITEMS: AlleyGroupItemSpec[] = [
  ...[-1200, -900, -600, -300, 0, 300].flatMap((x) => [
    { type: "slatwall30", x, y: 200, baseZ: 0 },
    { type: "slatwall30", x, y: 200, baseZ: GRID },
  ]),
  ...[-150, 150, 450, 750, 1050, 1350].flatMap((y) => [
    { type: "slatwall30", x: 900, y, baseZ: 0, rotation: 90 },
    { type: "slatwall30", x: 900, y, baseZ: GRID, rotation: 90 },
  ]),
];

export const GROUPS: AlleyGroupPreset[] = [
  {
    id: "starter",
    name: "Bahía slatwall 3+2",
    description:
      "Tres paneles de slatwall al frente y dos alas a 45°, en dos niveles. Una base sencilla para una pared de productos.",
    icon: "🏪",
    items: STARTER_ITEMS,
  },
  {
    id: "wall-slatwall",
    name: "Pared slatwall 2×4",
    description: "Ocho paneles de 30 cm en dos columnas y cuatro alturas, con uniones de cola de milano.",
    icon: "▤",
    items: [-150, 150].flatMap((x) =>
      [0, 1, 2, 3].map((level) => ({ type: "slatwall30", x, y: 0, baseZ: level * GRID })),
    ),
  },
  {
    id: "organizer-shelf",
    name: "Estantería de organizadores",
    description:
      "Dos organizadores laterales, uno a cada lado, y cuatro baldas de rejilla. Las baldas se deslizan en las ranuras y convierten el hueco en una estantería.",
    icon: "🗄️",
    items: ORGANIZER_SHELF_ITEMS,
  },
  {
    id: "tower-base",
    name: "Base rosa 6 cajas",
    description:
      "Seis cajas abiertas por abajo, de 40 × 30 × 20 cm, enrasadas por detrás. Forman la base de una torre y dejan 10 cm de vuelo delantero.",
    icon: "▣",
    items: BASE_BOX_ITEMS,
  },
  {
    id: "tower-core",
    name: "Torres y puente",
    description:
      "Las dos torres de 4 cubos elevadas 20 cm, con sus ocho baldas y el puente de cuatro paneles, sin base ni toldos.",
    icon: "🏗️",
    items: TOWER_CORE_ITEMS,
    hidden: true,
  },
  {
    id: "tower-awnings",
    name: "Toldos de la torre",
    description: "Seis toldos de 30 cm, uno para cada panel frontal superior de la torre.",
    icon: "⛱️",
    items: TOWER_AWNING_ITEMS,
    hidden: true,
  },
  {
    id: "wall-skadis",
    name: "Pared Skadis 2×4",
    description: "Ocho paneles perforados en dos columnas y cuatro alturas, con placas Skadis.",
    icon: "▦",
    items: [-150, 150].flatMap((x) =>
      [0, 1, 2, 3].map((level) => ({ type: "skadis30", x, y: 0, baseZ: level * GRID })),
    ),
  },
  {
    id: "corner-slatwall",
    name: "Esquina slatwall",
    description: "Dos paredes de dos paneles que se encuentran en ángulo recto.",
    icon: "◩",
    items: [
      { type: "slatwall30", x: -150, y: 0, baseZ: 0 },
      { type: "slatwall30", x: -150, y: 0, baseZ: 300 },
      { type: "slatwall30", x: 0, y: 150, baseZ: 0, rotation: 90 },
      { type: "slatwall30", x: 0, y: 150, baseZ: 300, rotation: 90 },
    ],
  },
  {
    id: "wire-angled",
    name: "Rejilla angular 30°",
    description:
      "Tres rejillas al frente y dos alas a 30° en dos niveles. Solo paneles; las uniones de rejilla se generan al conectar.",
    icon: "▥",
    items: WIRE_ANGLED_ITEMS,
  },
  {
    id: "small-panels",
    name: "Mini pared 1/4 y 1/2",
    description: "Dos medios paneles verticales, dos horizontales y dos cuartos para probar todas las medidas pequeñas.",
    icon: "🧩",
    items: SMALL_PANEL_ITEMS,
  },
  {
    id: "flat-wire",
    name: "Fondo liso + rejilla",
    description: "Tres paneles lisos de color como fondo y tres rejillas encima, con uniones de rejilla.",
    icon: "▧",
    items: FLAT_WIRE_ITEMS,
  },
  {
    id: "triangle-finish",
    name: "Remate triangular",
    description: "Dos paneles slatwall y dos triángulos que rematan el borde con una pendiente.",
    icon: "◺",
    items: TRIANGLE_FINISH_ITEMS,
  },
  {
    id: "twin-towers",
    name: "Doble torre 4 cubos",
    description:
      "Dos torres de rejilla de 30 cm y 4 cubos sobre seis cajas rosas de 40 × 30 × 20 cm enrasadas por detrás. Cuatro baldas por torre, estantería de organizadores detrás y seis toldos, uno en cada panel superior.",
    icon: "🏗️",
    items: TWIN_TOWER_ITEMS,
  },
  {
    id: "single-tower",
    name: "Torre 4 cubos",
    description:
      "Una torre de rejilla de 30 cm y 4 cubos con cuatro baldas horizontales. Ideal para un puesto pequeño o como módulo adicional.",
    icon: "🗼",
    items: SINGLE_TOWER_ITEMS,
  },
  {
    id: "u-booth",
    name: "Stand en U angular",
    description:
      "Pared de fondo de 5 × 2 paneles y dos alas laterales a 45°. Solo paneles; las uniones se generan al conectar.",
    icon: "🧱",
    items: U_BOOTH_ITEMS,
  },
  {
    id: "stepped-wall",
    name: "Pared escalonada 3-2-1",
    description:
      "Tres columnas escalonadas y dos remates a 30° en la base. Solo paneles; las uniones se generan al conectar.",
    icon: "🪜",
    items: STEPPED_WALL_ITEMS,
  },
  {
    id: "workspace-l-work",
    name: "Mesa en L de trabajo",
    description: "Dos mesas de 180 × 60 cm en L simétrica con biombos bajos de slatwall en las dos alas.",
    icon: "📐",
    tables: L_TABLES,
    items: L_WORK_ITEMS,
  },
  {
    id: "workspace-l-wall",
    name: "Mesa en L + pared",
    description: "La configuración de trabajo en L con dos paredes slatwall de dos niveles, solo paneles y uniones.",
    icon: "🛠️",
    tables: L_TABLES,
    items: L_WALL_ITEMS,
  },
];

export const GROUPS_BY_ID = Object.fromEntries(GROUPS.map((group) => [group.id, group])) as Record<
  string,
  AlleyGroupPreset
>;

export const CONNECTORS: Record<ConnectorType, ConnectorDef> = {
  "edge-2-corner": {
    id: "edge-2-corner",
    name: "Edge2_Corner",
    short: "2 esquinas",
    category: "Conectores de borde",
    color: "#e47f9c",
    bomName: "Edge2_Corner",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 2,
    maxPanels: 2,
  },
  "edge-2-flat": {
    id: "edge-2-flat",
    name: "Edge2_Flat",
    short: "2 recto",
    category: "Conectores de borde",
    color: "#e47f9c",
    bomName: "Edge2_Flat",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 2,
    maxPanels: 2,
  },
  "edge-2-30": {
    id: "edge-2-30",
    name: "Angled30",
    short: "Angled30",
    category: "Conectores angulados",
    color: "#e9a05f",
    bomName: "Angled30",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 2,
    maxPanels: 2,
  },
  "edge-2-45": {
    id: "edge-2-45",
    name: "Angled45",
    short: "Angled45",
    category: "Conectores angulados",
    color: "#e9a05f",
    bomName: "Angled45",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 2,
    maxPanels: 2,
  },
  "edge-3-corner": {
    id: "edge-3-corner",
    name: "Edge3_Corner",
    short: "3 esquinas",
    category: "Conectores de borde",
    color: "#d9789b",
    bomName: "Edge3_Corner",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 3,
    maxPanels: 3,
  },
  "edge-3-flat": {
    id: "edge-3-flat",
    name: "Edge3_Flat",
    short: "3 recto",
    category: "Conectores de borde",
    color: "#d9789b",
    bomName: "Edge3_Flat",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 3,
    maxPanels: 3,
  },
  "edge-3-L": {
    id: "edge-3-L",
    name: "Edge3_L",
    short: "3 L",
    category: "Conectores de borde",
    color: "#d9789b",
    bomName: "Edge3_L",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 3,
    maxPanels: 3,
  },
  "edge-3-L-flipped": {
    id: "edge-3-L-flipped",
    name: "Edge3_LFlipped",
    short: "3 L espejo",
    category: "Conectores de borde",
    color: "#d9789b",
    bomName: "Edge3_LFlipped",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 3,
    maxPanels: 3,
  },
  "edge-3-T": {
    id: "edge-3-T",
    name: "Edge3_T",
    short: "3 T",
    category: "Conectores de borde",
    color: "#d9789b",
    bomName: "Edge3_T",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 3,
    maxPanels: 3,
  },
  "edge-4-corner": {
    id: "edge-4-corner",
    name: "Edge4_Corner",
    short: "4 esquinas",
    category: "Conectores de borde",
    color: "#c86f96",
    bomName: "Edge4_Corner",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 4,
    maxPanels: 4,
  },
  "edge-4-flat": {
    id: "edge-4-flat",
    name: "Edge4_Flat",
    short: "4 recto",
    category: "Conectores de borde",
    color: "#c86f96",
    bomName: "Edge4_Flat",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 4,
    maxPanels: 4,
  },
  "edge-4-L": {
    id: "edge-4-L",
    name: "Edge4_L",
    short: "4 L",
    category: "Conectores de borde",
    color: "#c86f96",
    bomName: "Edge4_L",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 4,
    maxPanels: 4,
  },
  "edge-4-L-flipped": {
    id: "edge-4-L-flipped",
    name: "Edge4_LFlipped",
    short: "4 L espejo",
    category: "Conectores de borde",
    color: "#c86f96",
    bomName: "Edge4_LFlipped",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 4,
    maxPanels: 4,
  },
  "edge-5-corner": {
    id: "edge-5-corner",
    name: "Edge5_Corner",
    short: "5 esquinas",
    category: "Conectores de borde",
    color: "#b8668d",
    bomName: "Edge5_Corner",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 5,
    maxPanels: 5,
  },
  "edge-5-L": {
    id: "edge-5-L",
    name: "Edge5_L",
    short: "5 L",
    category: "Conectores de borde",
    color: "#b8668d",
    bomName: "Edge5_L",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 5,
    maxPanels: 5,
  },
  "edge-5-L-flipped": {
    id: "edge-5-L-flipped",
    name: "Edge5_LFlipped",
    short: "5 L espejo",
    category: "Conectores de borde",
    color: "#b8668d",
    bomName: "Edge5_LFlipped",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 5,
    maxPanels: 5,
  },
  "edge-7": {
    id: "edge-7",
    name: "Edge7_Corner",
    short: "7 esquinas",
    category: "Conectores de borde",
    color: "#a85b80",
    bomName: "Edge7_Corner",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 6,
    maxPanels: 8,
  },
  "connector-360": {
    id: "connector-360",
    name: "360 Connector",
    short: "360",
    category: "Conectores especiales",
    color: "#8f7bb6",
    bomName: "360 Connector",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 2,
    maxPanels: 8,
    note: "Conector versátil del pack para uniones de base y ángulos no estándar.",
  },
  "skadis-h": {
    id: "skadis-h",
    name: "Placa Skadis horizontal",
    short: "Skadis · horizontal",
    category: "Conectores Skadis",
    color: "#72b8ac",
    bomName: "Placa Skadis horizontal",
    systems: ["skadis"],
    minPanels: 2,
    maxPanels: 2,
  },
  "skadis-v": {
    id: "skadis-v",
    name: "Placa Skadis vertical",
    short: "Skadis · vertical",
    category: "Conectores Skadis",
    color: "#72b8ac",
    bomName: "Placa Skadis vertical",
    systems: ["skadis"],
    minPanels: 2,
    maxPanels: 2,
  },
  "skadis-x": {
    id: "skadis-x",
    name: "Placa Skadis X",
    short: "Skadis · X",
    category: "Conectores Skadis",
    color: "#5aa89b",
    bomName: "Placa Skadis X",
    systems: ["skadis"],
    minPanels: 4,
    maxPanels: 4,
  },
  "skadis-z": {
    id: "skadis-z",
    name: "Placa Skadis Z",
    short: "Skadis · Z",
    category: "Conectores Skadis",
    color: "#5aa89b",
    bomName: "Placa Skadis Z",
    systems: ["skadis"],
    minPanels: 3,
    maxPanels: 3,
  },
  dovetail: {
    id: "dovetail",
    name: "Cola de milano integrada",
    short: "Dovetail",
    category: "Uniones integradas",
    color: "#c9a87c",
    bomName: "Unión de cola de milano (integrada)",
    systems: ["dovetail"],
    minPanels: 2,
    maxPanels: 8,
    integrated: true,
    note: "La unión forma parte del panel; no necesita una pieza extra.",
  },
  "wire-grid": {
    id: "wire-grid",
    name: "Conector de rejilla",
    short: "Rejilla",
    category: "Conectores de rejilla",
    color: "#8eb7d6",
    bomName: "Conector de rejilla",
    systems: ["wire"],
    minPanels: 2,
    maxPanels: 8,
  },
  "organizer-slot": {
    id: "organizer-slot",
    name: "Ranura de organizador",
    short: "Ranura",
    category: "Organizador",
    color: "#b98ac9",
    bomName: "Ranura de organizador (integrada)",
    systems: ["dovetail", "wire"],
    minPanels: 2,
    maxPanels: 2,
    integrated: true,
    note: "La balda se desliza en la ranura del organizador; no necesita una pieza extra.",
  },
  "awning-foot": {
    id: "awning-foot",
    name: "Montaje en conector de esquina",
    short: "Montaje de toldo",
    category: "Toldo",
    color: "#d9789b",
    bomName: "Montaje de toldo (integrado)",
    systems: ["edge", "dovetail", "skadis", "wire"],
    minPanels: 2,
    maxPanels: 2,
    integrated: true,
    note: "La pata del toldo se inserta en el conector de esquina existente del panel; el toldo no incluye conector.",
  },
};

export const CONNECTOR_ORDER: ConnectorType[] = [
  "edge-2-flat",
  "edge-2-corner",
  "edge-2-30",
  "edge-2-45",
  "edge-3-flat",
  "edge-3-L",
  "edge-3-L-flipped",
  "edge-3-T",
  "edge-3-corner",
  "edge-4-flat",
  "edge-4-L",
  "edge-4-L-flipped",
  "edge-4-corner",
  "edge-5-corner",
  "edge-5-L",
  "edge-5-L-flipped",
  "edge-7",
  "connector-360",
  "skadis-h",
  "skadis-v",
  "skadis-z",
  "skadis-x",
  "dovetail",
  "wire-grid",
  "organizer-slot",
  "awning-foot",
];

export const CATEGORY_LABELS: Record<string, string> = {
  paneles: "Paneles",
  expositores: "Expositores",
  estantes: "Estantes",
  accesorios: "Accesorios y toldo",
  grupos: "Grupos rápidos",
};

export const PALETTE = ["#f3c7d4", "#f7d9e4", "#cfe8e2", "#d9dee3", "#e8c9a8", "#d9c2e8", "#f4a7bb", "#c9a87c"];

export { TABLE };
