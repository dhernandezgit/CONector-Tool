import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Boxes,
  Camera,
  ChevronLeft,
  Copy,
  Download,
  Grid2X2,
  ImageDown,
  LayoutTemplate,
  Maximize,
  MousePointer2,
  PanelTop,
  Plus,
  RotateCw,
  Ruler,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type {
  ConnectorSettings,
  SimJoint,
  SimPanel,
  SimPanelKind,
  SimulatorScene,
} from "../types";
import { JOINT_PRESET_OPTIONS, PANEL_SIZE_OPTIONS, PANEL_TYPE_OPTIONS, settingsForJoint } from "../data/presets";
import { cm, downloadBlob, fmt, slug } from "../lib/utils";
import { NumberField, ColorField, Segmented, SelectField, Toggle } from "../components/UI";
import SimulatorViewport, { type SimSelection, type SimulatorViewportHandle } from "./SimulatorViewport";
import { JOINT_COLORS, PANEL_COLORS, jointBom, kitItems, nearestConnectionPoint, newJoint, newPanel, pruneJoints, sceneBounds, sceneConnectionPoints, sceneTemplate, snapJointsToPanels } from "./data";

interface Props {
  scene: SimulatorScene;
  onChange: (scene: SimulatorScene) => void;
  engineReady: boolean;
  exportKit: (items: Array<{ settings: ConnectorSettings; quantity: number }>, name: string) => Promise<unknown>;
  onBack: () => void;
  onEditJoint: (settings: ConnectorSettings) => void;
  projectName: string;
  savedPresets: Array<{ id: string; name: string; settings: ConnectorSettings }>;
  onSaveScene: () => void;
}

export default function Simulator({
  scene,
  onChange,
  engineReady,
  exportKit,
  onBack,
  onEditJoint,
  projectName,
  savedPresets,
  onSaveScene,
}: Props) {
  const [selection, setSelection] = useState<SimSelection>(null);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const viewportRef = useRef<SimulatorViewportHandle | null>(null);

  const selectedPanel = selection?.type === "panel" ? scene.panels.find((panel) => panel.id === selection.id) : undefined;
  const selectedJoint = selection?.type === "joint" ? scene.joints.find((joint) => joint.id === selection.id) : undefined;
  const bounds = useMemo(() => sceneBounds(scene), [scene]);
  const bom = useMemo(() => jointBom(scene), [scene]);

  const setPanel = (id: string, patch: Partial<SimPanel>) => {
    const panels = scene.panels.map((panel) => (panel.id === id ? { ...panel, ...patch } : panel));
    onChange(snapJointsToPanels({ ...scene, panels }));
  };
  const setJoint = (id: string, patch: Partial<SimJoint>) => {
    let next = scene.joints.find((joint) => joint.id === id);
    if (!next) return;
    next = { ...next, ...patch };
    if ("x" in patch || "y" in patch || "z" in patch) {
      const snap = nearestConnectionPoint(scene, next.x, next.y, next.z, 420);
      if (snap) next = { ...next, ...snap };
    }
    onChange({ ...scene, joints: scene.joints.map((joint) => (joint.id === id ? next! : joint)) });
  };

  const rotatePanel = (id: string, delta: number) => {
    const panel = scene.panels.find((item) => item.id === id);
    if (!panel) return;
    const rotation = ((((panel.rotation + delta) % 360) + 540) % 360) - 180;
    setPanel(id, { rotation });
  };

  const addPanel = (kind: SimPanelKind = "wire") => {
    const panel = newPanel(0, 0, kind);
    const number = scene.panels.length + 1;
    panel.name = `Panel ${number}`;
    panel.x = Math.round((scene.panels.length % 3) * 160 - 160);
    onChange({ ...scene, panels: [...scene.panels, panel] });
    setSelection({ type: "panel", id: panel.id });
  };

  const addJoint = () => {
    if (!scene.panels.length) {
      setMessage("Añade un panel primero: las uniones solo pueden ir en sus puntos.");
      return;
    }
    const points = sceneConnectionPoints(scene);
    const free = points.find(
      (point) =>
        !scene.joints.some(
          (joint) => Math.abs(joint.x - point.x) < 2 && Math.abs(joint.y - point.y) < 2 && Math.abs(joint.z - point.z) < 2,
        ),
    );
    if (!free) {
      setMessage("Todos los puntos de panel ya tienen unión. Añade o mueve paneles para crear más.");
      return;
    }
    const joint = newJoint(free.x, free.y, free.z, "ref_esquina_90");
    joint.name = `Unión ${scene.joints.length + 1}`;
    onChange({ ...scene, joints: [...scene.joints, joint] });
    setSelection({ type: "joint", id: joint.id });
    setMessage("");
  };

  const duplicate = () => {
    if (selectedPanel) {
      const copy = { ...selectedPanel, id: `panel_${Date.now().toString(36)}`, x: selectedPanel.x + 30, name: `${selectedPanel.name} copia` };
      onChange(snapJointsToPanels({ ...scene, panels: [...scene.panels, copy] }));
      setSelection({ type: "panel", id: copy.id });
    } else if (selectedJoint) {
      const points = sceneConnectionPoints(scene);
      const free = points.find(
        (point) =>
          !scene.joints.some(
            (joint) => Math.abs(joint.x - point.x) < 2 && Math.abs(joint.y - point.y) < 2 && Math.abs(joint.z - point.z) < 2,
          ),
      );
      if (!free) {
        setMessage("No quedan puntos libres para otra unión.");
        return;
      }
      const copy = { ...selectedJoint, id: `joint_${Date.now().toString(36)}`, ...free, name: `${selectedJoint.name} copia` };
      onChange({ ...scene, joints: [...scene.joints, copy] });
      setSelection({ type: "joint", id: copy.id });
    }
  };

  const remove = () => {
    if (selectedPanel) {
      const next = { ...scene, panels: scene.panels.filter((panel) => panel.id !== selectedPanel.id) };
      onChange(pruneJoints(next));
      setSelection(null);
    } else if (selectedJoint) {
      onChange({ ...scene, joints: scene.joints.filter((joint) => joint.id !== selectedJoint.id) });
      setSelection(null);
    }
  };

  const exportJson = () => {
    const payload = {
      version: 1,
      name: projectName,
      kind: "conector-tool-scene",
      scene,
      savedAt: new Date().toISOString(),
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `${slug(projectName)}-puesto.json`,
    );
  };

  const exportPng = () => {
    const url = viewportRef.current?.screenshot();
    if (!url) return;
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => downloadBlob(blob, `${slug(projectName)}-puesto.png`))
      .catch(() => setMessage("No se pudo guardar la captura."));
  };

  const exportTheKit = async () => {
    if (!engineReady) {
      setMessage("El motor Python todavía está cargando.");
      return;
    }
    if (!scene.joints.length) {
      setMessage("Añade al menos una unión para generar el kit.");
      return;
    }
    setBusy("Preparando 3MF…");
    setMessage("");
    try {
      await exportKit(kitItems(scene), `kit-${slug(projectName)}`);
      setMessage("Kit 3MF descargado. Incluye los conectores repetidos por cantidad.");
    } catch (error) {
      setMessage(String((error as Error)?.message || error));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (!selectedPanel) return;
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        rotatePanel(selectedPanel.id, event.shiftKey ? -15 : 15);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPanel, scene]);

  return (
    <div className="simulator">
      <aside className="sim-left">
        <div className="sim-left-head">
          <button type="button" className="back-link" onClick={onBack}>
            <ChevronLeft size={15} /> Estudio
          </button>
          <span className="eyebrow">Puesto 3D</span>
          <h2>Editor libre</h2>
          <p>Coloca paneles y uniones, selecciona cada pieza y ajusta su color.</p>
        </div>

        <div className="sim-actions">
          <button type="button" className="primary-button" onClick={() => addPanel("wire")}>
            <Plus size={16} /> Panel
          </button>
          <button type="button" className="secondary-button" onClick={addJoint}>
            <Plus size={16} /> Unión
          </button>
        </div>

        <div className="sim-block">
          <div className="sim-block-head">
            <LayoutTemplate size={15} /> Plantillas
          </div>
          <div className="template-grid">
            {[
              ["basic", "Cubo"],
              ["towers", "Dos torres 4 alt."],
              ["wall", "Pared 3×2"],
              ["corner", "Esquina"],
              ["tower", "Torre 2 alt."],
              ["backdrop", "Fondo Skadis"],
              ["empty", "Vaciar"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                className="template-button"
                onClick={() => {
                  onChange(sceneTemplate(id as Parameters<typeof sceneTemplate>[0]));
                  setSelection(null);
                  window.setTimeout(() => viewportRef.current?.fit(), 80);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="sim-block">
          <div className="sim-block-head">
            <Boxes size={15} /> Materiales
          </div>
          <div className="palette">
            {PANEL_TYPE_OPTIONS.map((type) => (
              <button
                type="button"
                key={type.id}
                className="palette-row"
                onClick={() => addPanel(type.id)}
              >
                <span className={`panel-mini ${type.id}`} />
                <span>
                  <strong>{type.name}</strong>
                  <small>{type.detail}</small>
                </span>
                <Plus size={14} />
              </button>
            ))}
          </div>
        </div>

        <div className="sim-block">
          <div className="sim-block-head">
            <Save size={15} /> Guardar
          </div>
          <button type="button" className="secondary-button wide" onClick={onSaveScene}>
            <Save size={15} /> Guardar proyecto
          </button>
          {savedPresets.length > 0 && (
            <div className="saved-mini">
              <span>Tus presets</span>
              {savedPresets.slice(-3).map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => {
                    onEditJoint(preset.settings);
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="sim-center">
        <div className="sim-toolbar">
          <div className="sim-toolbar-group">
            <button type="button" className="tool-button" onClick={() => setSelection(null)} title="Selección">
              <MousePointer2 size={16} />
            </button>
            <button type="button" className="tool-button" onClick={() => viewportRef.current?.setView("iso")} title="Isométrica">
              <Box size={16} />
            </button>
            <button type="button" className="tool-button" onClick={() => viewportRef.current?.setView("front")} title="Frontal">
              <PanelTop size={16} />
            </button>
            <button type="button" className="tool-button" onClick={() => viewportRef.current?.setView("top")} title="Superior">
              <Grid2X2 size={16} />
            </button>
            <button type="button" className="tool-button" onClick={() => viewportRef.current?.setView("side")} title="Lateral">
              <RotateCw size={16} />
            </button>
          </div>
          <div className="sim-toolbar-group">
            <button
              type="button"
              className={`tool-button text${showMeasurements ? " active" : ""}`}
              onClick={() => setShowMeasurements((value) => !value)}
              title="Medidas"
            >
              <Ruler size={16} /> Medidas
            </button>
            <button
              type="button"
              className={`tool-button text${showGrid ? " active" : ""}`}
              onClick={() => setShowGrid((value) => !value)}
              title="Cuadrícula"
            >
              <Grid2X2 size={16} /> Cuadrícula
            </button>
          </div>
          <div className="sim-toolbar-group right">
            <button type="button" className="tool-button text" onClick={exportPng}>
              <ImageDown size={16} /> PNG
            </button>
            <button type="button" className="tool-button text" onClick={exportJson}>
              <Download size={16} /> JSON
            </button>
            <button type="button" className="secondary-button" onClick={exportTheKit} disabled={Boolean(busy)}>
              <WandSparkles size={16} /> {busy || "Kit 3MF"}
            </button>
          </div>
        </div>
        <SimulatorViewport
          ref={viewportRef}
          scene={scene}
          selection={selection}
          showMeasurements={showMeasurements}
          showGrid={showGrid}
          onSelect={setSelection}
          onMovePanel={(id, x, y) => setPanel(id, { x, y })}
          onMoveJoint={(id, x, y, z) => setJoint(id, { x, y, z })}
        />
        <div className="sim-bottom">
          <div className="sim-stat">
            <span>Ancho</span>
            <strong>{cm(bounds.width)}</strong>
          </div>
          <div className="sim-stat">
            <span>Fondo</span>
            <strong>{cm(bounds.depth)}</strong>
          </div>
          <div className="sim-stat">
            <span>Alto</span>
            <strong>{cm(bounds.height)}</strong>
          </div>
          <div className="sim-stat">
            <span>Paneles</span>
            <strong>{scene.panels.length}</strong>
          </div>
          <div className="sim-stat">
            <span>Uniones</span>
            <strong>{scene.joints.length}</strong>
          </div>
          <div className="sim-stat">
            <span>Mesa</span>
            <strong>{cm(scene.table.height)}</strong>
          </div>
          {message && <span className="sim-message">{message}</span>}
        </div>
      </main>

      <aside className="sim-right">
        <div className="sim-inspector-head">
          <div>
            <span className="eyebrow">Propiedades</span>
            <h2>{selectedPanel ? "Panel" : selectedJoint ? "Unión" : "Puesto"}</h2>
          </div>
          {(selectedPanel || selectedJoint) && (
            <span className="selection-dot" style={{ background: selectedPanel?.color || selectedJoint?.color }} />
          )}
        </div>

        {!selectedPanel && !selectedJoint && (
          <div className="sim-empty-inspector">
            <MousePointer2 size={22} />
            <strong>Selecciona una pieza</strong>
            <p>Haz clic en un panel o en una unión. Arrastra para moverla sobre la cuadrícula.</p>
          </div>
        )}

        {selectedPanel && (
          <div className="sim-props">
            <div className="field-grid two">
              <NumberField label="Ancho" value={selectedPanel.width} onChange={(value) => setPanel(selectedPanel.id, { width: value })} min={100} max={1200} step={10} suffix="mm" />
              <NumberField label="Alto" value={selectedPanel.height} onChange={(value) => setPanel(selectedPanel.id, { height: value })} min={100} max={1600} step={10} suffix="mm" />
              <NumberField label="X" value={selectedPanel.x} onChange={(value) => setPanel(selectedPanel.id, { x: value })} step={10} suffix="mm" />
              <NumberField label="Y" value={selectedPanel.y} onChange={(value) => setPanel(selectedPanel.id, { y: value })} step={10} suffix="mm" />
              <NumberField label="Base Z" value={selectedPanel.z} onChange={(value) => setPanel(selectedPanel.id, { z: value })} step={10} suffix="mm" />
              <NumberField label="Giro" value={selectedPanel.rotation} onChange={(value) => setPanel(selectedPanel.id, { rotation: value })} min={-180} max={180} step={5} suffix="°" />
            </div>
            <div className="size-chips rotation-chips">
              {[-90, -15, 15, 90].map((delta) => (
                <button
                  type="button"
                  key={delta}
                  onClick={() => rotatePanel(selectedPanel.id, delta)}
                  title={delta > 0 ? `Girar ${delta}° a la derecha` : `Girar ${Math.abs(delta)}° a la izquierda`}
                >
                  <RotateCw size={13} style={{ transform: delta < 0 ? "scaleX(-1)" : undefined }} /> {delta > 0 ? `+${delta}` : delta}°
                </button>
              ))}
            </div>
            <p className="micro-copy">Atajo: pulsa R para girar 15° (Shift+R hacia el otro lado).</p>
            <Segmented
              value={selectedPanel.kind}
              options={PANEL_TYPE_OPTIONS.map((type) => ({ value: type.id, label: type.name }))}
              onChange={(value) => setPanel(selectedPanel.id, { kind: value })}
              small
            />
            <div className="size-chips">
              {PANEL_SIZE_OPTIONS.map((size) => (
                <button
                  type="button"
                  key={size.id}
                  onClick={() => setPanel(selectedPanel.id, { width: size.width, height: size.height })}
                >
                  {size.name}
                </button>
              ))}
            </div>
            <ColorField
              label="Color del panel"
              value={selectedPanel.color}
              onChange={(value) => setPanel(selectedPanel.id, { color: value })}
            />
            <div className="palette-row">
              {PANEL_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className="palette-swatch"
                  style={{ background: color }}
                  onClick={() => setPanel(selectedPanel.id, { color })}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
            <div className="prop-actions">
              <button type="button" className="secondary-button" onClick={duplicate}>
                <Copy size={15} /> Duplicar
              </button>
              <button type="button" className="danger-button" onClick={remove}>
                <Trash2 size={15} /> Eliminar
              </button>
            </div>
          </div>
        )}

        {selectedJoint && (
          <div className="sim-props">
            <SelectField
              label="Tipo de unión"
              value={selectedJoint.presetId}
              options={JOINT_PRESET_OPTIONS.map((preset) => ({ value: preset.id, label: preset.name }))}
              onChange={(value) => setJoint(selectedJoint.id, { presetId: value })}
            />
            <div className="field-grid two">
              <NumberField label="X" value={selectedJoint.x} onChange={(value) => setJoint(selectedJoint.id, { x: value })} step={10} suffix="mm" />
              <NumberField label="Y" value={selectedJoint.y} onChange={(value) => setJoint(selectedJoint.id, { y: value })} step={10} suffix="mm" />
              <NumberField label="Altura Z" value={selectedJoint.z} onChange={(value) => setJoint(selectedJoint.id, { z: value })} step={10} suffix="mm" />
              <NumberField label="Giro" value={selectedJoint.rotation} onChange={(value) => setJoint(selectedJoint.id, { rotation: value })} min={-180} max={180} step={5} suffix="°" />
              <NumberField label="Escala" value={selectedJoint.scale} onChange={(value) => setJoint(selectedJoint.id, { scale: value })} min={0.5} max={3} step={0.1} />
            </div>
            <ColorField
              label="Color de la unión"
              value={selectedJoint.color}
              onChange={(value) => setJoint(selectedJoint.id, { color: value })}
            />
            <div className="palette-row">
              {JOINT_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className="palette-swatch"
                  style={{ background: color }}
                  onClick={() => setJoint(selectedJoint.id, { color })}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
            <button
              type="button"
              className="primary-button wide"
              onClick={() => onEditJoint(settingsForJoint(selectedJoint.presetId, selectedJoint.color, selectedJoint.name))}
            >
              <Maximize size={15} /> Abrir esta unión en el estudio
            </button>
            <div className="prop-actions">
              <button type="button" className="secondary-button" onClick={duplicate}>
                <Copy size={15} /> Duplicar
              </button>
              <button type="button" className="danger-button" onClick={remove}>
                <Trash2 size={15} /> Eliminar
              </button>
            </div>
          </div>
        )}

        <div className="sim-bom">
          <div className="sim-block-head">
            <Boxes size={15} /> Lista de materiales
          </div>
          {scene.panels.length === 0 && scene.joints.length === 0 && <p className="muted-copy">Aún no hay piezas.</p>}
          {scene.panels.length > 0 && (
            <div className="bom-row">
              <span>Paneles</span>
              <strong>{scene.panels.length}</strong>
            </div>
          )}
          {bom.map((item) => (
            <div className="bom-row" key={item.presetId}>
              <span>{item.preset?.name || item.presetId}</span>
              <strong>× {item.count}</strong>
            </div>
          ))}
          <div className="bom-total">
            <span>Huella</span>
            <strong>
              {fmt(bounds.width / 10, 0)} × {fmt(bounds.depth / 10, 0)} cm
            </strong>
          </div>
        </div>

        <div className="sim-table-settings">
          <div className="sim-block-head">
            <Camera size={15} /> Mesa y escena
          </div>
          <Toggle
            label="Mostrar mesa"
            checked={scene.table.show}
            onChange={(checked) => onChange({ ...scene, table: { ...scene.table, show: checked } })}
          />
          <div className="field-grid two">
            <NumberField
              label="Mesa ancho"
              value={scene.table.width}
              onChange={(value) => onChange({ ...scene, table: { ...scene.table, width: value } })}
              min={600}
              max={4000}
              step={50}
              suffix="mm"
            />
            <NumberField
              label="Mesa fondo"
              value={scene.table.depth}
              onChange={(value) => onChange({ ...scene, table: { ...scene.table, depth: value } })}
              min={400}
              max={2000}
              step={50}
              suffix="mm"
            />
            <NumberField
              label="Altura mesa"
              value={scene.table.height}
              onChange={(value) => onChange({ ...scene, table: { ...scene.table, height: value } })}
              min={0}
              max={1100}
              step={10}
              suffix="mm"
            />
            <NumberField
              label="Cuadrícula"
              value={scene.grid}
              onChange={(value) => onChange({ ...scene, grid: value })}
              min={10}
              max={200}
              step={5}
              suffix="mm"
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
