import { describe, expect, it } from "vitest";
import { DEFAULT_CONNECTOR } from "../data/presets";
import {
  jointBom,
  kitItems,
  newJoint,
  newPanel,
  sceneBounds,
  sceneTemplate,
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

  it("computes bounds including panel size and connector height", () => {
    const scene = sceneTemplate("basic");
    const b = sceneBounds(scene);
    expect(b.width).toBeGreaterThan(600);
    expect(b.height).toBeGreaterThan(300);
    expect(b.depth).toBeGreaterThan(0);
  });

  it("creates a 3 x 2 wall template", () => {
    const scene = sceneTemplate("wall");
    expect(scene.panels).toHaveLength(6);
    expect(scene.joints).toHaveLength(6);
    expect(new Set(scene.panels.map((panel) => panel.id)).size).toBe(6);
  });

  it("returns one BOM line per joint type", () => {
    const scene = sceneTemplate("basic");
    expect(jointBom(scene)).toHaveLength(1);
    expect(jointBom(scene)[0].count).toBe(1);
  });

  it("builds kit items with decoration disabled", () => {
    const items = kitItems(sceneTemplate("wall"));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(6);
    expect(items[0].settings.decor.enabled).toBe(false);
  });

  it("disables decoration when a joint is opened in the studio", () => {
    const scene = sceneTemplate("basic");
    const settings = jointSettings(scene.joints[0]);
    expect(settings.decor.enabled).toBe(false);
    expect(settings.family).toBe("node");
    expect(settings.body_color).toBe(DEFAULT_CONNECTOR.body_color);
  });
});
