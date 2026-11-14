import type { ConnectorPort, ConnectorSettings, PortLevel } from "../types";

export function derivedPorts(settings: ConnectorSettings): ConnectorPort[] {
  const width =
    settings.arm_width >= 5 && settings.arm_width <= 45
      ? settings.arm_width
      : Math.max(7, settings.body_size * 0.3);
  const top = settings.top_channels !== false;
  const bottom = settings.bottom_channels !== false;
  const level: PortLevel = top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "middle";
  const ports: ConnectorPort[] = [];
  const add = (rawAngle: number, portLevel: PortLevel) => {
    const angle = ((Number(rawAngle) % 360) + 360) % 360;
    if (!Number.isFinite(angle)) return;
    if (ports.some((port) => port.level === portLevel && Math.abs(((angle - port.angle + 180) % 360) - 180) < 0.4)) {
      return;
    }
    ports.push({
      id: `port-${ports.length}`,
      angle,
      level: portLevel,
      length: 0,
      width,
      enabled: true,
    });
  };
  const hasVertical = Boolean(settings.vertical_ports?.length);
  // A 3D connection is represented as a top row while the planar arms use
  // the bottom row.  This avoids stacking two identical C channels at the
  // same angle.
  const horizontalLevel: PortLevel = hasVertical ? "bottom" : level;
  for (const angle of settings.horizontal_ports || []) add(angle, horizontalLevel);
  for (const angle of settings.vertical_ports || []) add(angle, "top");
  if (ports.length === 0) {
    add(0, level);
    add(90, level);
  }
  return ports.sort((a, b) => a.angle - b.angle || a.level.localeCompare(b.level));
}

export function editablePorts(settings: ConnectorSettings): ConnectorPort[] {
  if (Array.isArray(settings.ports)) {
    return settings.ports.map((port, index) => ({
      ...port,
      id: port.id || `port-${index}`,
      angle: ((Number(port.angle) % 360) + 360) % 360,
      level: port.level || "both",
      length: Number.isFinite(port.length) ? port.length : 0,
      width: Number.isFinite(port.width) ? port.width : 10,
      enabled: port.enabled !== false,
    }));
  }
  return derivedPorts(settings);
}
