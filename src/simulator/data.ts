import type { ConnectorSettings, SimJoint, SimPanel, SimPanelKind, SimulatorScene } from "../types";
import { uid } from "../lib/utils";
import { PRESETS, settingsForJoint, starterScene } from "../data/presets";

export const PANEL_COLORS = ["#d4d8de", "#e7e9ec", "#20252b", "#ef6f5e", "#77a85a", "#79a8d8", "#e6b63c"];
export const JOINT_COLORS = ["#ef6f5e", "#3e9a8f", "#e6b63c", "#8b7bc6", "#20252b", "#d9789b", "#5b8db8"];

export function newPanel(x = 0, y = 0, kind: SimPanelKind = "wire", width = 300, height = 300): SimPanel {
  return {
    id: uid("panel"),
    name: `Panel ${Math.floor(Math.random() * 900 + 100)}`,
    kind,
    width,
    height,
    x,
    y,
    z: 0,
    rotation: 0,
    color: PANEL_COLORS[Math.floor(Math.random() * PANEL_COLORS.length)],
  };
}

export function newJoint(x = 0, y = 0, z = 150, presetId = "corner90"): SimJoint {
  return {
    id: uid("joint"),
    name: "Unión",
    presetId,
    x,
    y,
    z,
    rotation: 0,
    scale: 1.2,
    color: JOINT_COLORS[Math.floor(Math.random() * JOINT_COLORS.length)],
  };
}

export interface ConnectionPoint {
  x: number;
  y: number;
  z: number;
}

/** Every place where a union may legally sit: the corners and edge
 * midpoints of the panels, top and bottom.  Unions are never free-floating. */
export function panelConnectionPoints(panel: SimPanel): ConnectionPoint[] {
  const a = (panel.rotation * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const halfW = panel.width / 2;
  const points: ConnectionPoint[] = [];
  for (const offset of [-halfW, halfW]) {
    for (const dz of [0, panel.height / 2, panel.height]) {
      points.push({ x: panel.x + dx * offset, y: panel.y + dy * offset, z: panel.z + dz });
    }
  }
  for (const dz of [0, panel.height]) {
    points.push({ x: panel.x, y: panel.y, z: panel.z + dz });
  }
  return points;
}

export function sceneConnectionPoints(scene: SimulatorScene): ConnectionPoint[] {
  const result: ConnectionPoint[] = [];
  for (const panel of scene.panels) {
    for (const point of panelConnectionPoints(panel)) {
      const exists = result.some(
        (item) => Math.abs(item.x - point.x) < 0.6 && Math.abs(item.y - point.y) < 0.6 && Math.abs(item.z - point.z) < 0.6,
      );
      if (!exists) result.push(point);
    }
  }
  return result;
}

/** Snap to the closest panel point.  Height counts less than X/Y so a union
 * dragged along a panel edge does not jump to the opposite corner. */
export function nearestConnectionPoint(
  scene: SimulatorScene,
  x: number,
  y: number,
  z: number,
  maxDistance = 360,
): ConnectionPoint | null {
  let best: ConnectionPoint | null = null;
  let bestDistance = Infinity;
  for (const point of sceneConnectionPoints(scene)) {
    const distance = Math.hypot(point.x - x, point.y - y, (point.z - z) * 0.55);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best && bestDistance <= maxDistance ? best : null;
}

/** Keep every union attached after a panel is moved, resized or rotated. */
export function snapJointsToPanels(scene: SimulatorScene): SimulatorScene {
  if (!scene.panels.length || !scene.joints.length) return scene;
  const points = sceneConnectionPoints(scene);
  if (!points.length) return scene;
  let changed = false;
  const joints = scene.joints.map((joint) => {
    let best = points[0];
    let bestDistance = Infinity;
    for (const point of points) {
      const distance = Math.hypot(point.x - joint.x, point.y - joint.y, (point.z - joint.z) * 0.55);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    if (Math.abs(best.x - joint.x) < 0.01 && Math.abs(best.y - joint.y) < 0.01 && Math.abs(best.z - joint.z) < 0.01) {
      return joint;
    }
    changed = true;
    return { ...joint, x: best.x, y: best.y, z: best.z };
  });
  return changed ? { ...scene, joints } : scene;
}

/** Drop unions that no longer coincide with a panel point. */
export function pruneJoints(scene: SimulatorScene): SimulatorScene {
  if (!scene.joints.length) return scene;
  const points = sceneConnectionPoints(scene);
  const joints = scene.joints.filter((joint) =>
    points.some(
      (point) => Math.abs(point.x - joint.x) < 1.5 && Math.abs(point.y - joint.y) < 1.5 && Math.abs(point.z - joint.z) < 1.5,
    ),
  );
  return joints.length === scene.joints.length ? scene : { ...scene, joints };
}

export function sceneBounds(scene: SimulatorScene) {
  if (!scene.panels.length) {
    return { width: 0, depth: 0, height: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = 0;
  let maxZ = 0;
  for (const panel of scene.panels) {
    const halfW = panel.width / 2;
    const a = (panel.rotation * Math.PI) / 180;
    const dx = Math.abs(Math.cos(a)) * halfW;
    const dy = Math.abs(Math.sin(a)) * halfW;
    minX = Math.min(minX, panel.x - dx);
    maxX = Math.max(maxX, panel.x + dx);
    minY = Math.min(minY, panel.y - dy);
    maxY = Math.max(maxY, panel.y + dy);
    minZ = Math.min(minZ, panel.z);
    maxZ = Math.max(maxZ, panel.z + panel.height);
  }
  for (const joint of scene.joints) {
    minX = Math.min(minX, joint.x - 20);
    maxX = Math.max(maxX, joint.x + 20);
    minY = Math.min(minY, joint.y - 20);
    maxY = Math.max(maxY, joint.y + 20);
    minZ = Math.min(minZ, joint.z);
    maxZ = Math.max(maxZ, joint.z + 20);
  }
  return {
    width: maxX - minX,
    depth: maxY - minY,
    height: maxZ - minZ,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
  };
}

export function jointBom(scene: SimulatorScene) {
  const counts = new Map<string, number>();
  for (const joint of scene.joints) {
    counts.set(joint.presetId, (counts.get(joint.presetId) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([presetId, count]) => ({
    presetId,
    count,
    preset: PRESETS.find((item) => item.id === presetId),
  }));
}

export function kitItems(scene: SimulatorScene) {
  return jointBom(scene).map(({ presetId, count }) => {
    const base = settingsForJoint(presetId);
    base.decor.enabled = false;
    base.name = base.name || presetId;
    return { settings: base, quantity: count };
  });
}

export function jointSettings(joint: SimJoint): ConnectorSettings {
  return settingsForJoint(joint.presetId, joint.color, joint.name);
}

export function sceneTemplate(id: "basic" | "wall" | "corner" | "tower" | "towers" | "backdrop" | "empty"): SimulatorScene {
  if (id === "empty") {
    return {
      ...starterScene(),
      panels: [],
      joints: [],
    };
  }
  if (id === "basic") return starterScene();
  if (id === "towers") {
    const side = 300;
    const panels: SimPanel[] = [];
    const joints: SimJoint[] = [];
    // Two square towers, four panels high, separated by exactly two panels.
    for (const center of [-450, 450]) {
      for (let level = 0; level < 4; level += 1) {
        const panel = newPanel(center, 0, "wire", side, side);
        panel.z = level * side;
        panel.name = `Torre ${center < 0 ? "A" : "B"} · nivel ${level + 1}`;
        panels.push(panel);
      }
      for (const edge of [center - side / 2, center + side / 2]) {
        for (const z of [0, side, side * 2, side * 3, side * 4]) {
          const joint = newJoint(edge, 0, z, "ref_estandar");
          joint.name = `Torre ${center < 0 ? "A" : "B"} · unión ${joints.length + 1}`;
          joints.push(joint);
        }
      }
    }
    // Two panels bridge the 600 mm gap at the top level.
    for (const x of [-side / 2, side / 2]) {
      const panel = newPanel(x, 0, "wire", side, side);
      panel.z = side * 3;
      panel.name = "Puente superior";
      panels.push(panel);
    }
    for (const x of [0]) {
      for (const z of [side * 3, side * 4]) {
        const joint = newJoint(x, 0, z, "ref_estandar");
        joint.name = `Puente · unión ${joints.length + 1}`;
        joints.push(joint);
      }
    }
    return { ...starterScene(), panels, joints };
  }
  if (id === "wall") {
    const panels: SimPanel[] = [];
    const joints: SimJoint[] = [];
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const panel = newPanel((col - 1) * 305, 0, "wire", 300, 300);
        panel.z = row * 300;
        panel.name = `Pared ${row + 1}-${col + 1}`;
        panels.push(panel);
        const joint = newJoint((col - 1) * 305 - 152.5, 0, panel.z + panel.height, "corner90");
        joint.name = `Unión ${row + 1}-${col + 1}`;
        joints.push(joint);
      }
    }
    return { ...starterScene(), panels, joints };
  }
  if (id === "corner") {
    const panels = [
      newPanel(-150, 0, "wire", 300, 300),
      newPanel(0, -150, "wire", 300, 300),
      newPanel(150, 0, "wire", 300, 300),
    ];
    panels[1].rotation = 90;
    const joints = [
      newJoint(-150, -150, 300, "corner3d"),
      newJoint(150, -150, 300, "corner3d"),
      newJoint(0, 0, 300, "tee"),
    ];
    return { ...starterScene(), panels, joints };
  }
  if (id === "tower") {
    const panels: SimPanel[] = [];
    const joints: SimJoint[] = [];
    for (let level = 0; level < 2; level += 1) {
      for (let col = 0; col < 2; col += 1) {
        const p = newPanel((col - 0.5) * 305, 0, "solid", 300, 300);
        p.z = level * 300;
        p.color = level === 0 ? "#d4d8de" : "#ef6f5e";
        panels.push(p);
        joints.push(newJoint((col - 0.5) * 305 - 152.5, 0, p.z + p.height, "corner90"));
      }
    }
    return { ...starterScene(), panels, joints };
  }
  if (id === "backdrop") {
    const panels = [-310, 0, 310].map((x, index) => {
      const p = newPanel(x, 100, index === 1 ? "skadis" : "wire", 300, 300);
      p.color = index === 1 ? "#b7c8bb" : "#d4d8de";
      return p;
    });
    const joints = [-305, 305].map((x) => newJoint(x, 100, 300, "flat"));
    return { ...starterScene(), panels, joints };
  }
  return starterScene();
}
