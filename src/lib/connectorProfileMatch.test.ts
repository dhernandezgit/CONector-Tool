import { describe, expect, it } from "vitest";
import { CONNECTOR_PRESETS, presetSettings } from "../data/connectorPresets";
import { editablePorts } from "./connectorPorts";
import { nearestProfileForPorts } from "./connectorProfileMatch";

const edge1 = CONNECTOR_PRESETS.find((preset) => preset.id === "edge1")!;

describe("high-fidelity connection matching", () => {
  it("switches a one-port edge clamp to the matching two-port preset", () => {
    const base = presetSettings(edge1);
    const ports = editablePorts(base);
    const match = nearestProfileForPorts(
      [
        ...ports,
        { ...ports[0], id: "extra", angle: 90, level: ports[0].level },
      ],
      base,
    );
    expect(match?.presetId).toBe("edge2-corner");
    expect(match?.ports).toHaveLength(2);
  });

  it("removes a port without falling into the C grammar", () => {
    const edge2 = CONNECTOR_PRESETS.find((preset) => preset.id === "edge2-corner")!;
    const base = presetSettings(edge2);
    const ports = editablePorts(base);
    const match = nearestProfileForPorts(ports.slice(0, 1), base);
    expect(match?.presetId).toBe("edge1");
  });

  it("stays inside the same connector category when no exact layout exists", () => {
    const connector = CONNECTOR_PRESETS.find((preset) => preset.id === "connector")!;
    const base = presetSettings(connector);
    const ports = editablePorts(base);
    const match = nearestProfileForPorts(
      [...ports, { ...ports[0], id: "extra", angle: 45 }],
      base,
    );
    expect(match).not.toBeNull();
    expect(CONNECTOR_PRESETS.find((preset) => preset.patch.profile_id === match?.presetId)?.category).toBe(
      "Conectores",
    );
  });
});
