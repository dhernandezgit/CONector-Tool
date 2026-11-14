import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  FileJson,
  Layers3,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import Viewport3D, { type ViewportHandle } from "./components/Viewport3D";
import SettingsPanel from "./components/SettingsPanel";
import ExportDialog from "./components/ExportDialog";
import { Segmented } from "./components/UI";
import { usePythonEngine } from "./hooks/usePythonEngine";
import { CONNECTOR_PRESETS, presetSettings } from "./data/connectorPresets";
import { DEFAULT_CONNECTOR } from "./data/presets";
import { deepMerge, downloadBlob, slug } from "./lib/utils";
import { customConnectorFromSettings, type CustomConnectorDefinition } from "./lib/connectorLibrary";
import type { BuildResult, ConnectorSettings, Preset, ShapeAnalysis } from "./types";

type GroupMode = "type" | "connections";

interface Props {
  onToast: (message: string) => void;
  customConnectors: CustomConnectorDefinition[];
  onSaveCustomConnector: (definition: CustomConnectorDefinition) => void;
  onOpenHelp: () => void;
}

const STUDIO_KEY = "conector-studio-settings-v1";
const SAVED_PRESETS_KEY = "conector-studio-presets-v1";

function loadStudioSettings(): ConnectorSettings {
  try {
    const raw = localStorage.getItem(STUDIO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const merged = deepMerge(DEFAULT_CONNECTOR, parsed);
        if (merged.family === "template") merged.family = "node";
        return merged;
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONNECTOR, name: "Conector personalizado" };
}

function loadSavedPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(SAVED_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.patch) : [];
  } catch {
    return [];
  }
}

function typeGroup(preset: Preset): string {
  if (preset.id.startsWith("edge")) return "Edge";
  if (preset.id.startsWith("angled")) return "Angulados";
  if (preset.id.startsWith("leg")) return "Patas";
  if (preset.id === "connector-360") return "Nodos · 360°";
  if (preset.id.startsWith("connector-flat")) return "Nodos planos";
  if (preset.id.startsWith("connector")) return "Nodos";
  return preset.category;
}

function presetConnectionCount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (value.includes("360")) return 4;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function connectionGroup(preset: Preset): string {
  const value = preset.connections || "—";
  if (value === "0") return "Calibración";
  if (value === "360°") return "360°";
  if (value.includes("pata")) return value;
  return `${value} conexión${value === "1" ? "" : "es"}`;
}

function groupPresets(presets: Preset[], mode: GroupMode): Array<[string, Preset[]]> {
  const map = new Map<string, Preset[]>();
  for (const preset of presets) {
    const group = mode === "type" ? typeGroup(preset) : connectionGroup(preset);
    const list = map.get(group) || [];
    list.push(preset);
    map.set(group, list);
  }
  const order = mode === "type"
    ? ["Edge", "Nodos", "Nodos · 360°", "Nodos planos", "Angulados", "Patas", "Calibración"]
    : ["1 conexión", "2 conexiones", "3 conexiones", "4 conexiones", "5 conexiones", "7 conexiones", "360°", "1 pata", "1 pata · 30°", "1 pata · 45°", "Calibración"];
  return [...map.entries()].sort(([a], [b]) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
  });
}

function presetIcon(preset: Preset) {
  const icon = preset.icon;
  if (icon === "edge" || icon === "flat") return <Layers3 size={15} />;
  if (icon === "split") return <Sparkles size={15} />;
  if (icon === "ruler") return <Check size={15} />;
  return <Layers3 size={15} />;
}

export default function ConnectorStudio({ onToast, customConnectors, onSaveCustomConnector, onOpenHelp }: Props) {
  const [settings, setSettings] = useState<ConnectorSettings>(loadStudioSettings);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("type");
  const [savedPresets, setSavedPresets] = useState<Preset[]>(loadSavedPresets);
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [showBed, setShowBed] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<ViewportHandle | null>(null);
  const buildSeq = useRef(0);
  const engine = usePythonEngine();
  const engineReady = engine.ready;
  const engineBuild = engine.build;

  useEffect(() => {
    try {
      localStorage.setItem(STUDIO_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => {
    if (!engineReady) return;
    const seq = ++buildSeq.current;
    setBuilding(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const result = await engineBuild(settings);
        if (seq === buildSeq.current) setBuild(result);
      } catch (err) {
        if (seq === buildSeq.current) {
          setBuild(null);
          setError(String((err as Error)?.message || err));
        }
      } finally {
        if (seq === buildSeq.current) setBuilding(false);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [engineBuild, engineReady, settings]);

  const groups = useMemo(
    () => groupPresets([...CONNECTOR_PRESETS, ...savedPresets], groupMode),
    [groupMode, savedPresets],
  );

  const selectPreset = useCallback((preset: Preset) => {
    setActivePreset(preset.id);
    setSettings({ ...presetSettings(preset), name: preset.name });
  }, []);

  const savePreset = useCallback(() => {
    const preset: Preset = {
      id: `custom_${Date.now().toString(36)}`,
      name: settings.name || "Mi conector",
      description: "Preset guardado desde el estudio.",
      category: "Personalizado",
      group: "Personalizados",
      icon: "sliders",
      accent: settings.body_color,
      patch: settings,
    };
    const next = [preset, ...savedPresets];
    setSavedPresets(next);
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    onToast("Preset guardado en el estudio.");
  }, [onToast, savedPresets, settings]);

  const saveToBooth = useCallback(() => {
    const profilePreset = CONNECTOR_PRESETS.find((preset) => preset.patch.profile_id === settings.profile_id);
    const profileConnections = presetConnectionCount(profilePreset?.connections);
    const definition = customConnectorFromSettings(
      settings,
      settings.name || "Conector personalizado",
      build?.dimensions,
      profileConnections,
    );
    onSaveCustomConnector(definition);
    onToast(`"${definition.name}" guardado. Ya puedes asignarlo a una unión en Artist Alley.`);
  }, [build?.dimensions, onSaveCustomConnector, onToast, settings]);

  const exportProject = useCallback(() => {
    const payload = {
      kind: "conector-tool-connector",
      version: 1,
      savedAt: new Date().toISOString(),
      settings,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
      `${slug(settings.name || "conector")}.conector.json`,
    );
  }, [settings]);

  const importProject = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data?.settings) throw new Error("El archivo no contiene un conector.");
        const next = deepMerge(DEFAULT_CONNECTOR, data.settings);
        if (next.family === "template") next.family = "node";
        setSettings(next);
        setActivePreset(null);
        onToast("Proyecto de conector importado.");
      } catch (err) {
        onToast(String((err as Error)?.message || err));
      }
    },
    [onToast],
  );

  const dimensions = build?.dimensions;
  const engineLabel = engine.status === "ready" ? "Motor listo" : engine.status === "error" ? "Motor con error" : "Cargando motor";

  return (
    <div className="connector-studio">
      <div className="workspace">
        <aside className="left-rail connector-preset-rail">
          <div className="preset-heading">
            <div>
              <span className="eyebrow">Biblioteca</span>
              <h2>Conectores</h2>
            </div>
            <span className="count-pill">{CONNECTOR_PRESETS.length + savedPresets.length}</span>
          </div>
          <Segmented
            small
            value={groupMode}
            options={[
              { value: "type", label: "Por tipo" },
              { value: "connections", label: "Por conexiones" },
            ]}
            onChange={(value) => setGroupMode(value as GroupMode)}
          />
          <div className="studio-preset-groups">
            {groups.map(([group, presets]) => (
              <section className="studio-preset-group" key={group}>
                <h3>{group}</h3>
                <div className="preset-grid">
                  {presets.map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      className={`preset-card${activePreset === preset.id ? " active" : ""}`}
                      onClick={() => selectPreset(preset)}
                      title={preset.description}
                    >
                      <span className="preset-icon" style={{ color: preset.accent || "var(--accent)" }}>
                        {presetIcon(preset)}
                      </span>
                      <span className="preset-copy">
                        <strong>{preset.name}</strong>
                        <small>{preset.description}</small>
                      </span>
                      <span className="preset-dot" style={{ background: preset.accent || "var(--accent)" }} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {customConnectors.length > 0 && (
            <section className="studio-saved-connectors">
              <span className="eyebrow">En el puesto</span>
              <h3>{customConnectors.length} conectores guardados</h3>
              <p className="micro-copy">Asígnalos desde una unión del sandbox.</p>
            </section>
          )}
        </aside>

        <main className="center-stage connector-studio-stage">
          <div className="viewport-toolbar">
            <div className="studio-title">
              <span className="eyebrow">Diseño paramétrico</span>
              <input className="studio-name-input" value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} aria-label="Nombre del conector" />
              <small>{engineLabel}{engine.engineError ? ` · ${engine.engineError}` : ""}</small>
            </div>
            <div className="studio-actions">
              <button type="button" className="icon-button" onClick={() => viewportRef.current?.setView("fit")} title="Encuadrar">
                <Layers3 size={16} />
              </button>
              <button type="button" className="icon-button" onClick={() => viewportRef.current?.setView("top")} title="Vista superior">
                <Check size={16} />
              </button>
              <button type="button" className="secondary-button" onClick={savePreset}>
                <Save size={15} /> Preset
              </button>
              <button type="button" className="primary-button" onClick={saveToBooth}>
                <Sparkles size={15} /> Usar en el puesto
              </button>
              <button type="button" className="secondary-button" onClick={() => setExportOpen(true)} disabled={!build}>
                <Download size={15} /> Exportar
              </button>
            </div>
          </div>

          <div className="studio-canvas">
            <Viewport3D
              ref={viewportRef}
              build={build}
              building={building}
              error={error}
              showBed={showBed}
              showDecor
              autoRotate={false}
            />
            <div className="studio-view-toggle">
              <Segmented
                small
                value={showBed ? "bed" : "clean"}
                options={[
                  { value: "bed", label: "Cama" },
                  { value: "clean", label: "Limpio" },
                ]}
                onChange={(value) => setShowBed(value === "bed")}
              />
            </div>
          </div>

          <div className="studio-metrics">
            <div><span>Dimensiones</span><strong>{dimensions ? `${dimensions.width.toFixed(1)} × ${dimensions.depth.toFixed(1)} × ${dimensions.height.toFixed(1)} mm` : "—"}</strong></div>
            <div><span>Volumen</span><strong>{build ? `${(build.parts.reduce((sum, part) => sum + part.volume, 0) / 1000).toFixed(1)} cm³` : "—"}</strong></div>
            <div><span>Malla</span><strong>{build ? `${build.parts.reduce((sum, part) => sum + part.triangles, 0).toLocaleString("es-ES")} tris` : "—"}</strong></div>
            <div><span>Estado</span><strong className={build && build.parts.every((part) => part.watertight) ? "ok" : ""}>{build ? (build.parts.every((part) => part.watertight) ? "Estanca" : "Revisar") : "Pendiente"}</strong></div>
          </div>
        </main>

        <SettingsPanel
          settings={settings}
          build={build}
          onChange={setSettings}
          onAnalyzeShape={async (file): Promise<ShapeAnalysis> => {
            const result = await engine.analyzeFile(file);
            return result;
          }}
          onCalibration={() => setSettings({ ...settings, family: "calibration", calibration_mode: "wire" })}
          onSavePreset={savePreset}
          onOpenHelp={onOpenHelp}
        />
      </div>

      <input
        ref={projectInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void importProject(file);
        }}
      />
      <div className="studio-project-actions">
        <button type="button" className="link-button" onClick={() => projectInputRef.current?.click()}>
          <Upload size={13} /> Importar proyecto de conector
        </button>
        <button type="button" className="link-button" onClick={exportProject}>
          <FileJson size={13} /> Guardar proyecto .json
        </button>
        <span className="studio-project-hint">
          {build && build.parts.length ? `${build.parts.length} pieza${build.parts.length === 1 ? "" : "s"} imprimible${build.parts.length === 1 ? "" : "s"}` : "Sin geometría generada"}
        </span>
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        build={build}
        settings={settings}
        engineReady={engine.ready}
        onExport3mf={async () => {
          await engine.export3mf(settings, settings.name || "conector");
        }}
        onExportProject={exportProject}
      />
    </div>
  );
}
