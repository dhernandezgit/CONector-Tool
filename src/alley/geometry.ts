import { CATALOG_BY_TYPE, CONNECTORS } from "./catalog";
import type {
  AlleyCatalogItem,
  AlleyItem,
  AlleyJoint,
  AlleyScene,
  AlleySelection,
  AlleySystem,
  AlleyTable,
  ConnectorType,
  PortRef,
  Vec3,
  WorldPort,
} from "./types";

const DEG = Math.PI / 180;

export function catalogFor(item: AlleyItem): AlleyCatalogItem {
  return (
    CATALOG_BY_TYPE[item.type] ?? {
      type: item.type,
      name: item.type,
      subtitle: "",
      category: "accesorios",
      dims: { w: 100, d: 100, h: 100 },
      color: "#d9c2e8",
      icon: "?",
      ports: [],
      bom: [],
      defaultBase: "table",
      description: "",
      tags: [],
    }
  );
}

export function itemColor(item: AlleyItem): string {
  return item.color || catalogFor(item).color;
}

export function itemDims(item: AlleyItem) {
  return catalogFor(item).dims;
}

export function panelOf(scene: AlleyScene, item: AlleyItem): AlleyItem | undefined {
  if (!item.mount) return undefined;
  return scene.items.find((candidate) => candidate.id === item.mount!.panelId);
}

export function rotateLocal(item: AlleyItem, local: Vec3): Vec3 {
  const angle = item.rotation * DEG;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [local[0] * cos - local[1] * sin, local[0] * sin + local[1] * cos, local[2]];
}

export function rotateNormal(item: AlleyItem, normal: Vec3): Vec3 {
  const angle = item.rotation * DEG;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [normal[0] * cos - normal[1] * sin, normal[0] * sin + normal[1] * cos, normal[2]];
}

export function portWorld(item: AlleyItem, portId: string): WorldPort | null {
  const def = catalogFor(item).ports.find((port) => port.id === portId);
  if (!def) return null;
  const local = rotateLocal(item, def.pos);
  const normal = rotateNormal(item, def.normal);
  return {
    itemId: item.id,
    portId,
    x: item.x + local[0],
    y: item.y + local[1],
    z: item.baseZ + local[2],
    nx: normal[0],
    ny: normal[1],
    nz: normal[2],
    system: def.system,
    label: def.label,
  };
}

export function scenePorts(scene: AlleyScene): WorldPort[] {
  const ports: WorldPort[] = [];
  for (const item of scene.items) {
    for (const port of catalogFor(item).ports) {
      const world = portWorld(item, port.id);
      if (world) ports.push(world);
    }
  }
  return ports;
}

/** Ports are an editing aid: they stay hidden until an item selection exists. */
export function portsVisible(showPorts: boolean, selection: AlleySelection | null): boolean {
  return showPorts && Boolean(selection && selection.type !== "joint");
}

export function planeNormal(item: AlleyItem): Vec3 {
  if (catalogFor(item).horizontal) return [0, 0, 1];
  return rotateNormal(item, [0, 1, 0]);
}

export function planeAngle(a: AlleyItem, b: AlleyItem): number {
  const na = planeNormal(a);
  const nb = planeNormal(b);
  const dot = Math.max(-1, Math.min(1, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]));
  return Math.acos(Math.abs(dot)) / DEG;
}

function uniqueSystems(ports: WorldPort[]): Set<AlleySystem> {
  return new Set(ports.map((port) => port.system));
}

function itemsForPorts(scene: AlleyScene, ports: Array<PortRef>): AlleyItem[] {
  const seen = new Set<string>();
  const result: AlleyItem[] = [];
  for (const ref of ports) {
    if (seen.has(ref.itemId)) continue;
    const item = scene.items.find((candidate) => candidate.id === ref.itemId);
    if (item) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

function normalKey(item: AlleyItem): string {
  const normal = planeNormal(item);
  return normal.map((value) => Math.round(value)).join(",");
}

function samePlaneItems(items: AlleyItem[]): AlleyItem[][] {
  const groups = new Map<string, AlleyItem[]>();
  for (const item of items) {
    const key = normalKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

/**
 * Real connector candidates for a joint. We only expose parts that exist in
 * the pack and can physically serve the current edge count/orientation.
 */
export function connectorCandidates(scene: AlleyScene, joint: AlleyJoint): ConnectorType[] {
  const items = itemsForPorts(scene, joint.ports);
  const count = items.length;
  if (count < 2) return [];
  if (items.some((item) => item.type.startsWith("awning"))) {
    return count === 2 ? ["awning-foot"] : [];
  }
  if (items.some((item) => item.type === "organizer")) {
    return count === 2 ? ["organizer-slot"] : [];
  }
  if (items.some((item) => item.type === "basebox40")) {
    return ["connector-360"];
  }
  const ports = joint.ports
    .map((ref) => {
      const item = items.find((candidate) => candidate.id === ref.itemId);
      return item ? portWorld(item, ref.portId) : null;
    })
    .filter((port): port is WorldPort => Boolean(port));
  const systems = uniqueSystems(ports);
  const allWire = systems.size === 1 && systems.has("wire");
  const allSkadis = systems.size === 1 && systems.has("skadis");
  const allDovetail = systems.size === 1 && systems.has("dovetail");
  const allFlat = items.every((item) => planeAngle(items[0], item) < 15);
  const angle = count >= 2 ? planeAngle(items[0], items[1]) : 90;

  if (allWire) return ["wire-grid"];
  if (allDovetail && allFlat) return ["dovetail"];

  if (count === 2) {
    if (allSkadis && angle < 15) {
      const zs = items.map((item) => item.baseZ);
      return [Math.max(...zs) - Math.min(...zs) > 2 ? "skadis-v" : "skadis-h"];
    }
    if (angle < 15) return ["edge-2-flat"];
    if (angle >= 25 && angle <= 35) return ["edge-2-30"];
    if (angle >= 40 && angle <= 50) return ["edge-2-45"];
    if (angle > 75) return ["edge-2-corner"];
    return ["connector-360"];
  }

  if (allSkadis) {
    if (count === 3) return ["skadis-z"];
    if (count === 4) return ["skadis-x"];
  }

  const parallelGroups = samePlaneItems(items);
  if (count === 3) {
    if (allFlat) return ["edge-3-flat"];
    if (!parallelGroups.length) return ["edge-3-corner"];
    const pair = parallelGroups[0];
    const offsetA = { x: pair[0].x - joint.x, y: pair[0].y - joint.y };
    const offsetB = { x: pair[1].x - joint.x, y: pair[1].y - joint.y };
    const opposite = offsetA.x * offsetB.x + offsetA.y * offsetB.y < 0;
    return opposite ? ["edge-3-T"] : ["edge-3-L", "edge-3-L-flipped"];
  }
  if (count === 4) {
    if (allFlat) return ["edge-4-flat"];
    const perpendicular = items.every((item) => {
      const a = planeAngle(items[0], item);
      return a < 15 || a > 75;
    });
    return perpendicular ? ["edge-4-corner"] : ["edge-4-L", "edge-4-L-flipped"];
  }
  if (count === 5) {
    return parallelGroups.length ? ["edge-5-L", "edge-5-L-flipped"] : ["edge-5-corner"];
  }
  return ["edge-7"];
}

export function defaultConnectorType(scene: AlleyScene, refs: Array<PortRef>): ConnectorType {
  const preview: AlleyJoint = { id: "preview", x: 0, y: 0, z: 0, type: "edge-2-flat", ports: refs };
  return connectorCandidates(scene, preview)[0] || "edge-2-flat";
}

/** A connector can be selected only if it is a real candidate for the joint. */
export function connectorAllowed(scene: AlleyScene, joint: AlleyJoint, type: ConnectorType): boolean {
  return connectorCandidates(scene, joint).includes(type);
}

export function allowedConnectorTypes(scene: AlleyScene, joint: AlleyJoint): ConnectorType[] {
  return connectorCandidates(scene, joint);
}

function portKey(ref: PortRef): string {
  return `${ref.itemId}:${ref.portId}`;
}

function jointOverlap(a: AlleyJoint, b: AlleyJoint): number {
  const keys = new Set(a.ports.map(portKey));
  return b.ports.reduce((total, ref) => total + (keys.has(portKey(ref)) ? 1 : 0), 0);
}

/**
 * Rebuild structural joints from the current item positions.  Joints are
 * derived data: moving or deleting a panel updates its corners without
 * touching the rest of the scene.  Existing ids and connector choices are
 * retained when the same corner is still shared.
 */
export function computeJoints(scene: AlleyScene, previous: AlleyJoint[] = scene.joints): AlleyJoint[] {
  const ports = scenePorts(scene).filter((port) => port.system !== "mount");
  const buckets = new Map<string, WorldPort[]>();
  for (const port of ports) {
    const key = `${Math.round(port.x / 2)}:${Math.round(port.y / 2)}:${Math.round(port.z / 2)}`;
    const list = buckets.get(key) || [];
    list.push(port);
    buckets.set(key, list);
  }
  const used = new Set<string>();
  const next: AlleyJoint[] = [];
  for (const list of buckets.values()) {
    const itemIds = new Set(list.map((port) => port.itemId));
    if (itemIds.size < 2) continue;
    const refs: PortRef[] = list
      .map((port) => ({ itemId: port.itemId, portId: port.portId }))
      .sort((a, b) => portKey(a).localeCompare(portKey(b)));
    const avg = list.reduce(
      (acc, port) => ({ x: acc.x + port.x / list.length, y: acc.y + port.y / list.length, z: acc.z + port.z / list.length }),
      { x: 0, y: 0, z: 0 },
    );
    let match: AlleyJoint | undefined;
    let bestOverlap = 0;
    for (const candidate of previous) {
      if (used.has(candidate.id)) continue;
      const overlap = jointOverlap(candidate, { ...candidate, ports: refs });
      const distance = Math.hypot(candidate.x - avg.x, candidate.y - avg.y, candidate.z - avg.z);
      if (overlap > bestOverlap && distance < 40) {
        bestOverlap = overlap;
        match = candidate;
      }
    }
    const keepManual = Boolean(
      match?.manual && connectorAllowed(scene, { ...match, ports: refs }, match.type),
    );
    const type = keepManual ? match!.type : defaultConnectorType(scene, refs);
    const joint: AlleyJoint = {
      id: match?.id || `joint_${refs.map(portKey).join("_").slice(0, 48)}`,
      x: avg.x,
      y: avg.y,
      z: avg.z,
      type,
      ports: refs,
      suppressed: match?.suppressed,
      manual: keepManual ? true : undefined,
    };
    if (match) used.add(match.id);
    next.push(joint);
  }
  return next;
}

export function jointIsSuppressed(joint: AlleyJoint): boolean {
  return Boolean(joint.suppressed);
}

export function connectedPortKeys(scene: AlleyScene): Set<string> {
  const keys = new Set<string>();
  for (const joint of scene.joints) {
    if (joint.suppressed) continue;
    for (const port of joint.ports) keys.add(portKey(port));
  }
  return keys;
}

export function portCompatible(a: WorldPort, b: WorldPort): boolean {
  if (a.itemId === b.itemId) return false;
  return a.system !== "mount" && b.system !== "mount";
}

export interface SnapCandidate {
  dx: number;
  dy: number;
  dz: number;
  distance: number;
  source: WorldPort;
  target: WorldPort;
}

export function findSnapForMove(
  scene: AlleyScene,
  movedIds: string[],
  delta: Vec3,
  maxDistance = 70,
): SnapCandidate | null {
  const moved = new Set(movedIds);
  const movedPorts: WorldPort[] = [];
  for (const item of scene.items) {
    if (!moved.has(item.id)) continue;
    for (const port of catalogFor(item).ports) {
      const world = portWorld(item, port.id);
      if (world) movedPorts.push({ ...world, x: world.x + delta[0], y: world.y + delta[1], z: world.z + delta[2] });
    }
  }
  const targets = scenePorts(scene).filter((port) => !moved.has(port.itemId) && port.system !== "mount");
  let best: SnapCandidate | null = null;
  for (const source of movedPorts) {
    for (const target of targets) {
      if (!portCompatible(source, target)) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > maxDistance) continue;
      if (!best || distance < best.distance) {
        best = {
          dx: delta[0] + dx,
          dy: delta[1] + dy,
          dz: delta[2] + dz,
          distance,
          source,
          target,
        };
      }
    }
  }
  return best;
}

export function snapPorts(source: WorldPort, target: WorldPort) {
  return {
    dx: target.x - source.x,
    dy: target.y - source.y,
    dz: target.z - source.z,
  };
}

export function itemAabb(item: AlleyItem) {
  const dims = itemDims(item);
  const angle = item.rotation * DEG;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const halfX = (cos * dims.w + sin * dims.d) / 2;
  const halfY = (sin * dims.w + cos * dims.d) / 2;
  return {
    minX: item.x - halfX,
    maxX: item.x + halfX,
    minY: item.y - halfY,
    maxY: item.y + halfY,
    minZ: item.baseZ,
    maxZ: item.baseZ + dims.h,
  };
}

export function tableAabb(table: AlleyTable) {
  const angle = table.rotation * DEG;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const halfX = (cos * table.width + sin * table.depth) / 2;
  const halfY = (sin * table.width + cos * table.depth) / 2;
  return {
    minX: table.x - halfX,
    maxX: table.x + halfX,
    minY: table.y - halfY,
    maxY: table.y + halfY,
    minZ: 0,
    maxZ: table.height,
  };
}

export function sceneTables(scene: AlleyScene): AlleyTable[] {
  return scene.tables?.length ? scene.tables : [scene.table];
}

export function workspaceAabb(scene: AlleyScene) {
  const tables = sceneTables(scene);
  if (!tables.length) {
    return { minX: -600, maxX: 600, minY: -400, maxY: 400, minZ: 0, maxZ: 900 };
  }
  const boxes = tables.map(tableAabb);
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
    minZ: Math.min(...boxes.map((box) => box.minZ)),
    maxZ: Math.max(...boxes.map((box) => box.maxZ)),
  };
}

export function sceneBounds(scene: AlleyScene) {
  const workspace = workspaceAabb(scene);
  if (!scene.items.length) {
    return {
      ...workspace,
      width: workspace.maxX - workspace.minX,
      depth: workspace.maxY - workspace.minY,
      height: workspace.maxZ - workspace.minZ,
    };
  }
  let minX = workspace.minX;
  let maxX = workspace.maxX;
  let minY = workspace.minY;
  let maxY = workspace.maxY;
  let minZ = workspace.minZ;
  let maxZ = workspace.maxZ;
  for (const item of scene.items) {
    const box = itemAabb(item);
    minX = Math.min(minX, box.minX);
    maxX = Math.max(maxX, box.maxX);
    minY = Math.min(minY, box.minY);
    maxY = Math.max(maxY, box.maxY);
    minZ = Math.min(minZ, box.minZ);
    maxZ = Math.max(maxZ, box.maxZ);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxY - minY,
    height: maxZ - minZ,
  };
}

export function selectionItems(scene: AlleyScene, selection: AlleySelection | null): AlleyItem[] {
  if (!selection) return [];
  if (selection.type === "joint") return [];
  return scene.items.filter((item) => selection.ids.includes(item.id));
}

export function jointItems(scene: AlleyScene, joint: AlleyJoint): AlleyItem[] {
  return itemsForPorts(scene, joint.ports);
}

export function selectionJoint(scene: AlleyScene, selection: AlleySelection | null): AlleyJoint | undefined {
  if (!selection || selection.type !== "joint") return undefined;
  return scene.joints.find((joint) => selection.ids.includes(joint.id));
}
