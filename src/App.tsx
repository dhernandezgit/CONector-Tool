import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  HelpCircle,
  Info,
  Moon,
  PanelTop,
  Rotate3D,
  Save,
  Sun,
  Trash2,
  View,
} from "lucide-react";
import type {
  BuildResult,
  ConnectorProject,
  ConnectorSettings,
  Preset,
  SimulatorScene,
} from "./types";
import { usePythonEngine } from "./hooks/usePythonEngine";
import {
  DEFAULT_CONNECTOR,
  PRESETS,
  settingsForPreset,
  starterScene,
} from "./data/presets";
import { deepMerge, downloadBlob, fmt, slug } from "./lib/utils";
import Logo from "./components/Logo";
import PresetGallery from "./components/PresetGallery";
import SettingsPanel from "./components/SettingsPanel";
import Viewport3D, { type ViewportHandle } from "./components/Viewport3D";
import ExportDialog from "./components/ExportDialog";
import HelpDialog from "./components/HelpDialog";
import AboutDialog from "./components/AboutDialog";
import StatusBar from "./components/StatusBar";
import Simulator from "./simulator/Simulator";

const THEME_KEY = "conector-theme";
const PROJECT_KEY = "conector-project-v4";
const PRESETS_KEY = "conector-user-presets-v2";

type Mode = "studio" | "simulator";
type Theme = "light" | "dark";

interface UserPreset {
  id: string;
  name: string;
  settings: ConnectorSettings;
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readUserPresets(): UserPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && item.settings && typeof item.settings === "object")
      .map((item) => ({
        id: String(item.id),
        name: String(item.name || "Mi preset"),
        settings: deepMerge(DEFAULT_CONNECTOR, item.settings),
      }));
  } catch {
    return [];
  }
}

function normalizeScene(raw: unknown): SimulatorScene {
  const base = starterScene();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<SimulatorScene>;
  const panels = Array.isArray(value.panels)
    ? value.panels
        .filter((panel) => panel && typeof panel.id === "string")
        .map((panel) => ({
          ...panel,
          kind: ["wire", "solid", "skadis", "foam"].includes(String(panel.kind)) ? panel.kind : "wire",
          width: Math.max(50, Number(panel.width) || 300),
          height: Math.max(50, Number(panel.height) || 300),
          x: Number(panel.x) || 0,
          y: Number(panel.y) || 0,
          z: Number(panel.z) || 0,
          rotation: Number(panel.rotation) || 0,
          color: /^#[0-9a-f]{6}$/i.test(String(panel.color)) ? panel.color : "#d4d8de",
        }))
    : base.panels;
  const joints = Array.isArray(value.joints)
    ? value.joints
        .filter((joint) => joint && typeof joint.id === "string")
        .map((joint) => ({
          ...joint,
          presetId: String(joint.presetId || "corner90"),
          x: Number(joint.x) || 0,
          y: Number(joint.y) || 0,
          z: Number(joint.z) || 0,
          rotation: Number(joint.rotation) || 0,
          scale: Math.max(0.4, Number(joint.scale) || 1),
          color: /^#[0-9a-f]{6}$/i.test(String(joint.color)) ? joint.color : "#ef6f5e",
        }))
    : base.joints;
  return {
    ...base,
    ...value,
    panels,
    joints,
    table: { ...base.table, ...(value.table || {}) },
    grid: Math.max(5, Number(value.grid) || base.grid),
  };
}

function loadProject(): ConnectorProject | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConnectorProject>;
    if (!parsed || !parsed.settings) return null;
    return {
      version: 1,
      name: String(parsed.name || "Mi puesto"),
      settings: deepMerge(DEFAULT_CONNECTOR, parsed.settings),
      scene: normalizeScene(parsed.scene),
      savedAt: String(parsed.savedAt || new Date().toISOString()),
      customPresets: [],
    };
  } catch {
    return null;
  }
}

export default function App() {
  const engine = usePythonEngine();
  const initial = useMemo(loadProject, []);
  const [settings, setSettings] = useState<ConnectorSettings>(
    initial ? initial.settings : settingsForPreset("corner90"),
  );
  const [scene, setScene] = useState<SimulatorScene>(initial ? initial.scene : starterScene());
  const [projectName, setProjectName] = useState(initial?.name || "Mi puesto de mercado");
  const [activePreset, setActivePreset] = useState<string | null>(initial ? null : "corner90");
  const [mode, setMode] = useState<Mode>("studio");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [userPresets, setUserPresets] = useState<UserPreset[]>(readUserPresets);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showBed, setShowBed] = useState(true);
  const [showDecor, setShowDecor] = useState(true);
  const viewportRef = useRef<ViewportHandle | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const buildSeq = useRef(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        const project: ConnectorProject = {
          version: 1,
          name: projectName,
          settings,
          scene,
          savedAt: new Date().toISOString(),
          customPresets: userPresets,
        };
        localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
        localStorage.setItem(PRESETS_KEY, JSON.stringify(userPresets));
      } catch {
        /* storage can be full or disabled */
      }
    }, 450);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [settings, scene, projectName, userPresets]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (mode !== "studio") {
      setBuilding(false);
      return;
    }
    if (!engine.ready) return;
    const seq = ++buildSeq.current;
    setBuilding(true);
    setBuildError("");
    const timer = window.setTimeout(() => {
      engine
        .build(settings)
        .then((result) => {
          if (seq !== buildSeq.current) return;
          setBuild(result);
        })
        .catch((error) => {
          if (seq !== buildSeq.current) return;
          setBuildError(String((error as Error)?.message || error));
        })
        .finally(() => {
          if (seq === buildSeq.current) setBuilding(false);
        });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [settings, engine.ready, engine.build, mode]);

  const selectPreset = (preset: Preset) => {
    setSettings(settingsForPreset(preset.id));
    setActivePreset(preset.id);
    setBuildError("");
    setMode("studio");
  };

  const updateSettings = (next: ConnectorSettings) => {
    setSettings(next);
    setActivePreset(null);
  };

  const selectedUserPreset = (preset: UserPreset) => {
    setSettings(deepMerge(DEFAULT_CONNECTOR, preset.settings));
    setActivePreset(null);
    setMode("studio");
    setToast(`Preset “${preset.name}” cargado`);
  };

  const saveAsPreset = () => {
    const name = window.prompt("Nombre del preset", settings.name || "Mi conector");
    if (!name) return;
    const entry: UserPreset = {
      id: `user_${Date.now().toString(36)}`,
      name: name.trim().slice(0, 60),
      settings,
    };
    setUserPresets((current) => [...current.filter((item) => item.name !== entry.name), entry]);
    setToast("Preset guardado en este navegador.");
  };

  const removeUserPreset = (id: string) => {
    setUserPresets((current) => current.filter((item) => item.id !== id));
  };

  const openCalibration = () => {
    setSettings(settingsForPreset("calibration"));
    setActivePreset("calibration");
    setMode("studio");
    setToast("Cupón de calibración listo: imprime y prueba los cinco canales.");
  };

  const saveProject = () => {
    const project: ConnectorProject = {
      version: 1,
      name: projectName,
      settings,
      scene,
      savedAt: new Date().toISOString(),
      customPresets: userPresets,
    };
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
      `${slug(projectName)}.conector`,
    );
    setToast("Proyecto descargado.");
  };

  const exportProject = () => {
    saveProject();
  };

  const importProjectFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ConnectorProject>;
      if (!parsed?.settings) throw new Error("El archivo no contiene ajustes de conector.");
      setSettings(deepMerge(DEFAULT_CONNECTOR, parsed.settings));
      setScene(normalizeScene(parsed.scene));
      setProjectName(String(parsed.name || "Proyecto importado"));
      if (Array.isArray(parsed.customPresets)) {
        setUserPresets(
          parsed.customPresets
            .filter((item) => item && item.settings)
            .map((item) => ({
              id: String(item.id || `user_${Math.random().toString(36).slice(2)}`),
              name: String(item.name || "Preset importado"),
              settings: deepMerge(DEFAULT_CONNECTOR, item.settings),
            })),
        );
      }
      setActivePreset(null);
      setMode("studio");
      setToast("Proyecto importado.");
    } catch (error) {
      setToast(`No se pudo importar: ${String((error as Error)?.message || error)}`);
    }
  };

  const export3mf = async () => {
    if (!engine.ready) throw new Error("El motor Python todavía está cargando.");
    await engine.export3mf(settings, slug(settings.name || projectName));
    setToast("3MF descargado.");
  };

  const exportKit = async (
    items: Array<{ settings: ConnectorSettings; quantity: number }>,
    name: string,
  ) => {
    await engine.exportKit(items, name);
    setToast("Kit 3MF descargado.");
  };

  const saveScene = () => {
    setToast("Puesto guardado en este navegador.");
  };

  const openJointInStudio = (joint: ConnectorSettings) => {
    setSettings(joint);
    setActivePreset(null);
    setMode("studio");
    setToast("Unión cargada en el estudio.");
  };

  const ready = engine.ready;

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <div className="project-name">
          <span className="eyebrow">Proyecto</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label="Nombre del proyecto"
          />
        </div>
        <div className="mode-switch">
          <button type="button" className={mode === "studio" ? "active" : ""} onClick={() => setMode("studio")}>
            <Rotate3D size={16} /> Estudio
          </button>
          <button type="button" className={mode === "simulator" ? "active" : ""} onClick={() => setMode("simulator")}>
            <PanelTop size={16} /> Puesto 3D
          </button>
        </div>
        <div className="topbar-actions">
          <input
            ref={projectInputRef}
            type="file"
            accept=".conector,.json,application/json"
            hidden
            onChange={(event) => {
              void importProjectFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button type="button" className="icon-text-button" onClick={() => projectInputRef.current?.click()} title="Importar proyecto">
            <FolderOpen size={16} /> <span>Importar</span>
          </button>
          <button type="button" className="icon-text-button" onClick={saveProject} title="Descargar proyecto">
            <Save size={16} /> <span>Guardar</span>
          </button>
          <button type="button" className="primary-button" onClick={() => setExportOpen(true)} disabled={!build || building}>
            <Download size={16} /> Exportar
          </button>
          <button type="button" className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} title="Cambiar tema">
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button type="button" className="icon-button" onClick={() => setHelpOpen(true)} title="Ayuda">
            <HelpCircle size={17} />
          </button>
          <button type="button" className="icon-button" onClick={() => setAboutOpen(true)} title="Acerca de">
            <Info size={17} />
          </button>
        </div>
      </header>

      {mode === "studio" ? (
        <div className="workspace">
          <aside className="left-rail">
            <PresetGallery presets={PRESETS} activeId={activePreset} onSelect={selectPreset} onOpenHelp={() => setHelpOpen(true)} />
            <div className="user-presets">
              <div className="left-block-head">
                <div>
                  <span className="eyebrow">Tu biblioteca</span>
                  <h3>Mis diseños</h3>
                </div>
                <button type="button" className="icon-button" onClick={saveAsPreset} title="Guardar preset actual">
                  <Save size={15} />
                </button>
              </div>
              {userPresets.length === 0 && <p className="muted-copy">Guarda una configuración para reutilizarla.</p>}
              {userPresets.map((preset) => (
                <div className="user-preset-row" key={preset.id}>
                  <button type="button" onClick={() => selectedUserPreset(preset)}>
                    <span className="user-preset-dot" style={{ background: preset.settings.decor.color }} />
                    <span>
                      <strong>{preset.name}</strong>
                      <small>
                        {preset.settings.family} · {preset.settings.decor.shape}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button danger ghost"
                    onClick={() => removeUserPreset(preset.id)}
                    title="Eliminar preset"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="left-foot">
              <button type="button" className="secondary-button wide" onClick={openCalibration}>
                <View size={15} /> Cupón de calibración
              </button>
              <p>El motor Python se ejecuta en tu navegador. Nada sale de tu equipo.</p>
            </div>
          </aside>

          <main className="center-stage">
            <div className="viewport-toolbar">
              <div className="tool-group">
                <button type="button" className="tool-button" onClick={() => viewportRef.current?.setView("iso")} title="Vista isométrica">
                  <Rotate3D size={16} />
                </button>
                <button type="button" className="tool-button" onClick={() => viewportRef.current?.setView("front")} title="Vista frontal">
                  <PanelTop size={16} />
                </button>
                <button type="button" className="tool-button" onClick={() => viewportRef.current?.setView("top")} title="Vista superior">
                  <View size={16} />
                </button>
                <button type="button" className="tool-button text" onClick={() => viewportRef.current?.setView("fit")} title="Encuadrar">
                  Encuadrar
                </button>
              </div>
              <div className="tool-group">
                <button
                  type="button"
                  className={`tool-button text${showBed ? " active" : ""}`}
                  onClick={() => setShowBed((value) => !value)}
                >
                  Cama
                </button>
                <button
                  type="button"
                  className={`tool-button text${showDecor ? " active" : ""}`}
                  onClick={() => setShowDecor((value) => !value)}
                >
                  Placa
                </button>
                <button
                  type="button"
                  className={`tool-button text${autoRotate ? " active" : ""}`}
                  onClick={() => setAutoRotate((value) => !value)}
                >
                  Girar
                </button>
              </div>
            </div>
            <div className="center-viewport">
              <Viewport3D
                ref={viewportRef}
                build={build}
                building={building}
                error={buildError}
                showBed={showBed}
                showDecor={showDecor}
                autoRotate={autoRotate}
                bedWidth={settings.print.bed_width}
                bedDepth={settings.print.bed_depth}
              />
              {!ready && (
                <div className="engine-boot">
                  <div className="boot-spinner" />
                  <strong>Preparando Python</strong>
                  <span>{engine.progressText}</span>
                  <div className="boot-progress">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <i key={step} className={engine.progressStep >= step ? "on" : ""} />
                    ))}
                  </div>
                  {engine.engineError && (
                    <button type="button" className="secondary-button" onClick={engine.restart}>
                      Reintentar motor
                    </button>
                  )}
                </div>
              )}
            </div>
            {build && (
              <div className="center-meta">
                <span className="meta-pill">{build.parts.length} pieza{build.parts.length === 1 ? "" : "s"}</span>
                <span className="meta-pill">{fmt(build.material_grams, 1)} g</span>
                <span className="meta-pill">
                  {build.checks.length ? `${build.checks.length} aviso${build.checks.length === 1 ? "" : "s"}` : "lista para imprimir"}
                </span>
                <span className="meta-spacer" />
                <span className="meta-muted">Preset: {activePreset ? PRESETS.find((p) => p.id === activePreset)?.name : "personalizado"}</span>
              </div>
            )}
          </main>

          <SettingsPanel
            settings={settings}
            build={build}
            onChange={updateSettings}
            onAnalyzeShape={engine.analyzeFile}
            onCalibration={openCalibration}
            onSavePreset={saveAsPreset}
            onOpenHelp={() => setHelpOpen(true)}
          />
        </div>
      ) : (
        <Simulator
          scene={scene}
          onChange={setScene}
          engineReady={ready}
          exportKit={exportKit}
          onBack={() => setMode("studio")}
          onEditJoint={openJointInStudio}
          projectName={projectName}
          savedPresets={userPresets}
          onSaveScene={saveScene}
        />
      )}

      <StatusBar build={build} building={building} engineReady={ready} progressText={engine.progressText} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        build={build}
        settings={settings}
        engineReady={ready}
        onExport3mf={export3mf}
        onExportProject={exportProject}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
