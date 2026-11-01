import { CATALOG_BY_TYPE, CONNECTORS, GROUPS_BY_ID } from "./catalog";
import { catalogFor, computeJoints, itemAabb, itemDims, rotateLocal } from "./geometry";
import type {
  AlleyGroupPreset,
  AlleyItem,
  AlleyJoint,
  AlleyScene,
  AlleySelection,
  BomLine,
  ConnectorType,
  Vec3,
} from "./types";
import { clamp, uid } from "../lib/utils";

export const ALLEY_STORAGE_KEY = "conector-alley-scene-v1";

const DEFAULT_TABLE = { width: 2200, depth: 900, height: 750, color: "#f0d9c8" };

export function emptyScene(): AlleyScene {
  return {
    version: 1,
    name: "Mi puesto Artist Alley",
    items: [],
    joints: [],
    groups: [],
    table: { ...DEFAULT_TABLE },
    grid: 50,
  };
}

export function normalizeAngle(value: number): number {
  const angle = Number(value) || 0;
  return ((angle % 360) + 360) % 360;
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
  let next = syncMountedItems(scene);
  next = mergeDuplicateItems(next);
  next = syncMountedItems(next);
  const joints = computeJoints(next, previousJoints);
  return { ...next, joints };
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
        baseZ: scene.table.height,
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

function normalizeScene(raw: unknown): AlleyScene {
  if (!raw || typeof raw !== "object") return starterScene();
  const value = raw as Partial<AlleyScene>;
  const table = {
    width: clamp(Number(value.table?.width) || DEFAULT_TABLE.width, 800, 5000),
    depth: clamp(Number(value.table?.depth) || DEFAULT_TABLE.depth, 500, 2500),
    height: clamp(Number(value.table?.height) || DEFAULT_TABLE.height, 0, 1200),
    color: /^#[0-9a-f]{6}$/i.test(String(value.table?.color)) ? String(value.table?.color) : DEFAULT_TABLE.color,
  };
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
        .map((group) => ({ id: String(group.id), name: String(group.name || "Grupo") }))
    : [];
  const scene: AlleyScene = {
    version: 1,
    name: String(value.name || "Mi puesto Artist Alley"),
    items,
    joints: [],
    groups,
    table,
    grid: clamp(Number(value.grid) || 50, 10, 200),
  };
  return commitScene(scene, []);
}

export function loadScene(): AlleyScene {
  try {
    const raw = localStorage.getItem(ALLEY_STORAGE_KEY);
    if (!raw) return starterScene();
    return normalizeScene(JSON.parse(raw));
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
    if (Math.abs(candidate.x) + halfX > scene.table.width / 2) continue;
    if (Math.abs(candidate.y) + halfY > scene.table.depth / 2) continue;
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
  const candidates: Array<{ x: number; y: number }> = [];
  for (let ring = 0; ring <= 5; ring += 1) {
    for (let ix = -ring; ix <= ring; ix += 1) {
      for (let iy = -ring; iy <= ring; iy += 1) {
        if (ring > 0 && Math.abs(ix) !== ring && Math.abs(iy) !== ring) continue;
        candidates.push({ x: ix * (width + 120), y: iy * (depth + 120) });
      }
    }
  }
  for (const candidate of candidates) {
    if (Math.abs(candidate.x) + width / 2 > scene.table.width / 2) continue;
    if (Math.abs(candidate.y) + depth / 2 > scene.table.depth / 2) continue;
    const box = {
      minX: candidate.x - width / 2,
      maxX: candidate.x + width / 2,
      minY: candidate.y - depth / 2,
      maxY: candidate.y + depth / 2,
    };
    if (!overlapsExisting(scene, box, 35)) return { x: candidate.x - centerX, y: candidate.y - centerY };
  }
  return { x: -centerX, y: -centerY };
}

export interface AddResult {
  scene: AlleyScene;
  itemId: string;
  created: boolean;
}

export function addCatalogItem(
  scene: AlleyScene,
  type: string,
  options: { panelId?: string; x?: number; y?: number; mountU?: number; mountV?: number } = {},
): AddResult {
  const catalog = CATALOG_BY_TYPE[type];
  if (!catalog) return { scene, itemId: "", created: false };
  const spot = options.x !== undefined && options.y !== undefined ? { x: options.x, y: options.y } : findFreeSpot(scene, type);
  const item: AlleyItem = {
    id: uid("item"),
    type,
    name: catalog.name,
    x: spot.x,
    y: spot.y,
    baseZ: scene.table.height,
    rotation: 0,
    color: catalog.color,
  };
  if (catalog.mountable) {
    const panel =
      (options.panelId ? scene.items.find((candidate) => candidate.id === options.panelId) : undefined) ||
      scene.items.find((candidate) => catalogFor(candidate).ports.length > 0 && catalogFor(candidate).category === "paneles");
    if (panel) {
      item.mount = {
        panelId: panel.id,
        face: "front",
        u: clamp(options.mountU ?? 0.5, 0.08, 0.92),
        v: clamp(options.mountV ?? 0.5, 0.08, 0.92),
      };
    }
  }
  const next = commitScene({ ...scene, items: [...scene.items, item] });
  const key = duplicateKey(item);
  const survivor = next.items.find((candidate) => duplicateKey(candidate) === key);
  return { scene: next, itemId: survivor?.id || item.id, created: Boolean(next.items.find((candidate) => candidate.id === item.id)) };
}

export function addGroup(
  scene: AlleyScene,
  presetId: string,
  options: { anchor?: { x: number; y: number }; name?: string } = {},
): { scene: AlleyScene; groupId: string; created: number } {
  const preset = GROUPS_BY_ID[presetId];
  if (!preset) return { scene, groupId: "", created: 0 };
  const anchor = options.anchor || findGroupAnchor(scene, preset);
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
      baseZ: scene.table.height + spec.baseZ,
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
    ...scene,
    items: [...scene.items, ...created],
    groups: [...scene.groups, { id: groupId, name: groupName }],
  });
  const count = next.items.filter((item) => item.groupId === groupId).length;
  return { scene: next, groupId: count ? groupId : "", created: count };
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
  const groupIds = new Set(
    scene.items.filter((item) => selected.has(item.id) && item.groupId).map((item) => item.groupId!),
  );
  const pivots = new Map<string, { x: number; y: number }>();
  for (const groupId of groupIds) {
    const groupItems = scene.items.filter((item) => item.groupId === groupId);
    pivots.set(groupId, {
      x: groupItems.reduce((sum, item) => sum + item.x, 0) / groupItems.length,
      y: groupItems.reduce((sum, item) => sum + item.y, 0) / groupItems.length,
    });
  }
  const angle = (delta * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const items = scene.items.map((item) => {
    if (item.groupId && groupIds.has(item.groupId)) {
      const pivot = pivots.get(item.groupId)!;
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
        baseZ: scene.table.height,
        rotation: 0,
      };
    });
  const groups = scene.groups.filter((group) => items.some((item) => item.groupId === group.id));
  return commitScene({ ...scene, items, groups });
}

export function deleteGroup(scene: AlleyScene, groupId: string): AlleyScene {
  return deleteItems(
    scene,
    scene.items.filter((item) => item.groupId === groupId).map((item) => item.id),
  );
}

export function duplicateSelection(scene: AlleyScene, ids: string[]): { scene: AlleyScene; ids: string[] } {
  const selected = scene.items.filter((item) => ids.includes(item.id));
  if (!selected.length) return { scene, ids: [] };
  const groupIds = Array.from(new Set(selected.map((item) => item.groupId).filter(Boolean) as string[]));
  const sourceGroup = new Map<string, AlleyItem[]>();
  for (const groupId of groupIds) sourceGroup.set(groupId, scene.items.filter((item) => item.groupId === groupId));
  const clones: AlleyItem[] = [];
  const remap = new Map<string, string>();
  const newGroupIds = new Map<string, string>();
  for (const groupId of groupIds) {
    newGroupIds.set(groupId, uid("group"));
  }
  const addClone = (source: AlleyItem, groupId?: string) => {
    const clone: AlleyItem = {
      ...source,
      id: uid("item"),
      name: `${source.name} copia`,
      x: source.x + 60,
      y: source.y + 60,
      groupId,
      mount: source.mount ? { ...source.mount } : undefined,
    };
    remap.set(source.id, clone.id);
    clones.push(clone);
  };
  for (const groupId of groupIds) {
    for (const item of sourceGroup.get(groupId) || []) addClone(item, newGroupIds.get(groupId));
  }
  for (const item of selected) {
    if (!item.groupId) addClone(item);
  }
  for (const clone of clones) {
    if (clone.mount) {
      const mapped = remap.get(clone.mount.panelId);
      if (mapped) clone.mount = { ...clone.mount, panelId: mapped };
      else clone.mount = undefined;
    }
  }
  const groups = [
    ...scene.groups,
    ...Array.from(newGroupIds.entries()).map(([oldId, id]) => ({
      id,
      name: `${scene.groups.find((group) => group.id === oldId)?.name || "Grupo"} copia`,
    })),
  ];
  const next = commitScene({ ...scene, items: [...scene.items, ...clones], groups });
  return { scene: next, ids: clones.map((clone) => clone.id).filter((id) => next.items.some((item) => item.id === id)) };
}

export function groupSelection(scene: AlleyScene, ids: string[]): { scene: AlleyScene; groupId: string } {
  if (ids.length < 2) return { scene, groupId: "" };
  const groupId = uid("group");
  const groupName = `Grupo ${scene.groups.length + 1}`;
  const selected = new Set(ids);
  const items = scene.items.map((item) => (selected.has(item.id) ? { ...item, groupId } : item));
  const groups = scene.groups.filter((group) => items.some((item) => item.groupId === group.id));
  const next = commitScene({ ...scene, items, groups: [...groups, { id: groupId, name: groupName }] });
  return { scene: next, groupId };
}

export function ungroupSelection(scene: AlleyScene, ids: string[]): AlleyScene {
  const selected = new Set(ids);
  const items = scene.items.map((item) => (selected.has(item.id) ? { ...item, groupId: undefined } : item));
  const groups = scene.groups.filter((group) => items.some((item) => item.groupId === group.id));
  return commitScene({ ...scene, items, groups });
}

export function setJointType(scene: AlleyScene, jointId: string, type: ConnectorType): AlleyScene {
  const joints = scene.joints.map((joint) => (joint.id === jointId ? { ...joint, type, suppressed: false } : joint));
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
      ? { ...candidate, mount: undefined, baseZ: scene.table.height, rotation: 0 }
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
  const groups = new Set(scene.items.filter((item) => selected.has(item.id) && item.groupId).map((item) => item.groupId!));
  const result = new Set(ids);
  for (const item of scene.items) {
    if (item.groupId && groups.has(item.groupId)) result.add(item.id);
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
  const result = addGroup(base, "starter", { anchor: { x: 0, y: 0 }, name: "Puesto Artist Alley" });
  return { ...result.scene, name: "Mi puesto Artist Alley" };
}

export function clearScene(scene: AlleyScene): AlleyScene {
  return { ...emptyScene(), name: scene.name, table: { ...scene.table }, grid: scene.grid };
}

export function groupFor(scene: AlleyScene, groupId: string | undefined) {
  return groupId ? scene.groups.find((group) => group.id === groupId) : undefined;
}

export function itemsInGroup(scene: AlleyScene, groupId: string | undefined): AlleyItem[] {
  return groupId ? scene.items.filter((item) => item.groupId === groupId) : [];
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
  return [spot.x, spot.y, scene.table.height];
}

export function countGroupItems(scene: AlleyScene, groupId: string | undefined): number {
  return groupId ? scene.items.filter((item) => item.groupId === groupId).length : 0;
}

export function itemAt(scene: AlleyScene, itemId: string): AlleyItem | undefined {
  return scene.items.find((item) => item.id === itemId);
}

export function removeEmptyGroups(scene: AlleyScene): AlleyScene {
  const groups = scene.groups.filter((group) => scene.items.some((item) => item.groupId === group.id));
  return groups.length === scene.groups.length ? scene : { ...scene, groups };
}

// Kept as a named export so tests and future importers can reason about the
// same footprint used by deduplication.
export { duplicateKey, pointInAabb };
