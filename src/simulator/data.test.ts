import { describe, expect, it } from "vitest";
import { DEFAULT_CONNECTOR } from "../data/presets";
import {
  jointBom,
  kitItems,
  nearestConnectionPoint,
  newJoint,
  newPanel,
  panelConnectionPoints,
  pruneJoints,
  sceneBounds,
  sceneConnectionPoints,
  sceneTemplate,
  snapJointsToPanels,
  jointSettings,
} from "./data";

describe("simulator scene", () => {
  it("creates panels and joints with unique ids", () => {
    const a = newPanel(10, 20);
    const b = newPanel(10, 20);
    const joint = newJoint(0, 0, 150);
    expect(a.id).not.toBe(b.id);
    expect(joint.z).toBe(150);
    expect(joint.scale).toBeGreaterThan(1);
  });

  it("starts from a cube made of square panels", () => {
    const scene = sceneTemplate("basic");
    expect(scene.panels).toHaveLength(4);
    expect(scene.joints).toHaveLength(8);
    expect(scene.panels.every((panel) => panel.width === panel.height)).toBe(true);
    const b = sceneBounds(scene);
    expect(b.width).toBeGreaterThanOrEqual(300);
    expect(b.height).toBeGreaterThanOrEqual(300);
    expect(b.depth).toBeGreaterThanOrEqual(300);
  });

  it("creates a 3 x 2 wall template", () => {
    const scene = sceneTemplate("wall");
    expect(scene.panels).toHaveLength(6);
    expect(scene.joints).toHaveLength(6);
    expect(new Set(scene.panels.map((panel) => panel.id)).size).toBe(6);
  });

  it("creates two four-level towers separated by two panels", () => {
    const scene = sceneTemplate("towers");
    expect(scene.panels).toHaveLength(10);
    expect(scene.joints).toHaveLength(22);
    const bounds = sceneBounds(scene);
    // Four panels wide: two 300 mm towers plus the 600 mm gap.
    expect(bounds.width).toBeGreaterThanOrEqual(1200);
    expect(bounds.height).toBeGreaterThanOrEqual(1200);
  });

  it("returns one BOM line per joint type", () => {
    const scene = sceneTemplate("basic");
    expect(jointBom(scene)).toHaveLength(1);
    expect(jointBom(scene)[0].count).toBe(8);
  });

  it("builds kit items with decoration disabled", () => {
    const items = kitItems(sceneTemplate("wall"));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(6);
    expect(items[0].settings.decor.enabled).toBe(false);
  });

  it("only allows joints on panel points", () => {
    const scene = sceneTemplate("basic");
    const points = sceneConnectionPoints(scene);
    expect(points.length).toBeGreaterThan(0);
    const target = points[0];
    const snapped = nearestConnectionPoint(scene, target.x + 40, target.y + 40, target.z, 500);
    expect(snapped).toEqual(target);

    const loose = {
      ...scene,
      joints: [{ ...scene.joints[0], x: 9999, y: 9999, z: 9999 }],
    };
    const fixed = snapJointsToPanels(loose);
    expect(fixed.joints[0].x).not.toBe(9999);
    expect(pruneJoints({ ...scene, joints: loose.joints }).joints).toHaveLength(0);
  });

  it("places a joint at every corner and edge midpoint", () => {
    const panel = newPanel(0, 0, "wire", 300, 300);
    expect(panelConnectionPoints(panel)).toHaveLength(8);
  });

  it("disables decoration when a joint is opened in the studio", () => {
    const scene = sceneTemplate("basic");
    const settings = jointSettings(scene.joints[0]);
    expect(settings.decor.enabled).toBe(false);
    expect(settings.family).toBe("template");
    expect(settings.template_id).toBe(4);
    expect(settings.body_color).toBe(DEFAULT_CONNECTOR.body_color);
  });
});
