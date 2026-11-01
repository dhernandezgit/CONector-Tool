import { describe, expect, it } from "vitest";
import { CATALOG_BY_TYPE, CONNECTORS, GROUPS_BY_ID } from "./catalog";
import { allowedConnectorTypes, catalogFor, computeJoints, itemAabb, scenePorts } from "./geometry";
import {
  addCatalogItem,
  addGroup,
  addTable,
  bomCsv,
  clearScene,
  copySelection,
  deleteItems,
  duplicateSelection,
  emptyScene,
  expandSelectionWithGroups,
  groupSelection,
  moveItems,
  moveMountedItem,
  pasteSelection,
  removeTable,
  rotateItems,
  sceneBom,
  sceneFileName,
  sceneFromJson,
  sceneToJson,
  setJointType,
  starterScene,
  toggleJointSuppressed,
  ungroupSelection,
  unmountItem,
  updateTable,
} from "./scene";

function countItems(scene: ReturnType<typeof emptyScene>, type: string) {
  return scene.items.filter((item) => item.type === type).length;
}

describe("Artist Alley starter scene", () => {
  it("loads a complete editable stall", () => {
    const scene = starterScene();
    expect(scene.items).toHaveLength(8);
    expect(scene.groups).toHaveLength(1);
    expect(countItems(scene, "slatwall30")).toBe(4);
    expect(countItems(scene, "display4")).toBe(1);
    expect(countItems(scene, "riser3")).toBe(1);
    expect(countItems(scene, "wire30")).toBe(1);
    expect(countItems(scene, "awning30")).toBe(1);
    expect(scene.joints.length).toBeGreaterThan(0);
  });

  it("has structural ports and a generated materials list", () => {
    const scene = starterScene();
    expect(scenePorts(scene).length).toBeGreaterThan(10);
    const bom = sceneBom(scene);
    expect(bom.parts.length).toBeGreaterThan(0);
    expect(bom.totalParts).toBeGreaterThan(0);
    expect(bom.totalJoints).toBe(scene.joints.filter((joint) => !joint.suppressed).length);
    expect(bomCsv(bom)).toContain("Cantidad");
  });
});

describe("panels, joints and connectors", () => {
  it("builds a 2x2 slatwall wall with integrated dovetail joints", () => {
    const scene = addGroup(emptyScene(), "wall-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.items).toHaveLength(4);
    expect(scene.joints.length).toBeGreaterThan(0);
    expect(scene.joints.some((joint) => joint.type === "dovetail")).toBe(true);
    const bom = sceneBom(scene);
    expect(bom.integrated.some((line) => line.name.includes("cola de milano"))).toBe(true);
    expect(bom.parts.some((line) => line.name.includes("Conector de borde"))).toBe(false);
  });

  it("uses an edge corner connector for a 90 degree slatwall corner", () => {
    const scene = addGroup(emptyScene(), "corner-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.items).toHaveLength(4);
    const corner = scene.joints.find((joint) => joint.type === "edge-2-corner");
    expect(corner).toBeTruthy();
    if (corner) {
      const types = allowedConnectorTypes(scene, corner);
      expect(types).toContain("edge-2-corner");
      expect(types).not.toContain("dovetail");
    }
  });

  it("connects an awning to a wire grid and counts its kit only once", () => {
    const scene = addGroup(emptyScene(), "awning-wall", { anchor: { x: 0, y: 0 } }).scene;
    const awningJoint = scene.joints.find((joint) => joint.type === "awning-foot");
    expect(awningJoint).toBeTruthy();
    const bom = sceneBom(scene);
    const gridLines = bom.parts.filter((line) => line.name.includes("Conector de rejilla para pata"));
    expect(gridLines.reduce((sum, line) => sum + line.qty, 0)).toBe(2);
  });

  it("changes and suppresses a connector without moving the pieces", () => {
    const scene = addGroup(emptyScene(), "corner-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    const joint = scene.joints.find((candidate) => candidate.type === "edge-2-corner");
    expect(joint).toBeTruthy();
    if (!joint) return;
    const changed = setJointType(scene, joint.id, "edge-2-flat");
    expect(changed.joints.find((candidate) => candidate.id === joint.id)?.type).toBe("edge-2-flat");
    const hidden = toggleJointSuppressed(changed, joint.id);
    expect(hidden.joints.find((candidate) => candidate.id === joint.id)?.suppressed).toBe(true);
    expect(hidden.items).toHaveLength(changed.items.length);
  });
});

describe("editing and reuse", () => {
  it("reuses an identical item instead of duplicating it", () => {
    const base = emptyScene();
    const first = addCatalogItem(base, "slatwall30", { x: 0, y: 0 });
    const second = addCatalogItem(first.scene, "slatwall30", { x: 0, y: 0 });
    expect(second.created).toBe(false);
    expect(second.scene.items).toHaveLength(1);
    expect(second.itemId).toBe(first.itemId);
  });

  it("does not duplicate an existing assembly when the same preset is placed again", () => {
    const first = addGroup(emptyScene(), "wall-slatwall", { anchor: { x: 0, y: 0 } });
    const second = addGroup(first.scene, "wall-slatwall", { anchor: { x: 0, y: 0 } });
    expect(second.created).toBe(0);
    expect(second.scene.items).toHaveLength(4);
    expect(second.scene.groups).toHaveLength(1);
  });

  it("deletes a panel without breaking the rest of the scene", () => {
    const scene = addGroup(emptyScene(), "organizer-wall", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.items).toHaveLength(4);
    const panel = scene.items.find((item) => item.type === "slatwall30");
    const organizer = scene.items.find((item) => item.type === "organizer");
    expect(panel).toBeTruthy();
    expect(organizer?.mount).toBeTruthy();
    if (!panel) return;
    const next = deleteItems(scene, [panel.id]);
    expect(next.items).toHaveLength(3);
    expect(next.items.find((item) => item.id === organizer?.id)?.mount).toBeUndefined();
    expect(next.items.some((item) => item.type === "bins")).toBe(true);
    expect(next.items.some((item) => item.type === "shelfhook")).toBe(true);
  });

  it("moves and rotates a group as a unit", () => {
    const scene = addGroup(emptyScene(), "display-set", { anchor: { x: 0, y: 0 } }).scene;
    const groupId = scene.groups[0].id;
    const ids = expandSelectionWithGroups(scene, [scene.items[0].id]);
    expect(ids).toHaveLength(3);
    const moved = moveItems(scene, ids, 100, 50);
    const movedItems = moved.items.filter((item) => item.groupId === groupId);
    const original = scene.items.filter((item) => item.groupId === groupId);
    expect(movedItems[0].x).toBeCloseTo(original[0].x + 100);
    expect(movedItems[0].y).toBeCloseTo(original[0].y + 50);
    const rotated = rotateItems(moved, [scene.items[0].id], 90);
    const rotatedItems = rotated.items.filter((item) => item.groupId === groupId);
    expect(rotatedItems[0].rotation).toBe(90);
  });

  it("groups, ungroups and duplicates without leaving duplicate positions", () => {
    const base = emptyScene();
    const a = addCatalogItem(base, "slatwall30", { x: -200, y: 0 }).scene;
    const b = addCatalogItem(a, "display4", { x: 200, y: 0 }).scene;
    const grouped = groupSelection(b, b.items.map((item) => item.id));
    expect(grouped.scene.groups).toHaveLength(1);
    const ungrouped = ungroupSelection(grouped.scene, grouped.scene.items.map((item) => item.id));
    expect(ungrouped.groups).toHaveLength(0);
    const duplicated = duplicateSelection(ungrouped, ungrouped.items.map((item) => item.id));
    expect(duplicated.ids.length).toBe(2);
    expect(duplicated.scene.items).toHaveLength(4);
    expect(new Set(duplicated.scene.items.map((item) => `${item.type}:${Math.round(item.x)}:${Math.round(item.y)}`)).size).toBe(4);
  });
});

describe("accessories on panels", () => {
  it("mounts, moves and unmounts an organizer", () => {
    const base = addGroup(emptyScene(), "wall-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    const panel = base.items.find((item) => item.type === "slatwall30");
    expect(panel).toBeTruthy();
    if (!panel) return;
    const added = addCatalogItem(base, "organizer", { panelId: panel.id });
    expect(added.scene.items.find((item) => item.id === added.itemId)?.mount?.panelId).toBe(panel.id);
    const moved = moveMountedItem(added.scene, added.itemId, 0.3, 0.6);
    expect(moved.items.find((item) => item.id === added.itemId)?.mount?.u).toBeCloseTo(0.3);
    const unmounted = unmountItem(moved, added.itemId);
    expect(unmounted.items.find((item) => item.id === added.itemId)?.mount).toBeUndefined();
  });

  it("recomputes mounted positions when the panel rotates", () => {
    const base = addGroup(emptyScene(), "wall-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    const panel = base.items.find((item) => item.type === "slatwall30");
    if (!panel) return;
    const added = addCatalogItem(base, "bins", { panelId: panel.id });
    const before = added.scene.items.find((item) => item.id === added.itemId);
    const rotated = rotateItems(added.scene, [panel.id], 90);
    const after = rotated.items.find((item) => item.id === added.itemId);
    expect(after?.rotation).toBe(90);
    expect(after?.x).not.toBe(before?.x);
  });
});

describe("scene helpers", () => {
  it("clears the table but preserves its settings", () => {
    const scene = starterScene();
    const cleared = clearScene(scene);
    expect(cleared.items).toHaveLength(0);
    expect(cleared.table).toEqual(scene.table);
    expect(cleared.name).toBe(scene.name);
  });

  it("keeps connector metadata complete", () => {
    for (const [id, connector] of Object.entries(CONNECTORS)) {
      expect(connector.id).toBe(id);
      expect(connector.systems.length).toBeGreaterThan(0);
      expect(connector.minPanels).toBeLessThanOrEqual(connector.maxPanels);
    }
    expect(GROUPS_BY_ID.starter.items.length).toBeGreaterThan(4);
  });

  it("recomputes joints from ports after a manual move", () => {
    const scene = starterScene();
    const recomputed = computeJoints(scene, []);
    expect(recomputed.length).toBeGreaterThan(0);
    for (const joint of recomputed) {
      expect(joint.ports.length).toBeGreaterThanOrEqual(2);
      expect(Number.isFinite(joint.x)).toBe(true);
      expect(Number.isFinite(joint.y)).toBe(true);
      expect(Number.isFinite(joint.z)).toBe(true);
    }
  });

  it("has a finite footprint for every catalog item", () => {
    for (const item of starterScene().items) {
      const box = itemAabb(item);
      expect(box.maxX).toBeGreaterThan(box.minX);
      expect(box.maxY).toBeGreaterThan(box.minY);
      expect(catalogFor(item).ports.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("panel sizes and flat panels", () => {
  it("offers quarter and half grid panels for every panel material", () => {
    for (const type of ["slatwall15", "skadis15", "wire15"]) {
      expect(CATALOG_BY_TYPE[type]?.dims).toMatchObject({ w: 150, h: 150 });
    }
    for (const type of ["slatwall15x30", "skadis15x30", "wire15x30"]) {
      expect(CATALOG_BY_TYPE[type]?.dims).toMatchObject({ w: 150, h: 300 });
    }
    for (const type of ["slatwall30x15", "skadis30x15", "wire30x15"]) {
      expect(CATALOG_BY_TYPE[type]?.dims).toMatchObject({ w: 300, h: 150 });
    }
  });

  it("has a flat coloured equivalent for every wire-grid size", () => {
    for (const type of ["flat30", "flat35", "flat15", "flat15x30", "flat30x15"]) {
      const panel = CATALOG_BY_TYPE[type];
      expect(panel?.category).toBe("paneles");
      expect(panel?.ports.every((port) => port.system === "wire")).toBe(true);
      expect(panel?.tags).toContain("liso");
    }
  });
});

describe("towers and L-shaped work tables", () => {
  it("builds the two four-cube towers with an open back and four-panel bridge", () => {
    const scene = addGroup(emptyScene(), "twin-towers", { anchor: { x: 0, y: 0 } }).scene;
    const towers = scene.items.filter((item) => item.type === "wire30");
    expect(towers).toHaveLength(28);
    expect(scene.items.some((item) => item.y > 0)).toBe(false);
    const top = scene.table.height + 900;
    const bridge = towers.filter((item) => item.baseZ === top && item.x >= -450 && item.x <= 450);
    expect(bridge).toHaveLength(4);
    expect(new Set(towers.map((item) => item.baseZ - scene.table.height))).toEqual(new Set([0, 300, 600, 900]));
    expect(scene.joints.length).toBeGreaterThan(20);
  });

  it("places an L-shaped workspace with two perpendicular tables", () => {
    const scene = addGroup(emptyScene(), "workspace-l-work", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.tables).toHaveLength(2);
    expect(scene.tables[1].rotation).toBe(90);
    expect(scene.tables[0].height).toBe(scene.tables[1].height);
    expect(scene.items).toHaveLength(7);
    expect(scene.items.every((item) => item.baseZ === scene.table.height)).toBe(true);
  });

  it("adds, edits and removes extra tables while keeping a shared height", () => {
    const base = addGroup(emptyScene(), "workspace-l-work", { anchor: { x: 0, y: 0 } }).scene;
    const added = addTable(base, "straight");
    expect(added.scene.tables).toHaveLength(3);
    const raised = updateTable(added.scene, added.tableId, { height: 820 });
    expect(raised.tables.every((table) => table.height === 820)).toBe(true);
    expect(raised.items.every((item) => item.baseZ === 820)).toBe(true);
    const removed = removeTable(raised, added.tableId);
    expect(removed.tables).toHaveLength(2);
  });
});

describe("clipboard and local project files", () => {
  it("copies a whole group and pastes it with fresh ids", () => {
    const scene = addGroup(emptyScene(), "display-set", { anchor: { x: 0, y: 0 } }).scene;
    const clipboard = copySelection(scene, [scene.items[0].id]);
    expect(clipboard?.items).toHaveLength(3);
    expect(clipboard?.groups).toHaveLength(1);
    if (!clipboard) return;
    const pasted = pasteSelection(scene, clipboard, 90);
    expect(pasted.ids).toHaveLength(3);
    expect(pasted.scene.items).toHaveLength(6);
    expect(pasted.scene.groups).toHaveLength(2);
    expect(pasted.ids.every((id) => !scene.items.some((item) => item.id === id))).toBe(true);
  });

  it("round-trips the complete scene, tables and groups through JSON", () => {
    const scene = addGroup(emptyScene(), "workspace-l-wall", { anchor: { x: 0, y: 0 } }).scene;
    const text = sceneToJson(scene, "Puesto Ñandú");
    const restored = sceneFromJson(text);
    expect(restored.name).toBe("Puesto Ñandú");
    expect(restored.items).toHaveLength(scene.items.length);
    expect(restored.tables).toHaveLength(2);
    expect(restored.tables[1].rotation).toBe(90);
    expect(restored.groups).toHaveLength(1);
    expect(sceneFileName("Puesto Ñandú")).toBe("puesto-nandu.artist-alley.json");
  });

  it("rejects files from another format", () => {
    expect(() => sceneFromJson(JSON.stringify({ format: "otro-formato", scene: {} }))).toThrow();
  });
});
