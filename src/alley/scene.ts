import { CATALOG_BY_TYPE, CONNECTORS, GROUPS_BY_ID } from "./catalog";
import {
  catalogFor,
  computeJoints,
  defaultConnectorType,
  itemAabb,
  itemDims,
  rotateLocal,
  sceneTables,
  tableAabb,
  workspaceAabb,
} from "./geometry";
import type {
  AlleyGroup,
  AlleyGroupPreset,
  AlleyItem,
  AlleyJoint,
  AlleyScene,
  AlleySelection,
  AlleyTable,
  AlleyTableSpec,
  BomLine,
  ConnectorType,
  Vec3,
} from "./types";
import { clamp, uid } from "../lib/utils";

export const ALLEY_STORAGE_KEY = "conector-alley-scene-v1";
export const ALLEY_FILE_FORMAT = "conector-artist-alley";
export const ALLEY_FILE_VERSION = 2;

const DEFAULT_TABLE = { width: 2200, depth: 900, height: 750, color: "#f0d9c8" };

export function makeTable(overrides: Partial<AlleyTable> = {}, fallback?: AlleyTable): AlleyTable {
  const colorCandidate = String(overrides.color || fallback?.color || DEFAULT_TABLE.color);
  const heightCandidate = Number(overrides.height ?? fallback?.height ?? DEFAULT_TABLE.height);
  return {
    id: overrides.id || uid("table"),
    name: overrides.name || "Mesa principal",
    width: clamp(Number(overrides.width ?? fallback?.width ?? DEFAULT_TABLE.width) || DEFAULT_TABLE.width, 600, 5000),
    depth: clamp(Number(overrides.depth ?? fallback?.depth ?? DEFAULT_TABLE.depth) || DEFAULT_TABLE.depth, 400, 2500),
    height: clamp(Number.isFinite(heightCandidate) ? heightCandidate : DEFAULT_TABLE.height, 0, 1200),
    color: /^#[0-9a-f]{6}$/i.test(colorCandidate) ? colorCandidate : DEFAULT_TABLE.color,
    x: Number(overrides.x ?? fallback?.x ?? 0) || 0,
    y: Number(overrides.y ?? fallback?.y ?? 0) || 0,
    rotation: normalizeAngle(overrides.rotation ?? fallback?.rotation ?? 0),
    locked: Boolean(overrides.locked ?? fallback?.locked ?? false),
  };
}

function defaultTable(): AlleyTable {
  return makeTable({ id: "table-main", name: "Mesa principal" });
}

export function primaryTable(scene: AlleyScene): AlleyTable {
  return sceneTables(scene)[0] || defaultTable();
}

export function emptyScene(): AlleyScene {
  const table = defaultTable();
  return {
    version: 1,
    name: "Mi puesto Artist Alley",
    items: [],
    joints: [],
    groups: [],
    table,
    tables: [table],
    grid: 50,
  };
}

export function normalizeAngle(value: number): number {
  const angle = Number(value) || 0;
  return ((angle % 360) + 360) % 360;
}

function syncTables(scene: AlleyScene): AlleyScene {
  const tables = scene.tables?.length ? scene.tables : [scene.table || defaultTable()];
  const table = tables[0];
  if (scene.tables?.length === tables.length && scene.table === table) return scene;
  return { ...scene, tables, table };
}

function duplicateKey(item: AlleyItem): string {
  return [
    item.type,
    Math.round(item.x / 2),
    Math.round(item.y / 2),
    Math.round(item.baseZ / 2),
    Math.round(normalizeAngle(item.rotation) / 2),
  ].join("|");
}

/** Recompute derived positions and structural joints. */
export function commitScene(scene: AlleyScene, previousJoints: AlleyJoint[] = scene.joints): AlleyScene {
  let next = syncTables(scene);
  next = syncMountedItems(next);
  next = mergeDuplicateItems(next);
  next = syncMountedItems(next);
  const joints = computeJoints(next, previousJoints);
  return { ...next, table: next.tables[0], joints };
}

export function syncMountedItems(scene: AlleyScene): AlleyScene {
  let changed = false;
  const items = scene.items.map((item) => {
    if (!item.mount) return item;
    const panel = scene.items.find((candidate) => candidate.id === item.mount!.panelId);
    if (!panel) {
      changed = true;
      return {
        ...item,
        mount: undefined,
        baseZ: primaryTable(scene).height,
        rotation: 0,
      };
    }
    const panelDims = itemDims(panel);
    const dims = itemDims(item);
    const faceSign = item.mount.face === "front" ? -1 : 1;
    const localX = (item.mount.u - 0.5) * panelDims.w;
    const localY = faceSign * (panelDims.d / 2 + dims.d / 2 + 1);
    const localZ = item.mount.v * panelDims.h - dims.h / 2;
    const rotated = rotateLocal(panel, [localX, localY, localZ]);
    const x = panel.x + rotated[0];
    const y = panel.y + rotated[1];
    const baseZ = panel.baseZ + rotated[2];
    const rotation = normalizeAngle(panel.rotation + (item.mount.face === "back" ? 180 : 0));
    if (
      Math.abs(x - item.x) > 0.01 ||
      Math.abs(y - item.y) > 0.01 ||
      Math.abs(baseZ - item.baseZ) > 0.01 ||
      Math.abs(rotation - item.rotation) > 0.01
    ) {
      changed = true;
      return { ...item, x, y, baseZ, rotation };
    }
    return item;
  });
  return changed ? { ...scene, items } : scene;
}

export function mergeDuplicateItems(scene: AlleyScene): AlleyScene {
  const kept = new Map<string, AlleyItem>();
  const remap = new Map<string, string>();
  const replacements = new Map<string, AlleyItem>();
  const items: AlleyItem[] = [];
  for (const item of scene.items) {
    const key = duplicateKey(item);
    const existing = kept.get(key);
    if (existing) {
      remap.set(item.id, existing.id);
      if (!existing.groupId && item.groupId) {
        const merged = { ...existing, groupId: item.groupId };
        kept.set(key, merged);
        replacements.set(existing.id, merged);
      }
      continue;
    }
    kept.set(key, item);
    items.push(item);
  }
  if (!remap.size) return scene;
  const nextItems = items.map((item) => {
    const replacement = replacements.get(item.id) || item;
    return replacement.mount && remap.has(replacement.mount.panelId)
      ? { ...replacement, mount: { ...replacement.mount, panelId: remap.get(replacement.mount.panelId)! } }
      : replacement;
  });
  const groups = scene.groups.filter((group) => nextItems.some((item) => item.groupId === group.id));
  return { ...scene, items: nextItems, groups };
}

export function normalizeScene(raw: unknown): AlleyScene {
  if (!raw || typeof raw !== "object") return starterScene();
  const value = raw as Partial<AlleyScene>;
  const legacyTable = makeTable({
    ...(value.table || {}),
    id: value.table?.id || "table-main",
    name: value.table?.name || "Mesa principal",
  });
  const rawTables = Array.isArray(value.tables) && value.tables.length ? value.tables : [legacyTable];
  const tables = rawTables.map((entry, index) =>
    makeTable(
      {
        ...entry,
        id: entry.id || (index === 0 ? "table-main" : `table-${index + 1}`),
        name: entry.name || (index === 0 ? "Mesa principal" : `Mesa ${index + 1}`),
      },
      legacyTable,
    ),
  );
  const table = tables[0];
  const items: AlleyItem[] = Array.isArray(value.items)
    ? value.items
        .filter((item) => item && typeof item.id === "string" && CATALOG_BY_TYPE[item.type])
        .map((item) => ({
          id: String(item.id),
          type: String(item.type),
          name: String(item.name || CATALOG_BY_TYPE[item.type].name),
          x: Number(item.x) || 0,
          y: Number(item.y) || 0,
          baseZ: Math.max(0, Number(item.baseZ) || 0),
          rotation: normalizeAngle(Number(item.rotation) || 0),
          color: /^#[0-9a-f]{6}$/i.test(String(item.color)) ? String(item.color) : undefined,
          groupId: typeof item.groupId === "string" ? item.groupId : undefined,
          mount:
            item.mount && typeof item.mount.panelId === "string"
              ? {
                  panelId: item.mount.panelId,
                  face: item.mount.face === "back" ? "back" : "front",
                  u: clamp(Number(item.mount.u) || 0.5, 0.05, 0.95),
                  v: clamp(Number(item.mount.v) || 0.5, 0.05, 0.95),
                }
              : undefined,
        }))
    : [];
  const groups = Array.isArray(value.groups)
    ? value.groups
        .filter((group) => group && typeof group.id === "string")
        .map((group) => ({
          id: String(group.id),
          name: String(group.name || "Grupo"),
          parentId: typeof group.parentId === "string" ? group.parentId : undefined,
        }))
    : [];
  const groupIds = new Set(groups.map((group) => group.id));
  for (const group of groups) {
    if (group.parentId && !groupIds.has(group.parentId)) group.parentId = undefined;
  }
  // Keep manually chosen connector types and suppressed joints across reloads.
  // Geometry is still recomputed from ports, so stale positions cannot survive.
  const previousJoints: AlleyJoint[] = Array.isArray(value.joints)
    ? value.joints
        .filter(
          (joint) =>
            joint &&
            typeof joint.id === "string" &&
            typeof joint.type === "string" &&
            Array.isArray(joint.ports) &&
            joint.ports.length >= 2,
        )
        .map((joint) => ({
          id: String(joint.id),
          x: Number(joint.x) || 0,
          y: Number(joint.y) || 0,
          z: Number(joint.z) || 0,
          type: joint.type as ConnectorType,
          ports: joint.ports
            .filter((port) => port && typeof port.itemId === "string" && typeof port.portId === "string")
            .map((port) => ({ itemId: String(port.itemId), portId: String(port.portId) })),
          suppressed: Boolean(joint.suppressed),
          manual: Boolean(joint.manual),
        }))
        .filter((joint) => joint.ports.length >= 2)
    : [];
  const scene: AlleyScene = {
    version: 1,
    name: String(value.name || "Mi puesto Artist Alley"),
    items,
    joints: [],
    groups,
    table,
    tables,
    grid: clamp(Number(value.grid) || 50, 10, 200),
  };
  return commitScene(scene, previousJoints);
}

/** Detect the original starter and the intermediate tower so a refresh shows the corrected default. */
export function isLegacyStarterScene(scene: AlleyScene): boolean {
  const counts = scene.items.reduce<Record<string, number>>((result, item) => {
    result[item.type] = (result[item.type] || 0) + 1;
    return result;
  }, {});
  const originalStarter =
    scene.items.length === 10 &&
    scene.items.every((item) => item.type === "slatwall30") &&
    scene.tables.length === 1 &&
    scene.groups.length === 1;
  const intermediateTower =
    scene.items.length === 38 &&
    counts.wire30 === 28 &&
    counts.wireshelf30 === 8 &&
    counts.organizer === 2 &&
    scene.items.filter((item) => item.type === "organizer").every((item) => Boolean(item.mount)) &&
    scene.tables.length === 1 &&
    scene.groups.length === 1;
  const previousTower =
    scene.items.length === 44 &&
    counts.wire30 === 28 &&
    counts.wireshelf30 === 12 &&
    counts.organizer === 2 &&
    counts.awning30 === 2 &&
    scene.tables.length === 1 &&
    scene.groups.length === 1;
  const previousOrganizerDefault =
    scene.items.length === 54 &&
    counts.wire30 === 28 &&
    counts.wireshelf30 === 12 &&
    counts.organizer === 2 &&
    counts.awning30 === 6 &&
    counts.basebox40 === 6 &&
    scene.tables.length === 1 &&
    scene.groups.length === 5;
  return originalStarter || intermediateTower || previousTower || previousOrganizerDefault;
}

export function loadScene(): AlleyScene {
  try {
    const raw = localStorage.getItem(ALLEY_STORAGE_KEY);
    if (!raw) return starterScene();
    const scene = normalizeScene(JSON.parse(raw));
    return isLegacyStarterScene(scene) ? starterScene() : scene;
  } catch {
    return starterScene();
  }
}

export function saveScene(scene: AlleyScene): void {
  try {
    localStorage.setItem(ALLEY_STORAGE_KEY, JSON.stringify(scene));
  } catch {
    /* storage can be disabled */
  }
}

export function sceneToJson(scene: AlleyScene, projectName?: string): string {
  return JSON.stringify(
    {
      format: ALLEY_FILE_FORMAT,
      version: ALLEY_FILE_VERSION,
      app: "CONector Tool",
      appVersion: "0.1.0",
      savedAt: new Date().toISOString(),
      scene: { ...scene, name: projectName?.trim() || scene.name },
    },
    null,
    2,
  );
}

export function sceneFromJson(text: string): AlleyScene {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("El archivo no tiene una escena válida.");
  }
  const value = parsed as { format?: string; scene?: unknown };
  if (value.format && value.format !== ALLEY_FILE_FORMAT) {
    throw new Error("El archivo no es un proyecto de CONector Artist Alley.");
  }
  const sceneData = value.scene && typeof value.scene === "object" ? value.scene : parsed;
  return normalizeScene(sceneData);
}

export function sceneFileName(name: string): string {
  const base = (name || "puesto-artist-alley")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "puesto-artist-alley"}.artist-alley.json`;
}

function pointInAabb(x: number, y: number, box: { minX: number; maxX: number; minY: number; maxY: number }, pad = 0) {
  return x >= box.minX - pad && x <= box.maxX + pad && y >= box.minY - pad && y <= box.maxY + pad;
}

function overlapsExisting(scene: AlleyScene, box: { minX: number; maxX: number; minY: number; maxY: number }, pad = 20) {
  return scene.items.some((item) => {
    const other = itemAabb(item);
    return !(box.maxX + pad < other.minX || box.minX - pad > other.maxX || box.maxY + pad < other.minY || box.minY - pad > other.maxY);
  });
}

function findFreeSpot(scene: AlleyScene, type: string, rotation = 0): { x: number; y: number } {
  const dims = CATALOG_BY_TYPE[type]?.dims || { w: 200, d: 200, h: 200 };
  const angle = (rotation * Math.PI) / 180;
  const halfX = (Math.abs(Math.cos(angle)) * dims.w + Math.abs(Math.sin(angle)) * dims.d) / 2;
  const halfY = (Math.abs(Math.sin(angle)) * dims.w + Math.abs(Math.cos(angle)) * dims.d) / 2;
  const tableBoxes = sceneTables(scene).map(tableAabb);
  const workspace = workspaceAabb(scene);
  const candidates: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  const stepX = Math.max(120, dims.w + 40);
  const stepY = Math.max(120, dims.d + 40);
  for (let ring = 1; ring <= 6; ring += 1) {
    for (let ix = -ring; ix <= ring; ix += 1) {
      for (let iy = -ring; iy <= ring; iy += 1) {
        if (Math.abs(ix) !== ring && Math.abs(iy) !== ring) continue;
        candidates.push({ x: ix * stepX, y: iy * stepY });
      }
    }
  }
  for (const candidate of candidates) {
    if (candidate.x - halfX < workspace.minX || candidate.x + halfX > workspace.maxX) continue;
    if (candidate.y - halfY < workspace.minY || candidate.y + halfY > workspace.maxY) continue;
    const fitsTable = tableBoxes.some(
      (box) =>
        box.minX <= candidate.x - halfX &&
        box.maxX >= candidate.x + halfX &&
        box.minY <= candidate.y - halfY &&
        box.maxY >= candidate.y + halfY,
    );
    if (!fitsTable) continue;
    const box = {
      minX: candidate.x - halfX,
      maxX: candidate.x + halfX,
      minY: candidate.y - halfY,
      maxY: candidate.y + halfY,
    };
    if (!overlapsExisting(scene, box)) return candidate;
  }
  return { x: 0, y: 0 };
}

function findGroupAnchor(scene: AlleyScene, preset: AlleyGroupPreset): { x: number; y: number } {
  if (!scene.items.length) return { x: 0, y: 0 };
  const boxes = preset.items
    .filter((spec) => spec.mountOnIndex === undefined)
    .map((spec) => {
      const dims = CATALOG_BY_TYPE[spec.type]?.dims || { w: 100, d: 100, h: 100 };
      const angle = ((spec.rotation || 0) * Math.PI) / 180;
      const halfX = (Math.abs(Math.cos(angle)) * dims.w + Math.abs(Math.sin(angle)) * dims.d) / 2;
      const halfY = (Math.abs(Math.sin(angle)) * dims.w + Math.abs(Math.cos(angle)) * dims.d) / 2;
      return {
        minX: spec.x - halfX,
        maxX: spec.x + halfX,
        minY: spec.y - halfY,
        maxY: spec.y + halfY,
      };
    });
  if (!boxes.length) return { x: 0, y: 0 };
  const minX = Math.min(...boxes.map((box) => box.minX));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  const width = maxX - minX;
  const depth = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const workspace = workspaceAabb(scene);
  const candidates: Array<{ x: number; y: number }> = [];
  for (let ring = 0; ring <= 5; ring += 1) {
    for (let ix = -ring; ix <= ring; ix += 1) {
      for (let iy = -ring; iy <= ring; iy += 1) {
        if (ring > 0 && Math.abs(ix) !== ring && Math.abs(iy) !== ring) continue;
        candidates.push({ x: ix * (width + 120), y: iy * (depth + 120) });
      }
    }
  }
  const fits = (x: number, y: number) => {
    if (x - width / 2 < workspace.minX || x + width / 2 > workspace.maxX) return false;
    if (y - depth / 2 < workspace.minY || y + depth / 2 > workspace.maxY) return false;
    return !overlapsExisting(
      scene,
      { minX: x - width / 2, maxX: x + width / 2, minY: y - depth / 2, maxY: y + depth / 2 },
      35,
    );
  };
  for (const candidate of candidates) {
    if (fits(candidate.x, candidate.y)) return { x: candidate.x - centerX, y: candidate.y - centerY };
  }
  // The coarse ring grid can miss narrow free strips in a busy scene. Search a
  // finer grid before giving up so a second copy never lands on the first one.
  const step = 100;
  for (let y = workspace.minY + depth / 2; y <= workspace.maxY - depth / 2; y += step) {
    for (let x = workspace.minX + width / 2; x <= workspace.maxX - width / 2; x += step) {
      if (fits(x, y)) return { x: x - centerX, y: y - centerY };
    }
  }
  // If the table is genuinely full, place the group just outside the workspace
  // instead of stacking it on top of an existing assembly and silently merging.
  const fallbackX = workspace.maxX + width / 2 + 100;
  return { x: fallbackX - centerX, y: -centerY };
}

export interface AddResult {
  scene: AlleyScene;
  itemId: string;
  created: boolean;
}

export function addCatalogItem(
  scene: AlleyScene,
  type: string,
  options: {
    panelId?: string;
    x?: number;
    y?: number;
    baseZ?: number;
    rotation?: number;
    mountU?: number;
    mountV?: number;
  } = {},
): AddResult {
  const catalog = CATALOG_BY_TYPE[type];
  if (!catalog) return { scene, itemId: "", created: false };
  const spot = options.x !== undefined && options.y !== undefined ? { x: options.x, y: options.y } : findFreeSpot(scene, type);
  const requestedPanel = options.panelId ? scene.items.find((candidate) => candidate.id === options.panelId) : undefined;
  const mountPanel = catalog.mountable
    ? requestedPanel ||
      scene.items.find(
        (candidate) => catalogFor(candidate).ports.length > 0 && catalogFor(candidate).category === "paneles",
      )
    : undefined;
  const awningPanel =
    type.startsWith("awning") && requestedPanel && catalogFor(requestedPanel).category === "paneles"
      ? requestedPanel
      : undefined;
  const hostPanel = awningPanel || mountPanel;
  const item: AlleyItem = {
    id: uid("item"),
    type,
    name: catalog.name,
    x: awningPanel ? awningPanel.x : spot.x,
    y: awningPanel ? awningPanel.y : spot.y,
    baseZ: awningPanel
      ? awningPanel.baseZ + catalogFor(awningPanel).dims.h - catalog.dims.h
      : options.baseZ ?? primaryTable(scene).height,
    rotation: awningPanel ? awningPanel.rotation : options.rotation ?? 0,
    color: catalog.color,
    groupId: hostPanel?.groupId,
  };
  if (catalog.mountable && mountPanel) {
    item.mount = {
      panelId: mountPanel.id,
      face: "front",
      u: clamp(options.mountU ?? 0.5, 0.08, 0.92),
      v: clamp(options.mountV ?? 0.5, 0.08, 0.92),
    };
  }
  const next = commitScene({ ...scene, items: [...scene.items, item] });
  const key = duplicateKey(item);
  const survivor = next.items.find((candidate) => duplicateKey(candidate) === key);
  return { scene: next, itemId: survivor?.id || item.id, created: Boolean(next.items.find((candidate) => candidate.id === item.id)) };
}

export function addGroup(
  scene: AlleyScene,
  presetId: string,
  options: { anchor?: { x: number; y: number }; name?: string; parentId?: string } = {},
): { scene: AlleyScene; groupId: string; created: number } {
  const preset = GROUPS_BY_ID[presetId];
  if (!preset) return { scene, groupId: "", created: 0 };
  const hasTables = Boolean(preset.tables?.length);
  const anchor = options.anchor || (hasTables ? { x: 0, y: 0 } : findGroupAnchor(scene, preset));
  let baseScene = scene;
  if (hasTables) {
    const fallback = primaryTable(scene);
    const tables = preset.tables!.map((spec, index) =>
      makeTable(
        {
          ...spec,
          id: uid("table"),
          name: spec.name || (index === 0 ? "Mesa principal" : `Mesa ${index + 1}`),
          x: anchor.x + spec.x,
          y: anchor.y + spec.y,
          height: spec.height ?? fallback.height,
          color: spec.color || fallback.color,
        },
        fallback,
      ),
    );
    baseScene = { ...scene, tables, table: tables[0] };
  }
  const groupId = uid("group");
  const groupName = options.name || preset.name;
  const created: AlleyItem[] = [];
  const specs: Array<{ item: AlleyItem; mountOnIndex?: number; face: "front" | "back"; u: number; v: number }> = [];
  for (const spec of preset.items) {
    const catalog = CATALOG_BY_TYPE[spec.type];
    if (!catalog) continue;
    const item: AlleyItem = {
      id: uid("item"),
      type: spec.type,
      name: catalog.name,
      x: anchor.x + spec.x,
      y: anchor.y + spec.y,
      baseZ: primaryTable(baseScene).height + spec.baseZ,
      rotation: normalizeAngle(spec.rotation || 0),
      color: spec.color || catalog.color,
      groupId,
    };
    created.push(item);
    specs.push({
      item,
      mountOnIndex: spec.mountOnIndex,
      face: spec.mountFace || "front",
      u: spec.mountU ?? 0.5,
      v: spec.mountV ?? 0.5,
    });
  }
  for (const spec of specs) {
    if (spec.mountOnIndex === undefined) continue;
    const target = created[spec.mountOnIndex];
    if (!target) continue;
    spec.item.mount = { panelId: target.id, face: spec.face, u: spec.u, v: spec.v };
  }
  const next = commitScene({
    ...baseScene,
    items: [...baseScene.items, ...created],
    groups: [...baseScene.groups, { id: groupId, name: groupName, parentId: options.parentId }],
  });
  const count = next.items.filter((item) => item.groupId === groupId).length;
  return { scene: next, groupId: itemsInGroup(next, groupId).length ? groupId : "", created: count };
}

export function addEmptyGroup(scene: AlleyScene, name: string, parentId?: string): { scene: AlleyScene; groupId: string } {
  const groupId = uid("group");
  return {
    scene: { ...scene, groups: [...scene.groups, { id: groupId, name, parentId }] },
    groupId,
  };
}

export function moveItems(scene: AlleyScene, ids: string[], dx: number, dy: number, dz = 0): AlleyScene {
  const set = new Set(ids);
  const items = scene.items.map((item) =>
    set.has(item.id) && !item.mount
      ? { ...item, x: item.x + dx, y: item.y + dy, baseZ: Math.max(0, item.baseZ + dz) }
      : item,
  );
  return commitScene({ ...scene, items });
}

/**
 * Recolor a selection. Items that belong to a group are treated as one unit,
 * so recoloring a tower also recolors its shelves, organizers and panels.
 */
export function recolorItems(scene: AlleyScene, ids: string[], color: string, includeGroups = true): AlleyScene {
  if (!ids.length || !/^#[0-9a-f]{6}$/i.test(color)) return scene;
  const targets = new Set(ids);
  if (includeGroups) {
    const groupIds = new Set(
      scene.items.filter((item) => targets.has(item.id) && item.groupId).map((item) => item.groupId!),
    );
    for (const item of scene.items) {
      if (item.groupId && groupIds.has(item.groupId)) targets.add(item.id);
    }
  }
  const items = scene.items.map((item) => (targets.has(item.id) ? { ...item, color } : item));
  return commitScene({ ...scene, items });
}

/** Move a table and the pieces standing on it. Locked tables stay fixed. */
export function moveTable(scene: AlleyScene, tableId: string, dx: number, dy: number): AlleyScene {
  if (!dx && !dy) return scene;
  const tables = sceneTables(scene);
  const table = tables.find((candidate) => candidate.id === tableId);
  if (!table || table.locked) return scene;
  const box = tableAabb(table);
  const onTable = new Set(
    scene.items
      .filter(
        (item) =>
          item.x >= box.minX - 20 &&
          item.x <= box.maxX + 20 &&
          item.y >= box.minY - 20 &&
          item.y <= box.maxY + 20,
      )
      .map((item) => item.id),
  );
  const items = scene.items.map((item) =>
    onTable.has(item.id) && !item.mount ? { ...item, x: item.x + dx, y: item.y + dy } : item,
  );
  const nextTables = tables.map((candidate) =>
    candidate.id === tableId ? { ...candidate, x: candidate.x + dx, y: candidate.y + dy } : candidate,
  );
  return commitScene({ ...scene, tables: nextTables, table: nextTables[0], items });
}

export function updateTable(scene: AlleyScene, tableId: string, patch: Partial<AlleyTable>): AlleyScene {
  const tables = sceneTables(scene);
  const target = tables.find((table) => table.id === tableId);
  if (!target) return scene;
  const nextHeight = patch.height !== undefined ? clamp(Number(patch.height) || 0, 0, 1200) : target.height;
  const dz = nextHeight - target.height;
  const nextTables = tables.map((table) => {
    if (table.id === tableId) {
      return makeTable({ ...table, ...patch, height: nextHeight }, table);
    }
    return dz ? { ...table, height: nextHeight } : table;
  });
  const items = dz
    ? scene.items.map((item) => ({ ...item, baseZ: Math.max(0, item.baseZ + dz) }))
    : scene.items;
  return commitScene({ ...scene, tables: nextTables, table: nextTables[0], items });
}

export function addTable(scene: AlleyScene, layout: "straight" | "l" = "straight"): { scene: AlleyScene; tableId: string } {
  const tables = sceneTables(scene);
  const base = tables[tables.length - 1] || primaryTable(scene);
  const angle = (base.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const offset = layout === "l"
    ? { x: base.width / 2 + base.depth / 2, y: base.width / 2 - base.depth / 2 }
    : { x: base.width / 2 + base.width / 2, y: 0 };
  const rotated = {
    x: offset.x * cos - offset.y * sin,
    y: offset.x * sin + offset.y * cos,
  };
  const nextTable = makeTable(
    {
      ...base,
      id: uid("table"),
      name: `Mesa ${tables.length + 1}`,
      x: base.x + rotated.x,
      y: base.y + rotated.y,
      rotation: base.rotation + (layout === "l" ? 90 : 0),
      locked: false,
    },
    base,
  );
  const nextTables = [...tables, nextTable];
  return {
    scene: commitScene({ ...scene, tables: nextTables, table: nextTables[0] }),
    tableId: nextTable.id,
  };
}

export function removeTable(scene: AlleyScene, tableId: string): AlleyScene {
  const tables = sceneTables(scene);
  if (tables.length <= 1) return scene;
  const nextTables = tables.filter((table) => table.id !== tableId);
  if (!nextTables.length) return scene;
  return commitScene({ ...scene, tables: nextTables, table: nextTables[0] });
}

export function moveMountedItem(scene: AlleyScene, itemId: string, u: number, v: number): AlleyScene {
  const item = scene.items.find((candidate) => candidate.id === itemId);
  if (!item?.mount) return scene;
  const items = scene.items.map((candidate) =>
    candidate.id === itemId && candidate.mount
      ? { ...candidate, mount: { ...candidate.mount, u: clamp(u, 0.05, 0.95), v: clamp(v, 0.05, 0.95) } }
      : candidate,
  );
  return commitScene({ ...scene, items });
}

export function rotateItems(scene: AlleyScene, ids: string[], delta: number): AlleyScene {
  const selected = new Set(ids);
  const unitByItem = new Map<string, string>();

  // Fully selected parent groups rotate as one unit around the parent pivot.
  const fullySelected = fullySelectedGroups(scene, selected);
  for (const group of topSelectedGroups(scene, fullySelected)) {
    for (const item of itemsInGroup(scene, group.id)) unitByItem.set(item.id, group.id);
  }

  // A partial selection inside a leaf group still rotates that leaf as a unit.
  for (const item of scene.items) {
    if (!selected.has(item.id) || unitByItem.has(item.id) || !item.groupId) continue;
    for (const grouped of scene.items) {
      if (grouped.groupId === item.groupId) unitByItem.set(grouped.id, item.groupId);
    }
  }

  const units = new Map<string, AlleyItem[]>();
  for (const item of scene.items) {
    const unit = unitByItem.get(item.id);
    if (!unit) continue;
    units.set(unit, [...(units.get(unit) || []), item]);
  }
  const pivots = new Map<string, { x: number; y: number }>();
  for (const [unit, unitItems] of units) {
    pivots.set(unit, {
      x: unitItems.reduce((sum, item) => sum + item.x, 0) / unitItems.length,
      y: unitItems.reduce((sum, item) => sum + item.y, 0) / unitItems.length,
    });
  }

  const angle = (delta * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const items = scene.items.map((item) => {
    const unit = unitByItem.get(item.id);
    if (unit) {
      const pivot = pivots.get(unit)!;
      const dx = item.x - pivot.x;
      const dy = item.y - pivot.y;
      return {
        ...item,
        x: pivot.x + dx * cos - dy * sin,
        y: pivot.y + dx * sin + dy * cos,
        rotation: normalizeAngle(item.rotation + delta),
      };
    }
    if (selected.has(item.id) && !item.mount) {
      return { ...item, rotation: normalizeAngle(item.rotation + delta) };
    }
    return item;
  });
  return commitScene({ ...scene, items });
}

/** Swap a panel for an equivalent panel of exactly the same size. */
export function replacePanelType(scene: AlleyScene, itemId: string, type: string): AlleyScene {
  const target = CATALOG_BY_TYPE[type];
  const item = scene.items.find((candidate) => candidate.id === itemId);
  if (!target || !item || target.category !== "paneles") return scene;
  const current = catalogFor(item);
  if (!current || current.category !== "paneles") return scene;
  if (current.dims.w !== target.dims.w || current.dims.h !== target.dims.h) {
    return scene;
  }
  if (item.type === type) return scene;
  const items = scene.items.map((candidate) =>
    candidate.id === itemId
      ? { ...candidate, type, name: target.name, color: candidate.color || target.color }
      : candidate,
  );
  return commitScene({ ...scene, items });
}

export function deleteItems(scene: AlleyScene, ids: string[]): AlleyScene {
  const removed = new Set(ids);
  if (!removed.size) return scene;
  const removedPanels = new Map(
    scene.items.filter((item) => removed.has(item.id)).map((item) => [item.id, item] as const),
  );
  const items = scene.items
    .filter((item) => !removed.has(item.id))
    .map((item) => {
      if (!item.mount || !removed.has(item.mount.panelId)) return item;
      const panel = removedPanels.get(item.mount.panelId);
      return {
        ...item,
        mount: undefined,
        x: panel?.x ?? item.x,
        y: panel?.y ?? item.y,
        baseZ: primaryTable(scene).height,
        rotation: 0,
      };
    });
  return commitScene(removeEmptyGroups({ ...scene, items }));
}

export function deleteGroup(scene: AlleyScene, groupId: string): AlleyScene {
  return deleteItems(
    scene,
    itemsInGroup(scene, groupId).map((item) => item.id),
  );
}

export interface AlleyClipboard {
  items: AlleyItem[];
  groups: AlleyGroup[];
}

export function copySelection(scene: AlleyScene, ids: string[]): AlleyClipboard | null {
  const expanded = expandSelectionWithGroups(scene, ids);
  const selected = scene.items.filter((item) => expanded.includes(item.id));
  if (!selected.length) return null;
  const groupIds = new Set(selected.map((item) => item.groupId).filter(Boolean) as string[]);
  const byId = new Map(scene.groups.map((group) => [group.id, group]));
  for (const groupId of Array.from(groupIds)) {
    let parentId = byId.get(groupId)?.parentId;
    while (parentId && !groupIds.has(parentId)) {
      groupIds.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
  return {
    items: selected.map((item) => ({
      ...item,
      mount: item.mount ? { ...item.mount } : undefined,
    })),
    groups: scene.groups.filter((group) => groupIds.has(group.id)).map((group) => ({ ...group })),
  };
}

export function pasteSelection(
  scene: AlleyScene,
  clipboard: AlleyClipboard,
  offset = 60,
): { scene: AlleyScene; ids: string[] } {
  if (!clipboard.items.length) return { scene, ids: [] };
  const newGroupIds = new Map<string, string>();
  for (const group of clipboard.groups) newGroupIds.set(group.id, uid("group"));
  const remap = new Map<string, string>();
  const clones: AlleyItem[] = clipboard.items.map((source) => {
    const clone: AlleyItem = {
      ...source,
      id: uid("item"),
      name: `${source.name} copia`,
      x: source.x + offset,
      y: source.y + offset,
      groupId: source.groupId ? newGroupIds.get(source.groupId) : undefined,
      mount: source.mount ? { ...source.mount } : undefined,
    };
    remap.set(source.id, clone.id);
    return clone;
  });
  for (const clone of clones) {
    if (!clone.mount) continue;
    const mapped = remap.get(clone.mount.panelId);
    if (mapped) {
      clone.mount = { ...clone.mount, panelId: mapped };
    } else {
      clone.mount = undefined;
      clone.baseZ = primaryTable(scene).height;
      clone.rotation = 0;
    }
  }
  const groups = [
    ...scene.groups,
    ...clipboard.groups.map((group) => ({
      id: newGroupIds.get(group.id)!,
      name: `${group.name} copia`,
      parentId: group.parentId ? newGroupIds.get(group.parentId) : undefined,
    })),
  ];
  const next = commitScene({ ...scene, items: [...scene.items, ...clones], groups });
  return {
    scene: next,
    ids: clones.map((clone) => clone.id).filter((id) => next.items.some((item) => item.id === id)),
  };
}

export function duplicateSelection(scene: AlleyScene, ids: string[]): { scene: AlleyScene; ids: string[] } {
  const clipboard = copySelection(scene, ids);
  if (!clipboard) return { scene, ids: [] };
  return pasteSelection(scene, clipboard, 60);
}

function fullySelectedGroups(scene: AlleyScene, selected: Set<string>): AlleyGroup[] {
  return scene.groups.filter((group) => {
    const items = itemsInGroup(scene, group.id);
    return items.length > 0 && items.every((item) => selected.has(item.id));
  });
}

function topSelectedGroups(scene: AlleyScene, fullySelected: AlleyGroup[]): AlleyGroup[] {
  const selectedGroups = new Set(fullySelected.map((group) => group.id));
  return fullySelected.filter((group) => !group.parentId || !selectedGroups.has(group.parentId));
}

function ancestorChain(scene: AlleyScene, groupId: string | undefined): string[] {
  const chain: string[] = [];
  let current = groupId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = scene.groups.find((group) => group.id === current)?.parentId;
  }
  return chain;
}

/** Deepest group that is an ancestor of every supplied starting group. */
function commonAncestorId(scene: AlleyScene, groupIds: Array<string | undefined>): string | undefined {
  if (!groupIds.length || groupIds.some((groupId) => !groupId)) return undefined;
  const chains = groupIds.map((groupId) => ancestorChain(scene, groupId));
  return chains[0].find((candidate) => chains.every((chain) => chain.includes(candidate)));
}

/**
 * Group the selection one level up. Fully selected groups become child groups
 * instead of being flattened into their pieces.
 */
export function groupSelection(scene: AlleyScene, ids: string[]): { scene: AlleyScene; groupId: string } {
  if (!ids.length) return { scene, groupId: "" };
  const selected = new Set(ids);
  const fullySelected = fullySelectedGroups(scene, selected);
  const topGroups = topSelectedGroups(scene, fullySelected);
  const covered = new Set(topGroups.flatMap((group) => itemsInGroup(scene, group.id).map((item) => item.id)));
  const direct = Array.from(selected).filter((id) => !covered.has(id));
  if (!topGroups.length && direct.length < 2) return { scene, groupId: "" };
  const groupId = uid("group");
  const groupName = `Grupo ${scene.groups.length + 1}`;
  const topIds = new Set(topGroups.map((group) => group.id));
  const parentStarts: Array<string | undefined> = [
    ...topGroups.map((group) => group.parentId),
    ...direct.map((id) => {
      const item = scene.items.find((candidate) => candidate.id === id);
      return item?.groupId ? scene.groups.find((group) => group.id === item.groupId)?.parentId : undefined;
    }),
  ];
  const parentId = commonAncestorId(scene, parentStarts);
  const groups: AlleyGroup[] = [
    ...scene.groups.map((group) => (topIds.has(group.id) ? { ...group, parentId: groupId } : group)),
    { id: groupId, name: groupName, parentId },
  ];
  const directIds = new Set(direct);
  const items = scene.items.map((item) => (directIds.has(item.id) ? { ...item, groupId } : item));
  return { scene: commitScene({ ...scene, items, groups }), groupId };
}

function dissolveGroups(scene: AlleyScene, groupIds: string[]): AlleyScene {
  const remove = new Set(groupIds);
  if (!remove.size) return scene;
  const byId = new Map(scene.groups.map((group) => [group.id, group]));
  const promotedParent = (parentId: string | undefined): string | undefined => {
    let current = parentId;
    const seen = new Set<string>();
    while (current && remove.has(current) && !seen.has(current)) {
      seen.add(current);
      current = byId.get(current)?.parentId;
    }
    return current && byId.has(current) ? current : undefined;
  };
  const items = scene.items.map((item) =>
    item.groupId && remove.has(item.groupId) ? { ...item, groupId: promotedParent(item.groupId) } : item,
  );
  const groups = scene.groups
    .filter((group) => !remove.has(group.id))
    .map((group) =>
      group.parentId && remove.has(group.parentId)
        ? { ...group, parentId: promotedParent(group.parentId) }
        : group,
    );
  return commitScene({ ...scene, items, groups });
}

/** Remove only the selected group level, promoting its pieces and child groups. */
export function ungroupSelection(scene: AlleyScene, ids: string[]): AlleyScene {
  const selected = new Set(ids);
  const fullySelected = fullySelectedGroups(scene, selected);
  return dissolveGroups(scene, topSelectedGroups(scene, fullySelected).map((group) => group.id));
}

export function ungroupGroup(scene: AlleyScene, groupId: string): AlleyScene {
  return dissolveGroups(scene, [groupId]);
}

export function setJointType(scene: AlleyScene, jointId: string, type: ConnectorType): AlleyScene {
  const joints = scene.joints.map((joint) =>
    joint.id === jointId ? { ...joint, type, suppressed: false, manual: true } : joint,
  );
  return { ...scene, joints };
}

/** Return a joint to the connector recommended by its current geometry. */
export function resetJointType(scene: AlleyScene, jointId: string): AlleyScene {
  const joint = scene.joints.find((candidate) => candidate.id === jointId);
  if (!joint) return scene;
  const type = defaultConnectorType(scene, joint.ports);
  const joints = scene.joints.map((candidate) =>
    candidate.id === jointId ? { ...candidate, type, suppressed: false, manual: false } : candidate,
  );
  return { ...scene, joints };
}

export function toggleJointSuppressed(scene: AlleyScene, jointId: string): AlleyScene {
  const joints = scene.joints.map((joint) =>
    joint.id === jointId ? { ...joint, suppressed: !joint.suppressed } : joint,
  );
  return { ...scene, joints };
}

export function mountItem(
  scene: AlleyScene,
  itemId: string,
  panelId: string,
  face: "front" | "back" = "front",
  u = 0.5,
  v = 0.5,
): AlleyScene {
  const panel = scene.items.find((item) => item.id === panelId);
  const item = scene.items.find((candidate) => candidate.id === itemId);
  if (!panel || !item || !catalogFor(item).mountable) return scene;
  const items = scene.items.map((candidate) =>
    candidate.id === itemId
      ? { ...candidate, mount: { panelId, face, u: clamp(u, 0.05, 0.95), v: clamp(v, 0.05, 0.95) } }
      : candidate,
  );
  return commitScene({ ...scene, items });
}

export function unmountItem(scene: AlleyScene, itemId: string): AlleyScene {
  const item = scene.items.find((candidate) => candidate.id === itemId);
  if (!item?.mount) return scene;
  const items = scene.items.map((candidate) =>
    candidate.id === itemId
      ? { ...candidate, mount: undefined, baseZ: primaryTable(scene).height, rotation: 0 }
      : candidate,
  );
  return commitScene({ ...scene, items });
}

export function selectedPanelForMount(scene: AlleyScene, selection: AlleySelection | null): AlleyItem | undefined {
  if (!selection || selection.type === "joint") return undefined;
  return scene.items.find(
    (item) => selection.ids.includes(item.id) && catalogFor(item).category === "paneles",
  );
}

export function expandSelectionWithGroups(scene: AlleyScene, ids: string[]): string[] {
  const selected = new Set(ids);
  const groupIds = new Set(
    scene.items.filter((item) => selected.has(item.id) && item.groupId).map((item) => item.groupId!),
  );
  const result = new Set(ids);
  for (const groupId of groupIds) {
    for (const item of itemsInGroup(scene, groupId)) result.add(item.id);
  }
  return Array.from(result);
}

export interface SceneBom {
  parts: BomLine[];
  integrated: BomLine[];
  totalParts: number;
  totalJoints: number;
}

export function sceneBom(scene: AlleyScene): SceneBom {
  const parts = new Map<string, BomLine>();
  const integrated = new Map<string, BomLine>();
  const add = (map: Map<string, BomLine>, line: BomLine) => {
    const key = `${line.category}|${line.name}|${line.note || ""}`;
    const current = map.get(key);
    if (current) current.qty += line.qty;
    else map.set(key, { ...line });
  };
  for (const item of scene.items) {
    const catalog = catalogFor(item);
    for (const line of catalog.bom) add(parts, { ...line, qty: line.qty });
  }
  for (const joint of scene.joints) {
    if (joint.suppressed) continue;
    const def = CONNECTORS[joint.type];
    if (!def) continue;
    if (joint.type === "awning-foot") continue; // already included in the awning kit
    if (joint.type === "organizer-slot") continue; // the slot is part of the organizer frame
    if (def.integrated) {
      add(integrated, {
        name: def.bomName,
        qty: 1,
        category: "Uniones integradas",
        note: def.note,
      });
    } else {
      add(parts, { name: def.bomName, qty: 1, category: def.category, note: def.note });
    }
  }
  const sortLines = (lines: BomLine[]) =>
    lines.sort((a, b) => a.category.localeCompare(b.category, "es") || a.name.localeCompare(b.name, "es"));
  const partList = sortLines(Array.from(parts.values()));
  const integratedList = sortLines(Array.from(integrated.values()));
  return {
    parts: partList,
    integrated: integratedList,
    totalParts: partList.reduce((sum, line) => sum + line.qty, 0),
    totalJoints: scene.joints.filter((joint) => !joint.suppressed).length,
  };
}

export function bomCsv(bom: SceneBom): string {
  const rows = [
    ["Categoría", "Pieza", "Cantidad", "Nota"],
    ...bom.parts.map((line) => [line.category, line.name, String(line.qty), line.note || ""]),
    ...bom.integrated.map((line) => [line.category, line.name, String(line.qty), line.note || ""]),
  ];
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

export function starterScene(): AlleyScene {
  const base = emptyScene();
  const root = addEmptyGroup(base, "Puesto Artist Alley");
  const towers = addGroup(root.scene, "tower-core", {
    anchor: { x: 0, y: 0 },
    name: "Torres",
    parentId: root.groupId,
  });
  const boxes = addGroup(towers.scene, "tower-base", {
    anchor: { x: 0, y: 0 },
    name: "Base rosa",
    parentId: towers.groupId,
  });
  const awnings = addGroup(boxes.scene, "tower-awnings", {
    anchor: { x: 0, y: 0 },
    name: "Toldos",
    parentId: towers.groupId,
  });
  return { ...awnings.scene, name: "Mi puesto Artist Alley" };
}

export function clearScene(scene: AlleyScene): AlleyScene {
  const tables = sceneTables(scene).map((table) => ({ ...table }));
  return { ...emptyScene(), name: scene.name, table: tables[0], tables, grid: scene.grid };
}

export function groupFor(scene: AlleyScene, groupId: string | undefined) {
  return groupId ? scene.groups.find((group) => group.id === groupId) : undefined;
}

export function childGroups(scene: AlleyScene, groupId: string | undefined): AlleyGroup[] {
  return groupId ? scene.groups.filter((group) => group.parentId === groupId) : [];
}

/** Stable pre-order list of a group and all of its descendant groups. */
export function descendantGroupIds(scene: AlleyScene, groupId: string): string[] {
  if (!scene.groups.some((group) => group.id === groupId)) return [];
  const result: string[] = [];
  const visit = (id: string) => {
    if (result.includes(id)) return;
    result.push(id);
    for (const child of scene.groups.filter((group) => group.parentId === id)) visit(child.id);
  };
  visit(groupId);
  return result;
}

export function groupDepth(scene: AlleyScene, groupId: string): number {
  let depth = 0;
  let current = scene.groups.find((group) => group.id === groupId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = scene.groups.find((group) => group.id === current?.parentId);
    if (current) depth += 1;
  }
  return depth;
}

export function rootGroups(scene: AlleyScene): AlleyGroup[] {
  return scene.groups.filter((group) => !group.parentId || !scene.groups.some((candidate) => candidate.id === group.parentId));
}

/** Parent-first order for the group tree. */
export function orderedGroups(scene: AlleyScene): AlleyGroup[] {
  const result: AlleyGroup[] = [];
  const seen = new Set<string>();
  const visit = (group: AlleyGroup) => {
    if (seen.has(group.id)) return;
    seen.add(group.id);
    result.push(group);
    for (const child of childGroups(scene, group.id)) visit(child);
  };
  for (const group of rootGroups(scene)) visit(group);
  for (const group of scene.groups) visit(group);
  return result;
}

export function itemsInGroup(scene: AlleyScene, groupId: string | undefined): AlleyItem[] {
  if (!groupId) return [];
  const groupIds = new Set(descendantGroupIds(scene, groupId));
  return scene.items.filter((item) => item.groupId && groupIds.has(item.groupId));
}

export function selectionLabel(scene: AlleyScene, selection: AlleySelection | null): string {
  if (!selection) return "Puesto";
  if (selection.type === "joint") {
    const joint = scene.joints.find((candidate) => candidate.id === selection.ids[0]);
    return joint ? CONNECTORS[joint.type]?.short || "Unión" : "Unión";
  }
  if (selection.ids.length > 1) return `${selection.ids.length} piezas`;
  const item = scene.items.find((candidate) => candidate.id === selection.ids[0]);
  return item ? catalogFor(item).name : "Pieza";
}

export function defaultAnchorForNewItem(scene: AlleyScene): Vec3 {
  const spot = findFreeSpot(scene, "slatwall30");
  return [spot.x, spot.y, primaryTable(scene).height];
}

export function countGroupItems(scene: AlleyScene, groupId: string | undefined): number {
  return groupId ? itemsInGroup(scene, groupId).length : 0;
}

export function itemAt(scene: AlleyScene, itemId: string): AlleyItem | undefined {
  return scene.items.find((item) => item.id === itemId);
}

export function removeEmptyGroups(scene: AlleyScene): AlleyScene {
  const keep = new Set<string>();
  const byId = new Map(scene.groups.map((group) => [group.id, group]));
  for (const item of scene.items) {
    let groupId = item.groupId;
    while (groupId && byId.has(groupId) && !keep.has(groupId)) {
      keep.add(groupId);
      groupId = byId.get(groupId)?.parentId;
    }
  }
  const groups = scene.groups
    .filter((group) => keep.has(group.id))
    .map((group) =>
      group.parentId && byId.has(group.parentId) ? group : group.parentId ? { ...group, parentId: undefined } : group,
    );
  return groups.length === scene.groups.length ? scene : { ...scene, groups };
}

// Kept as a named export so tests and future importers can reason about the
// same footprint used by deduplication.
export { duplicateKey, pointInAabb };
