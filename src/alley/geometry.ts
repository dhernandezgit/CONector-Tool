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

export function defaultConnectorType(scene: AlleyScene, refs: Array<PortRef>): ConnectorType {
  const items = itemsForPorts(scene, refs);
  if (items.length < 2) return "edge-2-flat";
  const ports = refs
    .map((ref) => {
      const item = items.find((candidate) => candidate.id === ref.itemId);
      return item ? portWorld(item, ref.portId) : null;
    })
    .filter((port): port is WorldPort => Boolean(port));
  const systems = uniqueSystems(ports);
  const count = items.length;
  const hasAwning = items.some((item) => item.type.startsWith("awning"));
  let preferred: ConnectorType;
  if (hasAwning) {
    preferred = "awning-foot";
  } else if (items.some((item) => item.type === "organizer")) {
    preferred = "organizer-slot";
  } else if (systems.size === 1 && systems.has("wire")) {
    preferred = "wire-grid";
  } else if (systems.size === 1 && systems.has("skadis")) {
    if (count >= 4) preferred = "skadis-x";
    else if (count === 3) preferred = "skadis-z";
    else {
      const zs = items.map((item) => item.baseZ);
      preferred = Math.max(...zs) - Math.min(...zs) > 2 ? "skadis-v" : "skadis-h";
    }
  } else if (systems.size === 1 && systems.has("dovetail") && items.every((item) => planeAngle(items[0], item) < 12)) {
    preferred = "dovetail";
  } else if (count === 2) {
    const angle = planeAngle(items[0], items[1]);
    if (angle < 15) preferred = "edge-2-flat";
    else if (angle >= 25 && angle <= 35) preferred = "edge-2-30";
    else if (angle >= 40 && angle <= 50) preferred = "edge-2-45";
    else preferred = "edge-2-corner";
  } else if (count === 3) {
    const parallelPair =
      planeAngle(items[0], items[1]) < 15 || planeAngle(items[0], items[2]) < 15 || planeAngle(items[1], items[2]) < 15;
    preferred = items.every((item) => planeAngle(items[0], item) < 15)
      ? "edge-3-flat"
      : parallelPair
        ? "edge-3-T"
        : "edge-3-L";
  } else if (count === 4) {
    const angles = items.map((item) => planeAngle(items[0], item));
    preferred = items.every((item) => planeAngle(items[0], item) < 15)
      ? "edge-4-flat"
      : angles.every((angle) => angle < 15 || angle > 75)
        ? "edge-4-corner"
        : "edge-4-L";
  } else if (count === 5) {
    preferred = "edge-5-corner";
  } else {
    preferred = "edge-7";
  }
  const preview: AlleyJoint = { id: "preview", x: 0, y: 0, z: 0, type: preferred, ports: refs };
  if (connectorAllowed(scene, preview, preferred)) return preferred;
  return allowedConnectorTypes(scene, preview)[0] || "edge-2-flat";
}

/**
 * Connector choice is a recommendation, not a gate. Any connector with the
 * right panel count can be used; the editor automatically falls back to a
 * valid type when the geometry changes.
 */
export function connectorAllowed(scene: AlleyScene, joint: AlleyJoint, type: ConnectorType): boolean {
  const def = CONNECTORS[type];
  if (!def) return false;
  const items = itemsForPorts(scene, joint.ports);
  if (type === "awning-foot" && !items.some((item) => item.type.startsWith("awning"))) return false;
  if (type === "organizer-slot" && !items.some((item) => item.type === "organizer")) return false;
  return items.length >= def.minPanels && items.length <= def.maxPanels;
}

export function allowedConnectorTypes(scene: AlleyScene, joint: AlleyJoint): ConnectorType[] {
  const items = itemsForPorts(scene, joint.ports);
  const count = items.length;
  const systems = new Set(
    joint.ports
      .map((ref) => {
        const item = scene.items.find((candidate) => candidate.id === ref.itemId);
        return item ? portWorld(item, ref.portId)?.system : undefined;
      })
      .filter((system): system is AlleySystem => Boolean(system)),
  );
  const angle = count >= 2 ? planeAngle(items[0], items[1]) : 90;
  const hasAwning = items.some((item) => item.type.startsWith("awning"));
  const preferred: ConnectorType[] = [];
  if (hasAwning) preferred.push("awning-foot");
  if (items.some((item) => item.type === "organizer")) preferred.push("organizer-slot");
  if (systems.size === 1 && systems.has("wire")) preferred.push("wire-grid");
  if (systems.size === 1 && systems.has("skadis")) {
    if (count >= 4) preferred.push("skadis-x");
    else if (count === 3) preferred.push("skadis-z");
    else preferred.push("skadis-h", "skadis-v");
  }
  if (systems.size === 1 && systems.has("dovetail") && angle < 15) preferred.push("dovetail");
  if (count === 2) {
    if (angle < 15) preferred.push("edge-2-flat");
    else if (angle >= 25 && angle <= 35) preferred.push("edge-2-30");
    else if (angle >= 40 && angle <= 50) preferred.push("edge-2-45");
    else preferred.push("edge-2-corner");
  } else if (count === 3) {
    preferred.push("edge-3-flat", "edge-3-L", "edge-3-T", "edge-3-corner");
  } else if (count === 4) {
    preferred.push("edge-4-flat", "edge-4-L", "edge-4-corner");
  } else if (count === 5) {
    preferred.push("edge-5-corner", "edge-5-L");
  } else if (count >= 6) {
    preferred.push("edge-7");
  }
  const all = (Object.values(CONNECTORS) as Array<{ id: ConnectorType }>).map((connector) => connector.id);
  return Array.from(new Set([...preferred, ...all])).filter((type) => connectorAllowed(scene, joint, type));
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
