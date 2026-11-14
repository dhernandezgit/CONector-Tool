import type { ConnectorSettings, DeepPartial, Preset } from "../types";
import { deepMerge } from "../lib/utils";
import { DEFAULT_CONNECTOR } from "./presets";

type Patch = DeepPartial<ConnectorSettings>;

const pink = "#e98da6";
const sand = "#d8a47f";
const sage = "#78b7a4";

function edge(
  id: string,
  name: string,
  description: string,
  target: [number, number, number],
  patch: Patch,
  group: string,
  connections: string,
  icon = "edge",
  accent = pink,
): Preset {
  return {
    id,
    name,
    description: `${description} Envolvente de referencia: ${target[0]} × ${target[1]} × ${target[2]} mm.`,
    category: "Edge",
    group,
    connections,
    target: { width: target[0], height: target[1], depth: target[2] },
    icon,
    accent,
    patch: { ...patch, family: "edge" },
  };
}

function spool(
  id: string,
  name: string,
  description: string,
  target: [number, number, number],
  patch: Patch,
  group: string,
  connections: string,
  icon = "corner",
  accent = pink,
): Preset {
  return {
    id,
    name,
    description: `${description} Envolvente de referencia: ${target[0]} × ${target[1]} × ${target[2]} mm.`,
    category: "Conectores",
    group,
    connections,
    target: { width: target[0], height: target[1], depth: target[2] },
    icon,
    accent,
    patch,
  };
}

const nodeBase: Patch = {
  family: "node",
  body_size: 37,
  body_height: 26,
  body_style: "full",
  joint_preset: "custom",
  horizontal_ports: [0, 90, 180, 270],
  vertical_ports: [],
  arm_width: 10,
  belt_height: 6,
  wire_diameter: 4,
  clearance: 0.25,
  grip_wall: 1.8,
  mouth_width: 3.2,
  body_color: pink,
  decor: { ...DEFAULT_CONNECTOR.decor, enabled: false },
};

const edgeBase: Patch = {
  family: "edge",
  body_size: 8,
  body_height: 26,
  body_style: "auto",
  edge_spacing: 18,
  edge_length: 14.5,
  edge_width: 8,
  edge_foot: 0,
  wire_diameter: 4,
  clearance: 0.25,
  grip_wall: 1.75,
  mouth_width: 3.2,
  body_color: pink,
  decor: { ...DEFAULT_CONNECTOR.decor, enabled: false },
};

const legBase: Patch = {
  family: "leg",
  body_size: 37,
  body_height: 26,
  body_style: "full",
  joint_preset: "corner90",
  horizontal_ports: [0, 90],
  vertical_ports: [],
  leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 40, angle: 0, foot: 24, sole: 3 },
  body_color: sand,
  leg_mode: "connector",
  leg_length: 48,
  decor: { ...DEFAULT_CONNECTOR.decor, enabled: false },
};

export const CONNECTOR_PRESETS: Preset[] = [
  edge("edge1", "Edge1", "Clip de borde de una vía.", [8, 18.5, 26], { ...edgeBase, edge_length: 10.5, horizontal_ports: [0] }, "Edge · 1 conexión", "1", "edge", pink),
  edge("edge1-boot", "Edge1_Boot", "Clip de borde con pie largo tipo bota.", [8, 24.25, 26], { ...edgeBase, edge_length: 16.25, horizontal_ports: [0] }, "Edge · 1 conexión", "1", "edge", sand),
  edge("edge1-paw", "Edge1_Paw", "Clip de borde con remate de pata.", [8, 21.08, 26.6], { ...edgeBase, edge_length: 13.08, body_height: 26.6, edge_foot: 0.6, horizontal_ports: [0] }, "Edge · 1 conexión", "1", "edge", "#b884c8"),

  edge("edge2-corner", "Edge2_Corner", "Dos canales de borde en esquina a 90°.", [22.5, 22.5, 26], { ...edgeBase, horizontal_ports: [0, 90] }, "Edge · 2 conexiones", "2", "corner", pink),
  edge("edge2-flat", "Edge2_Flat", "Dos canales de borde alineados.", [8, 37, 26], { ...edgeBase, horizontal_ports: [0, 180] }, "Edge · 2 conexiones", "2", "flat", "#d9789b"),

  edge("edge3-corner", "Edge3_Corner", "Tres canales en esquina 3D.", [22.5, 22.5, 26], { ...edgeBase, horizontal_ports: [0, 90], vertical_ports: [0] }, "Edge · 3 conexiones", "3", "corner", "#c86f96"),
  edge("edge3-flat", "Edge3_Flat", "Tres canales planos con labio inferior.", [31.48, 36.99, 30.51], { ...edgeBase, body_height: 28, edge_foot: 2.5, edge_length: 14.5, horizontal_ports: [0, 180, 90] }, "Edge · 3 conexiones", "3", "flat", "#d28a6f"),
  edge("edge3-l", "Edge3_L", "Tres canales en L plana.", [37, 22.49, 26], { ...edgeBase, horizontal_ports: [0, 180, 90] }, "Edge · 3 conexiones", "3", "tee", "#c86f96"),
  edge("edge3-l-flipped", "Edge3_LFlipped", "Tres canales en L espejada.", [37, 22.49, 26], { ...edgeBase, horizontal_ports: [0, 90, 270] }, "Edge · 3 conexiones", "3", "tee", "#c86f96"),
  edge("edge3-t", "Edge3_T", "Tres canales en T plana.", [37, 22.5, 26], { ...edgeBase, horizontal_ports: [0, 180, 90] }, "Edge · 3 conexiones", "3", "tee", "#c86f96"),

  edge("edge4-corner", "Edge4_Corner", "Cuatro canales en esquina.", [37, 22.5, 26], { ...edgeBase, horizontal_ports: [0, 180, 90] }, "Edge · 4 conexiones", "4", "cross", "#b46691"),
  edge("edge4-flat", "Edge4_Flat", "Cuatro canales planos con labio.", [36.99, 31.48, 30.57], { ...edgeBase, body_height: 28, edge_foot: 2.5, horizontal_ports: [0, 180, 90, 270] }, "Edge · 4 conexiones", "4", "cross", "#b46691"),
  edge("edge4-l", "Edge4_L", "Cuatro canales en L.", [37, 22.5, 26], { ...edgeBase, horizontal_ports: [0, 180, 90] }, "Edge · 4 conexiones", "4", "tee", "#b46691"),
  edge("edge4-l-flipped", "Edge4_LFlipped", "Cuatro canales en L espejada.", [37, 22.5, 26], { ...edgeBase, horizontal_ports: [0, 90, 270] }, "Edge · 4 conexiones", "4", "tee", "#b46691"),

  edge("edge5-corner", "Edge5_Corner", "Cinco canales en esquina.", [37, 22.5, 26], { ...edgeBase, horizontal_ports: [0, 180, 90], vertical_ports: [0, 180] }, "Edge · 5 conexiones", "5", "cross", "#9d5a82"),
  edge("edge5-l", "Edge5_L", "Cinco canales en L.", [37, 36.99, 26], { ...edgeBase, horizontal_ports: [0, 90, 180, 270] }, "Edge · 5 conexiones", "5", "cross", "#9d5a82"),
  edge("edge5-l-flipped", "Edge5_LFlipped", "Cinco canales en L espejada.", [37, 36.99, 26], { ...edgeBase, horizontal_ports: [0, 90, 180, 270] }, "Edge · 5 conexiones", "5", "cross", "#9d5a82"),
  edge("edge7-corner", "Edge7_Corner", "Siete canales en esquina completa.", [36.99, 37, 26], { ...edgeBase, horizontal_ports: [0, 90, 180, 270], vertical_ports: [0, 180] }, "Edge · 7 conexiones", "7", "six", "#875073"),

  spool("connector", "Connector", "Nodo de cuatro vías con cuerpo tipo puck.", [37, 37, 26], { ...nodeBase }, "Nodos · 4 vías", "4", "ring", pink),
  spool("connector-peg", "Connector_Peg", "Nodo de cuatro vías con clavija de 2,5 mm.", [37, 37, 28.5], { ...nodeBase, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 2.5 } }, "Nodos · 4 vías", "4", "peg", "#cf7d97"),
  spool("connector-peg-5mm", "Connector_Peg_5mm", "Nodo de cuatro vías con clavija de 5 mm.", [37, 37, 33.8], { ...nodeBase, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 7.8 } }, "Nodos · 4 vías", "4", "peg", "#cf7d97"),
  spool("connector-360", "360 Connector", "Nodo circular de altura extendida y puertos radiales.", [37, 37, 44], { ...nodeBase, body_height: 44, vertical_ports: [45, 135, 225, 315] }, "Nodos · 360°", "360°", "ring", sage),
  spool("connector-flat-peg", "ConnectorFlat_Peg", "Placa plana con clavija central.", [37, 31.48, 30.48], { family: "flat", flat_width: 37, flat_depth: 31.5, flat_height: 8, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 22.48 }, body_color: sage, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Nodos planos", "1", "flat", sage),
  spool("connector-flat-peg-5mm", "ConnectorFlat_Peg_5mm", "Placa plana con clavija de 5 mm.", [37, 31.48, 30.48], { family: "flat", flat_width: 37, flat_depth: 31.5, flat_height: 8, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 22.48 }, body_color: sage, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Nodos planos", "1", "flat", sage),

  spool("angled30", "Angled30", "Dos canales con apertura de 30°.", [37, 37, 38.96], { family: "angle", angle: 30, body_size: 37, body_height: 38.96, body_style: "full", horizontal_ports: [0, 30], vertical_ports: [], arm_width: 10, body_color: sand, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Angulados", "2 · 30°", "angle", sand),
  spool("angled30-l", "Angled30_L", "Media pieza imprimible del Angled30.", [37, 34.56, 34.57], { family: "angle", angle: 30, body_size: 37, body_height: 34.57, horizontal_ports: [0, 30], vertical_ports: [], body_color: sand, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" }, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Angulados", "2 · 30°", "split", sand),
  spool("angled30-r", "Angled30_R", "Media pieza imprimible del Angled30, espejada.", [37, 34.56, 34.57], { family: "angle", angle: 30, body_size: 37, body_height: 34.57, horizontal_ports: [0, 30], vertical_ports: [], body_color: sand, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" }, template_mirror: true, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Angulados", "2 · 30°", "split", sand),
  spool("angled45", "Angled45", "Dos canales con apertura de 45°.", [37, 37, 44.96], { family: "angle", angle: 45, body_size: 37, body_height: 44.96, body_style: "full", horizontal_ports: [0, 45], vertical_ports: [], arm_width: 10, body_color: sand, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Angulados", "2 · 45°", "angle", sand),
  spool("angled45-l", "Angled45_L", "Media pieza imprimible del Angled45.", [37, 34.56, 34.57], { family: "angle", angle: 45, body_size: 37, body_height: 34.57, horizontal_ports: [0, 45], vertical_ports: [], body_color: sand, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" }, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Angulados", "2 · 45°", "split", sand),
  spool("angled45-r", "Angled45_R", "Media pieza imprimible del Angled45, espejada.", [37, 34.56, 34.57], { family: "angle", angle: 45, body_size: 37, body_height: 34.57, horizontal_ports: [0, 45], vertical_ports: [], body_color: sand, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" }, template_mirror: true, decor: { ...DEFAULT_CONNECTOR.decor, enabled: false } }, "Angulados", "2 · 45°", "split", sand),

  spool("leg-connector", "Leg Connector", "Pata vertical de soporte.", [37, 66.5, 26], { ...legBase, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 40, angle: 0, foot: 24, sole: 3 } }, "Patas", "1 pata", "leg", sage),
  spool("leg-connector-peg", "Leg Connector_Peg", "Pata vertical con clavija de 2,5 mm.", [37, 66.5, 28.5], { ...legBase, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 40, angle: 0, foot: 24, sole: 3 }, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 2.5 } }, "Patas", "1 pata", "leg", sage),
  spool("leg-connector-peg-5mm", "Leg Connector_Peg_5mm", "Pata vertical con clavija de 5 mm.", [37, 66.5, 33.8], { ...legBase, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 40, angle: 0, foot: 24, sole: 3 }, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 7.8 } }, "Patas", "1 pata", "leg", sage),
  spool("leg30-connector", "Leg30 Connector", "Pata angulada a 30°.", [37, 81.51, 26], { ...legBase, leg_length: 63, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 50, angle: 30, foot: 24, sole: 3 } }, "Patas", "1 pata · 30°", "leg", sage),
  spool("leg30-connector-peg", "Leg30 Connector_Peg", "Pata a 30° con clavija de 2,5 mm.", [37, 81.51, 28.5], { ...legBase, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 50, angle: 30, foot: 24, sole: 3 }, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 2.5 } }, "Patas", "1 pata · 30°", "leg", sage),
  spool("leg30-connector-peg-5mm", "Leg30 Connector_Peg_5mm", "Pata a 30° con clavija de 5 mm.", [37, 81.51, 33.8], { ...legBase, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 50, angle: 30, foot: 24, sole: 3 }, special: { ...DEFAULT_CONNECTOR.special, peg: true, peg_diameter: 5, peg_length: 7.8 } }, "Patas", "1 pata · 30°", "leg", sage),
  spool("leg30-s", "Leg30 S", "Pata corta a 30°.", [37, 61.67, 15.46], { ...legBase, body_height: 15.46, leg_length: 43.17, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 30, angle: 30, foot: 20, sole: 3 } }, "Patas", "1 pata · 30°", "leg", sage),
  spool("leg30-s-l", "Leg30 S_L", "Media pata corta a 30°, izquierda.", [18.52, 61.6, 15.45], { ...legBase, body_height: 15.46, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 30, angle: 30, foot: 20, sole: 3 }, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" } }, "Patas", "1 pata · 30°", "split", sage),
  spool("leg30-s-r", "Leg30 S_R", "Media pata corta a 30°, derecha.", [18.52, 61.6, 15.45], { ...legBase, body_height: 15.46, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 30, angle: 30, foot: 20, sole: 3 }, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" }, template_mirror: true }, "Patas", "1 pata · 30°", "split", sage),
  spool("leg45-s", "Leg45 S", "Pata corta a 45°.", [37, 102.5, 18.56], { ...legBase, body_height: 18.56, leg_length: 84, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 40, angle: 45, foot: 20, sole: 3 } }, "Patas", "1 pata · 45°", "leg", sage),
  spool("leg45-s-l", "Leg45 S_L", "Media pata a 45°, izquierda.", [18.52, 102.43, 18.53], { ...legBase, body_height: 18.56, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 40, angle: 45, foot: 20, sole: 3 }, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" } }, "Patas", "1 pata · 45°", "split", sage),
  spool("leg45-s-r", "Leg45 S_R", "Media pata a 45°, derecha.", [18.52, 102.43, 18.53], { ...legBase, body_height: 18.56, leg: { ...DEFAULT_CONNECTOR.leg, enabled: true, height: 40, angle: 45, foot: 20, sole: 3 }, split: { ...DEFAULT_CONNECTOR.split, enabled: true, axis: "z" }, template_mirror: true }, "Patas", "1 pata · 45°", "split", sage),

  {
    id: "peg-cutout",
    name: "Peg_Cutout",
    description: "Cupón de calibración de clavija de 6 × 6 × 2,5 mm.",
    category: "Calibración",
    group: "Calibración",
    connections: "0",
    target: { width: 5.99, height: 5.99, depth: 2.5 },
    icon: "ruler",
    accent: "#e6b64b",
    patch: {
      family: "calibration",
      calibration_mode: "peg_cutout",
      body_size: 6,
      body_height: 2.5,
      special: { ...DEFAULT_CONNECTOR.special, peg_diameter: 5 },
      decor: { ...DEFAULT_CONNECTOR.decor, enabled: false },
    },
  },
];

export const CONNECTOR_GROUPS = [
  "Edge · 1 conexión",
  "Edge · 2 conexiones",
  "Edge · 3 conexiones",
  "Edge · 4 conexiones",
  "Edge · 5 conexiones",
  "Edge · 7 conexiones",
  "Nodos · 4 vías",
  "Nodos · 360°",
  "Nodos planos",
  "Angulados",
  "Patas",
  "Calibración",
];

export function presetSettings(preset: Preset): ConnectorSettings {
  return deepMerge(DEFAULT_CONNECTOR, preset.patch);
}
