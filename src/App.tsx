import { useCallback, useEffect, useRef, useState } from "react";
import { HelpCircle, Info, List, Moon, Save, Sparkles, Sun } from "lucide-react";
import Logo from "./components/Logo";
import HelpDialog from "./components/HelpDialog";
import AboutDialog from "./components/AboutDialog";
import AlleySandbox from "./alley/AlleySandbox";
import BomDialog from "./alley/BomDialog";
import { loadScene, saveScene } from "./alley/scene";
import type { AlleyScene } from "./alley/types";

const THEME_KEY = "conector-theme";

type Theme = "light" | "dark";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [scene, setScene] = useState<AlleyScene>(() => loadScene());
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [past, setPast] = useState<AlleyScene[]>([]);
  const [future, setFuture] = useState<AlleyScene[]>([]);
  const [projectName, setProjectName] = useState(scene.name);
  const [bomOpen, setBomOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState("");

  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    setProjectName(scene.name);
  }, [scene.name]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveScene({ ...scene, name: projectName });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [scene, projectName]);

  const changeScene = useCallback((next: AlleyScene) => {
    const current = sceneRef.current;
    if (next === current) return;
    setPast((items) => [...items.slice(-59), current]);
    setFuture([]);
    setScene(next);
  }, []);

  const undo = useCallback(() => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([sceneRef.current, ...future].slice(0, 60));
    setScene(previous);
  }, [future, past]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setPast([...past.slice(-59), sceneRef.current]);
    setFuture(future.slice(1));
    setScene(next);
  }, [future, past]);

  const commitName = useCallback(() => {
    const name = projectName.trim() || "Mi puesto Artist Alley";
    setProjectName(name);
    if (name !== scene.name) changeScene({ ...scene, name });
  }, [changeScene, projectName, scene]);

  const saveNow = useCallback(() => {
    saveScene({ ...scene, name: projectName });
    notify("Puesto guardado en este navegador.");
  }, [notify, projectName, scene]);

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <div className="project-name">
          <span className="eyebrow">Puesto</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Nombre del puesto"
          />
        </div>
        <div className="alley-brand-pill">
          <Sparkles size={14} />
          <span>
            Sandbox Artist Alley
            <small>Diseño del pack: Jessie Shi · Sandoik</small>
          </span>
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-text-button" onClick={saveNow} title="Guardar en este navegador">
            <Save size={16} /> <span>Guardar</span>
          </button>
          <button type="button" className="primary-button" onClick={() => setBomOpen(true)}>
            <List size={16} /> Lista de materiales
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title="Cambiar tema"
          >
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

      <AlleySandbox
        scene={scene}
        projectName={projectName}
        onChange={changeScene}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onOpenBom={() => setBomOpen(true)}
        onToast={notify}
      />

      <BomDialog open={bomOpen} scene={scene} projectName={projectName} onClose={() => setBomOpen(false)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
