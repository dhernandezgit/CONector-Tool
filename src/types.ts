export type Family = "template" | "node" | "angle" | "leg" | "edge" | "hook" | "plate" | "calibration";
export type PanelType = "wire" | "frame" | "foam";
export type DecorSide = "front" | "back" | "both";
export type MountType = "press" | "magnet" | "screw";
export type SplitAxis = "z" | "x";

export interface ImportedShape {
  name: string;
  outer: [number, number][];
  holes: [number, number][][];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  warnings: string[];
  source_color?: string | null;
  source_kind?: string;
}

export interface ConnectorSettings {
  family: Family;
  name: string;
  template_id: number;
  template_scale_xy: number;
  template_scale_z: number;
  template_mirror: boolean;
  template_rotate: number;
  panel_type: PanelType;
  wire_diameter: number;
  panel_thickness: number;
  clearance: number;
  grip_wall: number;
  grip_length: number;
  mouth_width: number;
  wrap_degrees: number;
  wire_count: number;
  wire_spacing: number;
  joint_preset: string;
  angle: number;
  tilt: number;
  arms: string[];
  body_shape: string;
  body_size: number;
  body_height: number;
  belt_height: number;
  arm_width: number;
  body_chamfer: number;
  body_color: string;
  inner_radius: number;
  body_style: "auto" | "full" | "sector";
  horizontal_ports: number[];
  vertical_ports: number[];
  top_channels: boolean;
  bottom_channels: boolean;
  scallops: boolean;
  scallop_count: number;
  decor: {
    enabled: boolean;
    shape: string;
    custom: ImportedShape | null;
    size: number;
    thickness: number;
    side: DecorSide;
    mount: MountType;
    border: number;
    relief: number;
    color: string;
  };
  leg: {
    enabled: boolean;
    height: number;
    angle: number;
    foot: number;
    sole: number;
  };
  special: {
    table_cut: boolean;
    hook: boolean;
    peg: boolean;
    peg_diameter: number;
    peg_length: number;
    zip_tie: boolean;
    screws: boolean;
  };
  split: {
    enabled: boolean;
    axis: SplitAxis;
    offset: number;
    screw_pads: boolean;
    gap: number;
  };
  print: {
    bed_width: number;
    bed_depth: number;
    material: string;
    nozzle: number;
    layer: number;
    orientation: string;
    diagonal: boolean;
  };
}

export interface BuildPart {
  id: string;
  name: string;
  color: string;
  b64: string;
  print_b64: string;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  print_bounds: { min: [number, number, number]; max: [number, number, number] };
  dimensions: [number, number, number];
  print_dimensions: [number, number, number];
  volume: number;
  triangles: number;
  watertight: boolean;
  overhang: number;
}

export interface PrintCheck {
  level: "info" | "warn" | "error";
  title: string;
  detail: string;
}

export interface BuildResult {
  ok: boolean;
  version: string;
  name: string;
  family: string;
  parts: BuildPart[];
  dimensions: { width: number; height: number; depth: number };
  warnings: string[];
  tips: string[];
  checks: PrintCheck[];
  material_grams: number;
  material: string;
  build_ms: number;
  settings: ConnectorSettings;
}

export interface ShapeAnalysis {
  ok: boolean;
  shape: ImportedShape;
}

export type SimPanelKind = "wire" | "solid" | "skadis" | "foam";

export interface SimPanel {
  id: string;
  name: string;
  kind: SimPanelKind;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
  color: string;
}

export interface SimJoint {
  id: string;
  name: string;
  presetId: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  color: string;
}

export interface SimTable {
  show: boolean;
  width: number;
  depth: number;
  height: number;
  color: string;
}

export interface SimulatorScene {
  panels: SimPanel[];
  joints: SimJoint[];
  table: SimTable;
  grid: number;
}

export interface ConnectorProject {
  version: 1;
  name: string;
  settings: ConnectorSettings;
  scene: SimulatorScene;
  savedAt: string;
  customPresets?: Array<{ id: string; name: string; settings: ConnectorSettings }>;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  category: "Bases exactas" | "Estructura" | "Ángulos" | "Patas" | "Especiales" | "Decorados" | "Herramientas";
  icon: string;
  accent?: string;
  patch: DeepPartial<ConnectorSettings>;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends Array<unknown> ? T[K] : DeepPartial<T[K]>) : T[K];
};

export interface ShapeOption {
  id: string;
  name: string;
  emoji: string;
  color: string;
}
