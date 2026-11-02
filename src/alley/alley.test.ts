import { describe, expect, it } from "vitest";
import { CATALOG_BY_TYPE, CONNECTORS, GROUPS_BY_ID } from "./catalog";
import {
  allowedConnectorTypes,
  catalogFor,
  computeJoints,
  defaultConnectorType,
  findSnapForMove,
  itemAabb,
  portsVisible,
  scenePorts,
  tableAabb,
} from "./geometry";
import {
  addCatalogItem,
  addEmptyGroup,
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
  isLegacyStarterScene,
  itemsInGroup,
  moveItems,
  pasteSelection,
  recolorItems,
  removeTable,
  resetJointType,
  rotateItems,
  sceneBom,
  sceneFileName,
  sceneFromJson,
  sceneToJson,
  setJointType,
  starterScene,
  toggleJointSuppressed,
  ungroupGroup,
  ungroupSelection,
  updateTable,
} from "./scene";

function countItems(scene: ReturnType<typeof emptyScene>, type: string) {
  return scene.items.filter((item) => item.type === type).length;
}

describe("Artist Alley starter scene", () => {
  it("loads the editable double tower with shelves and organizers", () => {
    const scene = starterScene();
    expect(scene.items).toHaveLength(54);
    expect(scene.groups).toHaveLength(5);
    expect(scene.groups.filter((group) => !group.parentId)).toHaveLength(1);
    expect(scene.groups.filter((group) => group.parentId).length).toBe(4);
    expect(itemsInGroup(scene, scene.groups.find((group) => !group.parentId)?.id)).toHaveLength(54);
    expect(countItems(scene, "wire30")).toBe(28);
    expect(countItems(scene, "wireshelf30")).toBe(12);
    expect(countItems(scene, "organizer")).toBe(2);
    expect(countItems(scene, "awning30")).toBe(6);
    expect(countItems(scene, "basebox40")).toBe(6);
    const organizers = scene.items.filter((item) => item.type === "organizer");
    expect(organizers.every((item) => !item.mount)).toBe(true);
    expect(new Set(organizers.map((item) => item.x))).toEqual(new Set([-150, 150]));
    expect(new Set(organizers.map((item) => item.y))).toEqual(new Set([300]));
    expect(new Set(scene.items.filter((item) => item.type === "wireshelf30").map((item) => item.baseZ))).toEqual(
      new Set([200, 500, 800, 1100, 40, 95, 150, 205].map((level) => scene.table.height + level)),
    );
    expect(new Set(scene.items.filter((item) => item.type === "basebox40").map((item) => item.x))).toEqual(
      new Set([-750, -450, -150, 150, 450, 750]),
    );
    expect(scene.joints.some((joint) => joint.type === "wire-grid")).toBe(true);
    expect(scene.joints.some((joint) => joint.type === "organizer-slot")).toBe(true);
    expect(scene.joints.filter((joint) => joint.type === "awning-foot")).toHaveLength(12);
    expect(scene.joints.filter((joint) => joint.type === "connector-360").length).toBeGreaterThanOrEqual(19);
    expect(scene.joints.length).toBeGreaterThan(0);
    const restored = sceneFromJson(sceneToJson(scene));
    const restoredRoot = restored.groups.find((group) => !group.parentId);
    const restoredBase = restored.groups.find((group) => group.name === "Base rosa");
    expect(restoredRoot).toBeTruthy();
    expect(restoredBase?.parentId).toBe(restoredRoot?.id);
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
  it("builds a 2x4 slatwall wall with integrated dovetail joints", () => {
    const scene = addGroup(emptyScene(), "wall-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.items).toHaveLength(8);
    expect(scene.joints.length).toBeGreaterThan(0);
    expect(scene.joints.some((joint) => joint.type === "dovetail")).toBe(true);
    const bom = sceneBom(scene);
    expect(bom.integrated.some((line) => line.name.includes("cola de milano"))).toBe(true);
    expect(bom.parts.some((line) => line.name.includes("Conector de borde"))).toBe(false);
  });

  it("offers only the real connector for a 90 degree slatwall corner", () => {
    const scene = addGroup(emptyScene(), "corner-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.items).toHaveLength(4);
    const corner = scene.joints.find((joint) => joint.type === "edge-2-corner");
    expect(corner).toBeTruthy();
    if (corner) expect(allowedConnectorTypes(scene, corner)).toEqual(["edge-2-corner"]);
  });

  it("builds an angled wire bay with grid connectors", () => {
    const scene = addGroup(emptyScene(), "wire-angled", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.items).toHaveLength(10);
    expect(scene.items.every((item) => item.type === "wire30")).toBe(true);
    expect(new Set(scene.items.map((item) => item.rotation))).toEqual(new Set([0, 30, 330]));
    expect(scene.joints.length).toBeGreaterThan(0);
    expect(scene.joints.every((joint) => joint.type === "wire-grid")).toBe(true);
  });

  it("keeps every quick example buildable with panels and useful accessories", () => {
    for (const group of Object.values(GROUPS_BY_ID)) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const spec of group.items) {
        expect(CATALOG_BY_TYPE[spec.type]).toBeTruthy();
      }
      const scene = addGroup(emptyScene(), group.id, { anchor: { x: 0, y: 0 } }).scene;
      expect(scene.items).toHaveLength(group.items.length);
      expect(
        scene.items.some(
          (item) =>
            CATALOG_BY_TYPE[item.type]?.category === "paneles" ||
            item.type === "organizer" ||
            item.type === "basebox40" ||
            item.type.startsWith("awning"),
        ),
      ).toBe(true);
      if (!group.items.every((item) => item.type.startsWith("awning"))) {
        expect(scene.joints.length).toBeGreaterThan(0);
      }
    }
  });

  it("lists the real L variants for a three-panel L joint", () => {
    const scene = addGroup(emptyScene(), "stepped-wall", { anchor: { x: 0, y: 0 } }).scene;
    const joint = scene.joints.find((candidate) =>
      allowedConnectorTypes(scene, candidate).some((type) => type.includes("edge-3-L")),
    );
    expect(joint).toBeTruthy();
    if (joint) {
      const candidates = allowedConnectorTypes(scene, joint);
      expect(candidates).toContain("edge-3-L");
      expect(candidates).toContain("edge-3-L-flipped");
      expect(candidates.every((type) => type.includes("edge-3-L"))).toBe(true);
    }
  });

  it("joins slatwall and Skadis panels without system restrictions", () => {
    const first = addCatalogItem(emptyScene(), "slatwall30", { x: 0, y: 0, baseZ: 0 });
    const second = addCatalogItem(first.scene, "skadis30", { x: 300, y: 0, baseZ: 0 });
    const joint = second.scene.joints.find(
      (candidate) =>
        candidate.ports.some((port) => port.itemId === first.itemId) &&
        candidate.ports.some((port) => port.itemId === second.itemId),
    );
    expect(joint).toBeTruthy();
    expect(joint?.type).toBe("edge-2-flat");
    if (joint) expect(allowedConnectorTypes(second.scene, joint)).toEqual(["edge-2-flat"]);
  });

  it("places a second organizer shelf on a free spot", () => {
    const scene = starterScene();
    const added = addGroup(scene, "organizer-shelf");
    expect(added.created).toBe(6);
    expect(added.scene.items).toHaveLength(scene.items.length + 6);
  });

  it("builds a single tower with four shelves", () => {
    const scene = addGroup(emptyScene(), "single-tower", { anchor: { x: 0, y: 0 } }).scene;
    expect(countItems(scene, "wire30")).toBe(12);
    expect(countItems(scene, "wireshelf30")).toBe(4);
    expect(countItems(scene, "organizer")).toBe(0);
  });

  it("defines the 40 x 30 x 20 open base box and its 360 connector", () => {
    const box = CATALOG_BY_TYPE.basebox40;
    expect(box.dims).toEqual({ w: 300, d: 400, h: 200 });
    expect(box.mountable).toBeFalsy();
    expect(box.ports).toHaveLength(6);
    expect(box.ports.filter((port) => port.id.startsWith("side-"))).toHaveLength(2);
    expect(CONNECTORS["connector-360"].bomName).toBe("360 Connector");
  });

  it("builds an organizer shelf with two side frames and four shelves", () => {
    expect(CATALOG_BY_TYPE.organizer.dims).toEqual({ w: 150, d: 12, h: 245 });
    expect(CATALOG_BY_TYPE.organizer.mountable).toBeFalsy();
    expect(CATALOG_BY_TYPE.organizer.ports).toHaveLength(8);
    const scene = addGroup(emptyScene(), "organizer-shelf", { anchor: { x: 0, y: 0 } }).scene;
    expect(countItems(scene, "organizer")).toBe(2);
    expect(countItems(scene, "wireshelf30")).toBe(4);
    const frames = scene.items.filter((item) => item.type === "organizer");
    expect(new Set(frames.map((item) => item.x))).toEqual(new Set([-150, 150]));
    expect(frames.every((item) => !item.mount)).toBe(true);
    expect(new Set(scene.items.filter((item) => item.type === "wireshelf30").map((item) => item.baseZ))).toEqual(
      new Set([40, 95, 150, 205].map((level) => scene.table.height + level)),
    );
    expect(scene.joints.filter((joint) => joint.type === "organizer-slot")).toHaveLength(16);
  });

  it("anchors an awning to a panel top without floor legs", () => {
    const base = addGroup(emptyScene(), "wall-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    const panel = base.items.find(
      (item) => item.type === "slatwall30" && item.baseZ === base.table.height && item.x === -150,
    );
    expect(panel).toBeTruthy();
    if (!panel) return;
    const result = addCatalogItem(base, "awning30", { panelId: panel.id });
    const awning = result.scene.items.find((item) => item.id === result.itemId);
    expect(awning?.baseZ).toBe(panel.baseZ + 300);
    expect(awning?.groupId).toBe(panel.groupId);
    const joint = result.scene.joints.find(
      (candidate) => candidate.type === "awning-foot" && candidate.ports.some((port) => port.itemId === awning?.id),
    );
    expect(joint).toBeTruthy();
    expect(joint?.ports.some((port) => port.portId.startsWith("awning"))).toBe(true);
    expect(joint?.ports.some((port) => port.portId.startsWith("foot"))).toBe(true);
    const bom = sceneBom(result.scene);
    expect(bom.parts.some((line) => line.name.includes("Pata"))).toBe(false);
    expect(bom.parts.some((line) => line.name.includes("Soporte trasero de toldo"))).toBe(true);
    expect(bom.parts.some((line) => line.name.includes("Anclaje de toldo"))).toBe(false);
    expect(CONNECTORS["awning-foot"].integrated).toBe(true);
    expect(CATALOG_BY_TYPE.awning30.ports.map((port) => port.id)).toEqual(["foot-left", "foot-right"]);
  });

  it("anchors a 35 cm awning to a 35 cm panel", () => {
    const base = addCatalogItem(emptyScene(), "slatwall35", { x: 0, y: 0 }).scene;
    const panel = base.items.find((item) => item.type === "slatwall35");
    expect(panel).toBeTruthy();
    if (!panel) return;
    const result = addCatalogItem(base, "awning35", { panelId: panel.id });
    expect(result.scene.joints.filter((joint) => joint.type === "awning-foot")).toHaveLength(2);
  });

  it("does not pretend a mismatched awning is anchored", () => {
    const base = addCatalogItem(emptyScene(), "slatwall15", { x: 0, y: 0 }).scene;
    const smallPanel = base.items.find((item) => item.type === "slatwall15");
    expect(smallPanel).toBeTruthy();
    if (!smallPanel) return;
    const result = addCatalogItem(base, "awning30", { panelId: smallPanel.id });
    expect(result.scene.joints.some((joint) => joint.type === "awning-foot")).toBe(false);
  });

  it("gives the horizontal shelf four corners and four organizer supports", () => {
    const shelf = CATALOG_BY_TYPE.wireshelf30;
    expect(shelf.horizontal).toBe(true);
    expect(shelf.ports).toHaveLength(8);
    expect(shelf.ports.every((port) => port.pos[2] === 0)).toBe(true);
    expect(shelf.ports.filter((port) => Math.abs(port.pos[1]) === 69)).toHaveLength(4);
  });

  it("snaps a loose shelf to a tower corner and recommends a wire connector", () => {
    const scene = addGroup(emptyScene(), "single-tower", { anchor: { x: 0, y: 0 } }).scene;
    const added = addCatalogItem(scene, "wireshelf30", {
      x: 350,
      y: 350,
      baseZ: scene.table.height,
    });
    const shelf = added.scene.items.find((item) => item.id === added.itemId);
    expect(shelf).toBeTruthy();
    if (!shelf) return;
    const snap = findSnapForMove(added.scene, [shelf.id], [0, 0, 0], 160);
    expect(snap).toBeTruthy();
    if (snap) {
      expect(defaultConnectorType(added.scene, [
        { itemId: snap.source.itemId, portId: snap.source.portId },
        { itemId: snap.target.itemId, portId: snap.target.portId },
      ])).toBe("wire-grid");
    }
  });

  it("generates 30 and 45 degree joints in the angled examples", () => {
    const starter = addGroup(emptyScene(), "starter", { anchor: { x: 0, y: 0 } }).scene;
    expect(starter.joints.some((joint) => joint.type === "edge-2-45")).toBe(true);
    const stepped = addGroup(emptyScene(), "stepped-wall", { anchor: { x: 0, y: 0 } }).scene;
    expect(stepped.joints.some((joint) => joint.type === "edge-2-30")).toBe(true);
    const uBooth = addGroup(emptyScene(), "u-booth", { anchor: { x: 0, y: 0 } }).scene;
    expect(uBooth.joints.some((joint) => joint.type === "edge-2-45")).toBe(true);
  });

  it("uses triangular panels as a sloped finish", () => {
    const scene = addGroup(emptyScene(), "triangle-finish", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.items).toHaveLength(4);
    expect(scene.items.filter((item) => item.type === "triangle")).toHaveLength(2);
    expect(scene.joints.some((joint) => joint.type === "dovetail")).toBe(true);
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
    expect(second.scene.items).toHaveLength(8);
    expect(second.scene.groups).toHaveLength(1);
  });

  it("deletes a panel without breaking the rest of the scene", () => {
    const scene = addGroup(emptyScene(), "wall-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    const panel = scene.items.find((item) => item.type === "slatwall30");
    expect(panel).toBeTruthy();
    if (!panel) return;
    const added = addCatalogItem(scene, "organizer", { panelId: panel.id });
    expect(added.scene.items).toHaveLength(9);
    const next = deleteItems(added.scene, [panel.id]);
    expect(next.items).toHaveLength(8);
    expect(next.items.find((item) => item.id === added.itemId)?.mount).toBeUndefined();
    expect(next.items.filter((item) => item.type === "slatwall30")).toHaveLength(7);
  });

  it("moves and rotates a group as a unit", () => {
    const scene = addGroup(emptyScene(), "small-panels", { anchor: { x: 0, y: 0 } }).scene;
    const groupId = scene.groups[0].id;
    const ids = expandSelectionWithGroups(scene, [scene.items[0].id]);
    expect(ids).toHaveLength(6);
    const moved = moveItems(scene, ids, 100, 50);
    const movedItems = moved.items.filter((item) => item.groupId === groupId);
    const original = scene.items.filter((item) => item.groupId === groupId);
    expect(movedItems[0].x).toBeCloseTo(original[0].x + 100);
    expect(movedItems[0].y).toBeCloseTo(original[0].y + 50);
    const rotated = rotateItems(moved, [scene.items[0].id], 90);
    const rotatedItems = rotated.items.filter((item) => item.groupId === groupId);
    expect(rotatedItems[0].rotation).toBe(90);
  });

  it("nests groups and ungroups only one level", () => {
    const first = addGroup(emptyScene(), "small-panels", { anchor: { x: 0, y: 0 } });
    const second = addGroup(first.scene, "single-tower", { anchor: { x: 800, y: 0 } });
    const firstGroupId = first.groupId;
    const secondGroupId = second.groupId;
    const allIds = itemsInGroup(second.scene, firstGroupId)
      .concat(itemsInGroup(second.scene, secondGroupId))
      .map((item) => item.id);
    const grouped = groupSelection(second.scene, allIds);
    expect(grouped.groupId).toBeTruthy();
    const parent = grouped.scene.groups.find((group) => group.id === grouped.groupId);
    expect(parent?.parentId).toBeUndefined();
    expect(grouped.scene.groups.find((group) => group.id === firstGroupId)?.parentId).toBe(grouped.groupId);
    expect(grouped.scene.groups.find((group) => group.id === secondGroupId)?.parentId).toBe(grouped.groupId);
    expect(itemsInGroup(grouped.scene, grouped.groupId)).toHaveLength(allIds.length);

    const ungroupedParent = ungroupGroup(grouped.scene, grouped.groupId);
    expect(ungroupedParent.groups).toHaveLength(2);
    expect(ungroupedParent.groups.every((group) => !group.parentId)).toBe(true);
    expect(ungroupedParent.items.every((item) => Boolean(item.groupId))).toBe(true);

    const ungroupedChild = ungroupGroup(ungroupedParent, firstGroupId);
    expect(ungroupedChild.groups).toHaveLength(1);
    expect(ungroupedChild.groups[0].id).toBe(secondGroupId);
    expect(ungroupedChild.items.filter((item) => item.groupId === firstGroupId)).toHaveLength(0);
    expect(itemsInGroup(ungroupedChild, secondGroupId).length).toBeGreaterThan(0);
  });

  it("groups sibling subgroups inside their common parent", () => {
    const empty = emptyScene();
    const root = addEmptyGroup(empty, "Puesto");
    const first = addGroup(root.scene, "small-panels", {
      anchor: { x: 0, y: 0 },
      parentId: root.groupId,
    });
    const second = addGroup(first.scene, "single-tower", {
      anchor: { x: 800, y: 0 },
      parentId: root.groupId,
    });
    const third = addGroup(second.scene, "organizer-shelf", {
      anchor: { x: -500, y: 0 },
      parentId: root.groupId,
    });
    const selected = [...itemsInGroup(third.scene, first.groupId), ...itemsInGroup(third.scene, second.groupId)].map(
      (item) => item.id,
    );
    const grouped = groupSelection(third.scene, selected);
    const parent = grouped.scene.groups.find((group) => group.id === grouped.groupId);
    expect(parent?.parentId).toBe(root.groupId);
    expect(grouped.scene.groups.find((group) => group.id === first.groupId)?.parentId).toBe(grouped.groupId);
    expect(grouped.scene.groups.find((group) => group.id === second.groupId)?.parentId).toBe(grouped.groupId);
    expect(grouped.scene.groups.find((group) => group.id === third.groupId)?.parentId).toBe(root.groupId);
  });

  it("rotates a parent group around its own pivot", () => {
    const scene = starterScene();
    const root = scene.groups.find((group) => !group.parentId);
    expect(root).toBeTruthy();
    if (!root) return;
    const ids = itemsInGroup(scene, root.id).map((item) => item.id);
    const first = scene.items.find((item) => item.type === "basebox40");
    const second = scene.items.find((item) => item.type === "awning30");
    expect(first && second).toBeTruthy();
    if (!first || !second) return;
    const before = Math.hypot(first.x - second.x, first.y - second.y);
    const rotated = rotateItems(scene, ids, 90);
    const a = rotated.items.find((item) => item.id === first.id)!;
    const b = rotated.items.find((item) => item.id === second.id)!;
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    expect(after).toBeCloseTo(before, 3);
  });

  it("recolors every piece in a group from one selected piece", () => {
    const scene = addGroup(emptyScene(), "single-tower", { anchor: { x: 0, y: 0 } }).scene;
    const shelf = scene.items.find((item) => item.type === "wireshelf30");
    expect(shelf?.groupId).toBeTruthy();
    if (!shelf?.groupId) return;
    const recolored = recolorItems(scene, [shelf.id], "#123456");
    const groupItems = recolored.items.filter((item) => item.groupId === shelf.groupId);
    expect(groupItems.length).toBe(scene.items.length);
    expect(groupItems.every((item) => item.color === "#123456")).toBe(true);
  });

  it("recomputes an automatic connector when geometry changes", () => {
    const scene = addGroup(emptyScene(), "corner-slatwall", { anchor: { x: 0, y: 0 } }).scene;
    const corner = scene.joints.find((candidate) => candidate.type === "edge-2-corner");
    expect(corner).toBeTruthy();
    if (!corner) return;
    const stale = {
      ...scene,
      joints: scene.joints.map((joint) =>
        joint.id === corner.id ? { ...joint, type: "edge-2-flat" as const, manual: false } : joint,
      ),
    };
    const recomputed = computeJoints(stale, stale.joints);
    expect(recomputed.find((candidate) => candidate.id === corner.id)?.type).toBe("edge-2-corner");
  });

  it("keeps a manual connector and can return it to automatic", () => {
    const scene = addGroup(emptyScene(), "u-booth", { anchor: { x: 0, y: 0 } }).scene;
    const joint = scene.joints.find((candidate) => allowedConnectorTypes(scene, candidate).length > 1);
    expect(joint).toBeTruthy();
    if (!joint) return;
    const candidates = allowedConnectorTypes(scene, joint);
    const automaticType = candidates[0];
    const target = candidates.find((candidate) => candidate !== joint.type) || automaticType;
    const manual = setJointType(scene, joint.id, target);
    expect(manual.joints.find((candidate) => candidate.id === joint.id)?.manual).toBe(true);
    const restored = sceneFromJson(sceneToJson(manual));
    const restoredJoint = restored.joints.find((candidate) => candidate.id === joint.id);
    expect(restoredJoint?.type).toBe(target);
    expect(restoredJoint?.manual).toBe(true);
    const automatic = resetJointType(restored, joint.id);
    expect(automatic.joints.find((candidate) => candidate.id === joint.id)?.type).toBe(automaticType);
    expect(automatic.joints.find((candidate) => candidate.id === joint.id)?.manual).toBe(false);
  });

  it("recognizes the old ten-panel starter for a one-time default upgrade", () => {
    const legacy = addGroup(emptyScene(), "starter", { anchor: { x: 0, y: 0 } }).scene;
    expect(legacy.items).toHaveLength(10);
    expect(isLegacyStarterScene(legacy)).toBe(true);
    expect(isLegacyStarterScene({ ...legacy, items: legacy.items.slice(0, 9) })).toBe(false);
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
  it("places two free-standing organizer frames and connects a shelf in their slots", () => {
    const base = emptyScene();
    const left = addCatalogItem(base, "organizer", { x: -150, y: 0 });
    const right = addCatalogItem(left.scene, "organizer", { x: 150, y: 0 });
    const leftFrame = right.scene.items.find((item) => item.id === left.itemId);
    const rightFrame = right.scene.items.find((item) => item.id === right.itemId);
    expect(leftFrame?.mount).toBeUndefined();
    expect(rightFrame?.mount).toBeUndefined();
    const shelf = addCatalogItem(right.scene, "wireshelf30", {
      x: 0,
      y: 0,
      baseZ: right.scene.table.height + 40,
    });
    expect(shelf.scene.joints.filter((joint) => joint.type === "organizer-slot")).toHaveLength(4);
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

  it("shows port spheres only while editing an item selection", () => {
    expect(portsVisible(true, null)).toBe(false);
    expect(portsVisible(false, { type: "item", ids: ["item"] })).toBe(false);
    expect(portsVisible(true, { type: "joint", ids: ["joint"] })).toBe(false);
    expect(portsVisible(true, { type: "item", ids: ["item"] })).toBe(true);
    expect(portsVisible(true, { type: "items", ids: ["a", "b"] })).toBe(true);
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
    expect(towers.every((item) => item.y <= 0)).toBe(true);
    const top = scene.table.height + 900 + 200;
    const bridge = towers.filter((item) => item.baseZ === top && item.x >= -450 && item.x <= 450);
    expect(bridge).toHaveLength(4);
    expect(new Set(towers.map((item) => item.baseZ - scene.table.height))).toEqual(new Set([200, 500, 800, 1100]));
    expect(scene.items.filter((item) => item.type === "basebox40")).toHaveLength(6);
    expect(scene.items.filter((item) => item.type === "awning30")).toHaveLength(6);
    expect(scene.joints.length).toBeGreaterThan(20);
  });

  it("places a symmetric L-shaped workspace with two perpendicular tables", () => {
    const scene = addGroup(emptyScene(), "workspace-l-work", { anchor: { x: 0, y: 0 } }).scene;
    expect(scene.tables).toHaveLength(2);
    expect(scene.tables[1].rotation).toBe(90);
    expect(scene.tables[0].height).toBe(scene.tables[1].height);
    expect(scene.items).toHaveLength(8);
    expect(scene.items.every((item) => item.type === "slatwall30")).toBe(true);
    expect(scene.items.every((item) => item.baseZ === scene.table.height)).toBe(true);
    const primary = tableAabb(scene.tables[0]);
    const lateral = tableAabb(scene.tables[1]);
    expect(primary.maxX).toBeCloseTo(lateral.minX);
    expect(primary.minY).toBeCloseTo(lateral.minY);
    expect(primary.maxY - primary.minY).toBeCloseTo(600);
    expect(lateral.maxY - lateral.minY).toBeCloseTo(1800);
  });

  it("adds an L table with equal arms and a flush front edge", () => {
    const base = emptyScene();
    const resized = updateTable(base, base.table.id, { width: 1800, depth: 600 });
    const added = addTable(resized, "l");
    const primary = tableAabb(added.scene.tables[0]);
    const lateral = tableAabb(added.scene.tables[1]);
    expect(added.scene.tables[1].rotation).toBe(90);
    expect(primary.maxX).toBeCloseTo(lateral.minX);
    expect(primary.minY).toBeCloseTo(lateral.minY);
    expect(primary.maxY - primary.minY).toBeCloseTo(600);
    expect(lateral.maxY - lateral.minY).toBeCloseTo(1800);
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
  it("copies nested groups with their hierarchy", () => {
    const empty = emptyScene();
    const root = addEmptyGroup(empty, "Puesto");
    const child = addGroup(root.scene, "small-panels", {
      anchor: { x: 0, y: 0 },
      parentId: root.groupId,
    });
    const clipboard = copySelection(child.scene, itemsInGroup(child.scene, child.groupId).map((item) => item.id));
    expect(clipboard).toBeTruthy();
    if (!clipboard) return;
    expect(clipboard.groups).toHaveLength(2);
    expect(clipboard.groups.some((group) => group.id === root.groupId)).toBe(true);
    const pasted = pasteSelection(child.scene, clipboard, 80);
    expect(pasted.scene.groups).toHaveLength(child.scene.groups.length + 2);
    const clones = pasted.scene.groups.filter((group) => group.id !== root.groupId && group.id !== child.groupId);
    const clonedRoot = clones.find((group) => !group.parentId);
    const clonedChild = clones.find((group) => group.parentId === clonedRoot?.id);
    expect(clonedRoot).toBeTruthy();
    expect(clonedChild).toBeTruthy();
    if (clonedChild) {
      expect(pasted.scene.items.filter((item) => item.groupId === clonedChild.id).length).toBeGreaterThan(0);
    }
  });

  it("copies a whole group and pastes it with fresh ids", () => {
    const scene = addGroup(emptyScene(), "small-panels", { anchor: { x: 0, y: 0 } }).scene;
    const clipboard = copySelection(scene, [scene.items[0].id]);
    expect(clipboard?.items).toHaveLength(6);
    expect(clipboard?.groups).toHaveLength(1);
    if (!clipboard) return;
    const pasted = pasteSelection(scene, clipboard, 90);
    expect(pasted.ids).toHaveLength(6);
    expect(pasted.scene.items).toHaveLength(12);
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
