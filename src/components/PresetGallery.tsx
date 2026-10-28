import { useMemo, useState } from "react";
import {
  Box,
  Boxes,
  CircleDot,
  Diameter,
  GitBranch,
  Grid2X2,
  Layers3,
  Move3D,
  PanelTop,
  Ruler,
  Shell,
  SlidersHorizontal,
  Sparkles,
  Split,
  Table2,
  Unplug,
  Webhook,
} from "lucide-react";
import type { Preset } from "../types";

const ICONS: Record<string, JSX.Element> = {
  corner: <GitBranch size={19} />,
  cube: <Boxes size={19} />,
  tee: <GitBranch size={19} />,
  cross: <Grid2X2 size={19} />,
  six: <Box size={19} />,
  flat: <PanelTop size={19} />,
  ring: <CircleDot size={19} />,
  angle: <Diameter size={19} />,
  sliders: <SlidersHorizontal size={19} />,
  leg: <Move3D size={19} />,
  table: <Table2 size={19} />,
  edge: <PanelTop size={19} />,
  plate: <Layers3 size={19} />,
  hook: <Webhook size={19} />,
  peg: <Unplug size={19} />,
  split: <Split size={19} />,
  ruler: <Ruler size={19} />,
  base: <Boxes size={19} />,
  decor: <Sparkles size={19} />,
};

const CATEGORIES = ["Todos", "Bases exactas", "Estructura", "Ángulos", "Patas", "Especiales", "Decorados", "Herramientas"] as const;

export default function PresetGallery({
  presets,
  activeId,
  onSelect,
  onOpenHelp,
}: {
  presets: Preset[];
  activeId: string | null;
  onSelect: (preset: Preset) => void;
  onOpenHelp?: () => void;
}) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Todos");
  const filtered = useMemo(
    () => (category === "Todos" ? presets : presets.filter((preset) => preset.category === category)),
    [presets, category],
  );
  return (
    <div className="preset-panel">
      <div className="preset-heading">
        <div>
          <span className="eyebrow">Biblioteca</span>
          <h2>Presets</h2>
        </div>
        <span className="count-pill">{presets.length}</span>
      </div>
      <div className="preset-categories" role="tablist" aria-label="Categorías de presets">
        {CATEGORIES.map((item) => (
          <button
            type="button"
            key={item}
            className={item === category ? "chip active" : "chip"}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="preset-grid">
        {filtered.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className={`preset-card${activeId === preset.id ? " active" : ""}`}
            onClick={() => onSelect(preset)}
            title={preset.description}
          >
            <span className="preset-icon" style={{ color: preset.accent || "var(--accent)" }}>
              {ICONS[preset.icon] || <Shell size={19} />}
            </span>
            <span className="preset-copy">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
            <span className="preset-dot" style={{ background: preset.accent || "var(--accent)" }} />
          </button>
        ))}
      </div>
      <div className="preset-foot">
        <button type="button" className="text-button" onClick={onOpenHelp}>
          Cómo elegir un preset
        </button>
        <span className="kbd-hint">Actualización en vivo</span>
      </div>
    </div>
  );
}
