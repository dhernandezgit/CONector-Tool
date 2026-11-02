import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, HelpCircle, Info, List, Moon, Save, Sparkles, Sun, Upload } from "lucide-react";
import Logo from "./components/Logo";
import HelpDialog from "./components/HelpDialog";
import AboutDialog from "./components/AboutDialog";
import AlleySandbox from "./alley/AlleySandbox";
import BomDialog from "./alley/BomDialog";
import { loadScene, saveScene, sceneFileName, sceneFromJson, sceneToJson } from "./alley/scene";
import { downloadBlob } from "./lib/utils";
import type { AlleyScene } from "./alley/types";

const THEME_KEY = "conector-theme";

type Theme = "light" | "dark";

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo."));
    reader.readAsText(file, "utf-8");
  });
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return "light";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    notify("Guardado en este navegador. Para crear un archivo usa Descargar.");
  }, [notify, projectName, scene]);

  const downloadProject = useCallback(() => {
    try {
      const filename = sceneFileName(projectName);
      const blob = new Blob([sceneToJson(scene, projectName)], {
        type: "application/json;charset=utf-8",
      });
      if (!downloadBlob(blob, filename)) {
        notify("No se pudo iniciar la descarga del archivo.");
        return;
      }
      notify(`Descargado "${filename}". Puedes abrirlo con Importar.`);
    } catch {
      notify("No se pudo preparar el archivo del puesto.");
    }
  }, [notify, projectName, scene]);

  const importProject = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const next = sceneFromJson(text);
        changeScene(next);
        setProjectName(next.name);
        setBomOpen(false);
        notify(`Proyecto "${next.name}" importado.`);
      } catch (error) {
        notify(error instanceof Error ? error.message : "No se pudo abrir el archivo.");
      }
    },
    [changeScene, notify],
  );

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
          <button
            type="button"
            className="icon-text-button"
            onClick={downloadProject}
            title="Descargar una copia del puesto como archivo JSON; después se puede abrir con Importar"
          >
            <Download size={16} /> <span>Descargar</span>
          </button>
          <button
            type="button"
            className="icon-text-button"
            onClick={() => fileInputRef.current?.click()}
            title="Importar un archivo JSON descargado de CONector Tool"
          >
            <Upload size={16} /> <span>Importar</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json,text/json" hidden onChange={importProject} />
          <button
            type="button"
            className="icon-text-button"
            onClick={saveNow}
            title="Guardar ahora en este navegador (no descarga ningún archivo)"
          >
            <Save size={16} /> <span>Guardar local</span>
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
