import { describe, expect, it } from "vitest";
import { DEFAULT_CONNECTOR } from "../data/presets";
import { derivedPorts, editablePorts } from "./connectorPorts";

describe("connector ports", () => {
  it("maps planar and 3D connections to separate editable levels", () => {
    const ports = derivedPorts({
      ...DEFAULT_CONNECTOR,
      horizontal_ports: [0, 90],
      vertical_ports: [0],
      top_channels: true,
      bottom_channels: true,
    });
    expect(ports).toHaveLength(3);
    expect(ports.filter((port) => port.level === "bottom")).toHaveLength(2);
    expect(ports.filter((port) => port.level === "top")).toHaveLength(1);
  });

  it("keeps an explicitly empty port list empty", () => {
    expect(editablePorts({ ...DEFAULT_CONNECTOR, ports: [] })).toHaveLength(0);
  });
});
