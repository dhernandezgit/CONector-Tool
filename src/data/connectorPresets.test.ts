import { describe, expect, it } from "vitest";
import { CONNECTOR_PRESETS, CONNECTOR_PROFILE_OPTIONS, presetSettings } from "./connectorPresets";

describe("parametric connector presets", () => {
  it("has a parameter set for every supplied connector family", () => {
    expect(CONNECTOR_PRESETS).toHaveLength(43);
    expect(new Set(CONNECTOR_PRESETS.map((preset) => preset.id)).size).toBe(CONNECTOR_PRESETS.length);
    for (const preset of CONNECTOR_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(1);
      expect(preset.target?.width).toBeGreaterThan(0);
      expect(preset.target?.height).toBeGreaterThan(0);
      expect(preset.target?.depth).toBeGreaterThan(0);
      const settings = presetSettings(preset);
      expect(settings.family).toBe("profile");
      expect(settings.profile_id).toBeTruthy();
      expect(settings.profile_scale_x).toBe(1);
      expect(settings.profile_scale_y).toBe(1);
      expect(settings.profile_scale_z).toBe(1);
      expect(settings.print.orientation).toBe("auto45");
    }
    expect(CONNECTOR_PROFILE_OPTIONS).toHaveLength(CONNECTOR_PRESETS.length);
  });

  it("groups the library by type and by connection count", () => {
    const types = new Set(CONNECTOR_PRESETS.map((preset) => preset.group?.split(" · ")[0]));
    expect(types.has("Edge")).toBe(true);
    expect(types.has("Nodos")).toBe(true);
    expect(types.has("Angulados")).toBe(true);
    expect(types.has("Patas")).toBe(true);
    expect(CONNECTOR_PRESETS.some((preset) => preset.connections === "7")).toBe(true);
  });
});
