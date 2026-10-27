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

export function sceneTemplate(id: "basic" | "wall" | "corner" | "tower" | "backdrop" | "empty"): SimulatorScene {
  if (id === "empty") {
    return {
      ...starterScene(),
      panels: [],
      joints: [],
    };
  }
  if (id === "basic") return starterScene();
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
