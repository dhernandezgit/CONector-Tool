import type { ConnectorSettings } from "../types";

export interface CustomConnectorDefinition {
  id: string;
  name: string;
  settings: ConnectorSettings;
  color: string;
  bodySize: number;
  bodyHeight: number;
  ports: number;
  createdAt: number;
}

const STORAGE_KEY = "conector-custom-connectors-v1";
const MAX_ITEMS = 80;

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function loadCustomConnectors(): CustomConnectorDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === "string" && entry.settings)
      .slice(0, MAX_ITEMS)
      .map((entry) => ({
        id: String(entry.id),
        name: String(entry.name || "Conector personalizado"),
        settings: entry.settings as ConnectorSettings,
        color: typeof entry.color === "string" ? entry.color : "#e98da6",
        bodySize: safeNumber(entry.bodySize, 37),
        bodyHeight: safeNumber(entry.bodyHeight, 26),
        ports: safeNumber(entry.ports, 4),
        createdAt: safeNumber(entry.createdAt, Date.now()),
      }));
  } catch {
    return [];
  }
}

export function saveCustomConnector(def: CustomConnectorDefinition): CustomConnectorDefinition[] {
  const next = [def, ...loadCustomConnectors().filter((entry) => entry.id !== def.id)].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage can be disabled */
  }
  return next;
}

export function removeCustomConnector(id: string): CustomConnectorDefinition[] {
  const next = loadCustomConnectors().filter((entry) => entry.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function customConnectorFromSettings(
  settings: ConnectorSettings,
  name = settings.name || "Conector personalizado",
): CustomConnectorDefinition {
  return {
    id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    settings,
    color: settings.body_color || "#e98da6",
    bodySize: settings.body_size,
    bodyHeight: settings.body_height,
    ports: settings.horizontal_ports.length + settings.vertical_ports.length,
    createdAt: Date.now(),
  };
}
