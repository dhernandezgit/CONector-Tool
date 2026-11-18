import type { ConnectorPort, ConnectorSettings } from "../types";
import { CONNECTOR_PRESETS, presetSettings } from "../data/connectorPresets";
import { editablePorts } from "./connectorPorts";

/** Pick the closest high-fidelity preset for an edited connection layout. */
export function nearestProfileForPorts(
  ports: ConnectorPort[],
  settings: ConnectorSettings,
): { presetId: string; name: string; ports: ConnectorPort[] } | null {
  const current = CONNECTOR_PRESETS.find(
    (preset) => preset.patch.profile_id === settings.profile_id || preset.id === settings.profile_id,
  );
  const currentCategory = current?.category;
  const currentGroup = current?.group?.split(" ? ")[0];
  const wanted = ports.filter((port) => port.enabled !== false);
  let best: { score: number; presetId: string; name: string; ports: ConnectorPort[] } | null = null;

  for (const preset of CONNECTOR_PRESETS) {
    if (!preset.patch.profile_id || preset.id === "peg-cutout") continue;
    if (currentCategory && preset.category !== currentCategory) continue;
    const candidateSettings = presetSettings(preset);
    const candidatePorts = editablePorts(candidateSettings).filter((port) => port.enabled !== false);
    if (!candidatePorts.length) continue;

    const countCost = Math.abs(wanted.length - candidatePorts.length) * 80;
    let angleCost = 0;
    let levelCost = 0;
    for (const port of wanted) {
      let nearest = 180;
      let nearestLevelCost = 3;
      for (const candidate of candidatePorts) {
        const delta = Math.abs(((port.angle - candidate.angle + 540) % 360) - 180);
        if (delta < nearest) {
          nearest = delta;
          nearestLevelCost = port.level === candidate.level ? 0 : 1;
        }
      }
      angleCost += nearest;
      levelCost += nearestLevelCost;
    }
    angleCost /= Math.max(1, wanted.length);
    levelCost /= Math.max(1, wanted.length);
    const groupCost = currentGroup && preset.group?.split(" ? ")[0] === currentGroup ? 0 : 5;
    const score = countCost + angleCost * 1.6 + levelCost * 18 + groupCost;
    if (!best || score < best.score) {
      best = {
        score,
        presetId: String(preset.patch.profile_id),
        name: preset.name,
        ports: candidatePorts,
      };
    }
  }
  return best ? { presetId: best.presetId, name: best.name, ports: best.ports } : null;
}
