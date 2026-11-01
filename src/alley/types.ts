export type AlleyCategory = "paneles" | "expositores" | "estantes" | "accesorios" | "grupos";

export type AlleySystem = "edge" | "skadis" | "dovetail" | "wire" | "mount";

export type ConnectorType =
  | "edge-2-corner"
  | "edge-2-flat"
  | "edge-2-30"
  | "edge-2-45"
  | "edge-3-corner"
  | "edge-3-flat"
  | "edge-3-L"
  | "edge-3-T"
  | "edge-4-corner"
  | "edge-4-flat"
  | "edge-4-L"
  | "edge-5-corner"
  | "edge-5-L"
  | "edge-7"
  | "skadis-h"
  | "skadis-v"
  | "skadis-x"
  | "skadis-z"
  | "dovetail"
  | "wire-grid"
  | "organizer-slot"
  | "awning-foot";

export type Vec3 = [number, number, number];

export type AlleyViewName = "iso" | "front" | "back" | "left" | "right" | "top";

export type AlleyProjection = "perspective" | "isometric";

export interface AlleyPortDef {
  id: string;
  label: string;
  system: AlleySystem;
  pos: Vec3;
  normal: Vec3;
}

export interface BomLine {
  name: string;
  qty: number;
  category: string;
  note?: string;
}

export interface AlleyCatalogItem {
  type: string;
  name: string;
  subtitle: string;
  category: Exclude<AlleyCategory, "grupos">;
  dims: { w: number; d: number; h: number };
  color: string;
  icon: string;
  ports: AlleyPortDef[];
  bom: BomLine[];
  defaultBase: "table" | "floor";
  description: string;
  mountable?: boolean;
  /** Horizontal shelves use a floor-plane normal for angle-aware joints. */
  horizontal?: boolean;
  tags: string[];
}

export interface AlleyMount {
  panelId: string;
  face: "front" | "back";
  u: number;
  v: number;
}

export interface AlleyItem {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  baseZ: number;
  rotation: number;
  color?: string;
  groupId?: string;
  mount?: AlleyMount;
}

export interface AlleyJointPort {
  itemId: string;
  portId: string;
}

export interface AlleyJoint {
  id: string;
  x: number;
  y: number;
  z: number;
  type: ConnectorType;
  ports: AlleyJointPort[];
  suppressed?: boolean;
  /** A manually chosen connector survives geometry changes. */
  manual?: boolean;
}

export interface AlleyGroup {
  id: string;
  name: string;
}

export interface AlleyTable {
  id: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  x: number;
  y: number;
  rotation: number;
}

export interface AlleyTableSpec {
  name?: string;
  width?: number;
  depth?: number;
  height?: number;
  color?: string;
  x: number;
  y: number;
  rotation?: number;
}

export interface AlleyScene {
  version: 1;
  name: string;
  items: AlleyItem[];
  joints: AlleyJoint[];
  groups: AlleyGroup[];
  /** Primary table kept for older saved scenes and simple layouts. */
  table: AlleyTable;
  /** One or more work tables. The first table mirrors `table`. */
  tables: AlleyTable[];
  grid: number;
}

export interface AlleyGroupItemSpec {
  type: string;
  x: number;
  y: number;
  baseZ: number;
  rotation?: number;
  color?: string;
  mountOnIndex?: number;
  mountFace?: "front" | "back";
  mountU?: number;
  mountV?: number;
}

export interface AlleyGroupPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  items: AlleyGroupItemSpec[];
  /** Optional workspace layout. When present, adding the preset also places these tables. */
  tables?: AlleyTableSpec[];
}

export interface ConnectorDef {
  id: ConnectorType;
  name: string;
  short: string;
  category: string;
  color: string;
  bomName: string;
  systems: AlleySystem[];
  minPanels: number;
  maxPanels: number;
  integrated?: boolean;
  note?: string;
}

export interface PortRef {
  itemId: string;
  portId: string;
}

export interface WorldPort extends PortRef {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  system: AlleySystem;
  label: string;
}

export interface AlleySelection {
  type: "item" | "items" | "joint";
  ids: string[];
}
