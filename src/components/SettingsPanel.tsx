import { useRef, useState, type DragEvent } from "react";
import {
  CircleHelp,
  Combine,
  Download,
  Hand,
  ImagePlus,
  Printer,
  Shapes,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import type {
  BuildResult,
  ConnectorSettings,
  DeepPartial,
  DecorSide,
  Family,
  ImportedShape,
  MountType,
  PanelType,
  ShapeAnalysis,
  SplitAxis,
} from "../types";
import { SHAPE_OPTIONS } from "../data/presets";
import { deepMerge } from "../lib/utils";
import {
  ColorField,
  NumberField,
  RangeField,
  Section,
  Segmented,
  SelectField,
  ShapePreview,
  Toggle,
} from "./UI";

const FAMILIES: { value: Family; label: string; detail: string }[] = [
  { value: "template", label: "Base", detail: "Modelo exacto" },
  { value: "node", label: "Nodo", detail: "Esquina o unión" },
  { value: "angle", label: "Ángulo", detail: "Dos paneles" },
  { value: "leg", label: "Pata", detail: "Eleva el panel" },
  { value: "edge", label: "Borde", detail: "Placa con clip" },
  { value: "hook", label: "Gancho", detail: "Estante o cartel" },
  { value: "plate", label: "Placa", detail: "Solo decoración" },
  { value: "calibration", label: "Cupón", detail: "Prueba de ajuste" },
];

const JOINT_OPTIONS = [
  { value: "corner90", label: "Esquina 90°" },
  { value: "corner3d", label: "Esquina cubo" },
  { value: "flat", label: "Recta / plana" },
  { value: "tee", label: "T de 3 paneles" },
  { value: "cross", label: "Cruz / 4 vías" },
  { value: "six", label: "Nodo completo" },
  { value: "horizontal1", label: "Horizontal 1 vía" },
  { value: "horizontal2", label: "Horizontal 2 vías" },
  { value: "horizontal4", label: "Horizontal 4 vías" },
  { value: "vertical1", label: "Vertical 1 vía" },
  { value: "vertical2", label: "Vertical 2 vías" },
  { value: "single", label: "Un solo canal" },
  { value: "custom", label: "Canales personalizados" },
];

const PORT_ANGLES = [
  { value: 0, label: "0\u00b0" },
  { value: 90, label: "90\u00b0" },
  { value: 180, label: "180\u00b0" },
  { value: 270, label: "270\u00b0" },
];


const VERTICAL_PORT_ANGLES = [
  { value: 45, label: "45\u00b0" },
  { value: 135, label: "135\u00b0" },
  { value: 225, label: "225\u00b0" },
  { value: 315, label: "315\u00b0" },
];

const PANEL_OPTIONS: { value: PanelType; label: string; detail: string }[] = [
  { value: "wire", label: "Reja 4 mm", detail: "Cubo de alambre" },
  { value: "frame", label: "Marco 3,8", detail: "Perfil metálico" },
  { value: "foam", label: "Foam 5 mm", detail: "Panel con clavija" },
];

const TEMPLATE_OPTIONS = [
  { value: "0", label: "Cubo completo · ref 0" },
  { value: "1", label: "Cubo alternativo · ref 1" },
  { value: "2", label: "Tres lados · ref 2" },
  { value: "3", label: "Doble 90 · ref 3" },
  { value: "4", label: "Esquina 90 · ref 4" },
  { value: "5", label: "Vertical doble · ref 5" },
  { value: "6", label: "Estándar · ref 6" },
];

interface Props {
  settings: ConnectorSettings;
  build: BuildResult | null;
  onChange: (next: ConnectorSettings) => void;
  onAnalyzeShape: (file: File) => Promise<ShapeAnalysis>;
  onCalibration: () => void;
  onSavePreset: () => void;
  onOpenHelp: () => void;
}

export default function SettingsPanel({
  settings,
  build,
  onChange,
  onAnalyzeShape,
  onCalibration,
  onSavePreset,
  onOpenHelp,
}: Props) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const patch = (part: DeepPartial<ConnectorSettings>) => onChange(deepMerge(settings, part));

  const togglePort = (kind: "horizontal" | "vertical", angle: number, level?: "top" | "bottom") => {
    const key = kind === "horizontal" ? "horizontal_ports" : "vertical_ports";
    const current = settings[key] || [];
    const active = current.includes(angle);
    const next = active ? current.filter((item) => item !== angle) : [...current, angle];
    const update: DeepPartial<ConnectorSettings> = { [key]: next, joint_preset: "custom" } as DeepPartial<ConnectorSettings>;
    if (kind === "horizontal" && level === "top") update.top_channels = true;
    if (kind === "horizontal" && level === "bottom") update.bottom_channels = true;
    patch(update);
  };

  const applyPanelType = (type: PanelType) => {
    if (type === "wire") {
      patch({
        panel_type: type,
        wire_diameter: 4,
        clearance: 0.25,
        grip_wall: 2.4,
        mouth_width: 3.2,
        special: { ...settings.special, peg: false },
      });
    } else if (type === "frame") {
      patch({
        panel_type: type,
        wire_diameter: 3.8,
        clearance: 0.3,
        grip_wall: 2.6,
        mouth_width: 3.05,
        special: { ...settings.special, peg: false },
      });
    } else {
      patch({
        panel_type: type,
        wire_diameter: 5,
        clearance: 0.3,
        special: { ...settings.special, peg: true, peg_diameter: 5, peg_length: 8 },
      });
    }
  };

  const importDrawing = async (file: File) => {
    setImportError("");
    setImporting(true);
    try {
      const result = await onAnalyzeShape(file);
      if (!result.shape) throw new Error("No se detectó ninguna silueta.");
      patch({
        decor: {
          ...settings.decor,
          shape: "custom",
          custom: result.shape,
          size: Math.max(30, Math.min(140, Math.max(result.shape.bounds.width, result.shape.bounds.height))),
          color: result.shape.source_color || settings.decor.color,
        },
      });
    } catch (error) {
      setImportError(String((error as Error)?.message || error));
    } finally {
      setImporting(false);
    }
  };

  const onFile = (file: File | null | undefined) => {
    if (!file) return;
    void importDrawing(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    onFile(event.dataTransfer.files?.[0]);
  };

  const decor = settings.decor;
  const customShape: ImportedShape | null = decor.custom;


  return (
    <aside className="settings-panel">
      <div className="settings-title">
        <div>
          <span className="eyebrow">Inspector</span>
          <h2>Ajustes del conector</h2>
        </div>
        <button type="button" className="icon-button" onClick={onOpenHelp} title="Ayuda">
          <CircleHelp size={17} />
        </button>
      </div>

      <div className="family-grid">
        {FAMILIES.map((family) => (
          <button
            type="button"
            key={family.value}
            className={settings.family === family.value ? "family active" : "family"}
            onClick={() => patch({ family: family.value })}
          >
            <strong>{family.label}</strong>
            <small>{family.detail}</small>
          </button>
        ))}
      </div>

      <div className="settings-scroll">
        {settings.family === "template" && (
          <Section
            title="Base exacta"
            hint="Tus 7 modelos de referencia"
            icon={<Shapes size={17} />}
            badge="STL original"
          >
            <SelectField
              label="Modelo"
              value={String(settings.template_id)}
              options={TEMPLATE_OPTIONS}
              onChange={(value) => patch({ template_id: Number(value) })}
            />
            <div className="field-grid">
              <NumberField
                label="Escala X/Y"
                value={settings.template_scale_xy}
                onChange={(value) => patch({ template_scale_xy: value })}
                min={0.3}
                max={3}
                step={0.05}
              />
              <NumberField
                label="Escala Z"
                value={settings.template_scale_z}
                onChange={(value) => patch({ template_scale_z: value })}
                min={0.3}
                max={3}
                step={0.05}
              />
              <NumberField
                label="Giro"
                value={settings.template_rotate}
                onChange={(value) => patch({ template_rotate: value })}
                min={-180}
                max={180}
                step={5}
                suffix="°"
              />
            </div>
            <Toggle
              label="Espejo en X"
              checked={settings.template_mirror}
              onChange={(checked) => patch({ template_mirror: checked })}
            />
            <div className="inline-note">
              <span className="note-dot" />
              <span>
                Geometría original de tu set, sin remodelar. Mantén la escala en 1 para imprimir la pieza idéntica.
              </span>
            </div>
          </Section>
        )}
        {settings.family !== "template" && (
        <Section
          title="Agarre"
          hint="Cómo se fija a la reja"
          icon={<Hand size={17} />}
          badge={`${(settings.wire_diameter + settings.clearance * 2).toFixed(2)} mm`}
        >
          <Segmented
            value={settings.panel_type}
            options={PANEL_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              icon: undefined,
            }))}
            onChange={applyPanelType}
            small
          />
          <div className="inline-note">
            <span className="note-dot" />
            <span>
              Canal interior de <strong>{(settings.wire_diameter + settings.clearance * 2).toFixed(2)} mm</strong>.
              La holgura real depende de tu impresora.
            </span>
          </div>
          <div className="field-grid">
            <NumberField
              label="Cable / marco"
              value={settings.wire_diameter}
              onChange={(value) => patch({ wire_diameter: value })}
              min={1.5}
              max={12}
              step={0.1}
              suffix="mm"
            />
            <NumberField
              label="Holgura"
              value={settings.clearance}
              onChange={(value) => patch({ clearance: value })}
              min={0}
              max={1.2}
              step={0.05}
              suffix="mm"
            />
            <NumberField
              label="Grosor de pared"
              value={settings.grip_wall}
              onChange={(value) => patch({ grip_wall: value })}
              min={1.2}
              max={7}
              step={0.2}
              suffix="mm"
            />
            <NumberField
              label="Boca del clip"
              value={settings.mouth_width}
              onChange={(value) => patch({ mouth_width: value })}
              min={1}
              max={12}
              step={0.1}
              suffix="mm"
            />
            <NumberField
              label="Cables por brazo"
              value={settings.wire_count}
              onChange={(value) => patch({ wire_count: value })}
              min={1}
              max={3}
              step={1}
            />
            <NumberField
              label="Separación"
              value={settings.wire_spacing}
              onChange={(value) => patch({ wire_spacing: value })}
              min={0}
              max={20}
              step={0.5}
              suffix="mm"
            />
          </div>
          <button type="button" className="secondary-button wide" onClick={onCalibration}>
            <Download size={15} /> Generar cupón de calibración
          </button>
          <p className="micro-copy">
            Imprime el cupón una vez. Prueba los cinco canales y usa la holgura que mejor encaje en el conector final.
          </p>
        </Section>
        )}

        {settings.family !== "template" && (
        <Section title="Uniones" hint="Canales de la reja" icon={<Combine size={17} />}>
          {settings.family !== "angle" && (
            <SelectField
              label="Tipo de unión"
              value={settings.joint_preset}
              options={JOINT_OPTIONS}
              onChange={(value) => patch({ joint_preset: value })}
            />
          )}
          {settings.family === "angle" && (
            <RangeField
              label="Ángulo del sector"
              value={settings.angle}
              onChange={(value) =>
                patch({
                  angle: value,
                  joint_preset: "angle",
                  horizontal_ports: [0, value],
                  vertical_ports: [],
                })
              }
              min={5}
              max={175}
              step={1}
              suffix="°"
              hint="La pieza se abre como un abanico entre los dos paneles."
            />
          )}
          <div className="port-group">
            <div className="port-group-head">
              <span>Canales horizontales</span>
              <small>Arriba y abajo</small>
            </div>
            {(["top", "bottom"] as const).map((level) => {
              const enabled = level === "top" ? settings.top_channels : settings.bottom_channels;
              return (
                <div className="port-row" key={level}>
                  <button
                    type="button"
                    className={`port-level${enabled ? " active" : ""}`}
                    onClick={() => patch({ [level === "top" ? "top_channels" : "bottom_channels"]: !enabled, joint_preset: "custom" } as DeepPartial<ConnectorSettings>)}
                    title={`Activar canales ${level === "top" ? "superiores" : "inferiores"}`}
                  >
                    {level === "top" ? "Arriba" : "Abajo"}
                  </button>
                  <div className="port-angles">
                    {PORT_ANGLES.map((angle) => (
                      <button
                        type="button"
                        key={angle.value}
                        className={enabled && settings.horizontal_ports.includes(angle.value) ? "port-chip active" : "port-chip"}
                        onClick={() => togglePort("horizontal", angle.value, level)}
                      >
                        {angle.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="port-group">
            <div className="port-group-head">
              <span>Canales verticales</span>
              <small>Cara de la reja</small>
            </div>
            <div className="port-row">
              <span className="port-level static">Vertical</span>
              <div className="port-angles">
                {VERTICAL_PORT_ANGLES.map((angle) => (
                  <button
                    type="button"
                    key={angle.value}
                    className={settings.vertical_ports.includes(angle.value) ? "port-chip active" : "port-chip"}
                    onClick={() => togglePort("vertical", angle.value)}
                  >
                    {angle.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="inline-note">
            <span className="note-dot" />
            <span>
              Los canales horizontales reciben el alambre desde arriba o abajo. Los verticales abrazan la reja en el plano de la cara.
              Combínalos para crear el nodo exacto.
            </span>
          </div>
          <div className="field-grid">
            <SelectField
              label="Perfil"
              value={settings.body_style}
              options={[
                { value: "auto", label: "Automático" },
                { value: "full", label: "Puck completo" },
                { value: "sector", label: "Sector / esquina" },
              ]}
              onChange={(value) => patch({ body_style: value })}
            />
            <NumberField
              label="Tamaño del cuerpo"
              value={settings.body_size}
              onChange={(value) => patch({ body_size: value })}
              min={10}
              max={70}
              step={1}
              suffix="mm"
            />
            <NumberField
              label="Alto"
              value={settings.body_height}
              onChange={(value) => patch({ body_height: value })}
              min={6}
              max={90}
              step={0.2}
              suffix="mm"
            />
            <NumberField
              label="Altura del cintur?n"
              value={settings.belt_height}
              onChange={(value) => patch({ belt_height: value })}
              min={4}
              max={40}
              step={0.5}
              suffix="mm"
            />
            <NumberField
              label="Ancho del brazo"
              value={settings.arm_width}
              onChange={(value) => patch({ arm_width: value })}
              min={20}
              max={150}
              step={1}
              suffix="?"
            />
            <NumberField
              label="Grosor de pared"
              value={settings.grip_wall}
              onChange={(value) => patch({ grip_wall: value })}
              min={1.2}
              max={7}
              step={0.2}
              suffix="mm"
            />
          </div>
          <Toggle
            label="Muescas flexibles"
            detail="Festonea el labio para que el cable entre a presión."
            checked={settings.scallops}
            onChange={(checked) => patch({ scallops: checked })}
          />
          {settings.scallops && (
            <NumberField
              label="Número de muescas"
              value={settings.scallop_count}
              onChange={(value) => patch({ scallop_count: value })}
              min={1}
              max={8}
              step={1}
            />
          )}
          <p className="micro-copy">
            Esta familia reproduce el lenguaje de los conectores de puck: cuerpo sólido, canales en el borde y labios festoneados.
          </p>
        </Section>
        )}

        <Section title="Forma" hint="Cuerpo, color y placa" icon={<Shapes size={17} />}>
          <ColorField
            label="Color del cuerpo"
            value={settings.body_color}
            onChange={(value) => patch({ body_color: value })}
          />
          {settings.family === "edge" || settings.family === "plate" ? (
            <>
              <Toggle
                label="Placa decorativa"
                detail="Una cara intercambiable para el borde o para acoplar a la reja."
                checked={decor.enabled}
                onChange={(checked) => patch({ decor: { ...decor, enabled: checked } })}
              />
              {decor.enabled && (
                <>
                  <div className="shape-grid">
                    {SHAPE_OPTIONS.map((shape) => (
                      <button
                        type="button"
                        key={shape.id}
                        className={decor.shape === shape.id ? "shape-tile active" : "shape-tile"}
                        style={{ ["--shape-color" as string]: shape.color }}
                        onClick={() =>
                          patch({
                            decor: { ...decor, shape: shape.id, color: shape.color, custom: null },
                          })
                        }
                        title={shape.name}
                      >
                        <span>{shape.emoji}</span>
                        <small>{shape.name}</small>
                      </button>
                    ))}
                  </div>
                  <div className="field-grid">
                    <NumberField
                      label="Tamaño de placa"
                      value={decor.size}
                      onChange={(value) => patch({ decor: { ...decor, size: value } })}
                      min={12}
                      max={160}
                      step={1}
                      suffix="mm"
                    />
                    <NumberField
                      label="Grosor"
                      value={decor.thickness}
                      onChange={(value) => patch({ decor: { ...decor, thickness: value } })}
                      min={1.2}
                      max={8}
                      step={0.1}
                      suffix="mm"
                    />
                    <SelectField
                      label="Cara"
                      value={decor.side}
                      options={[
                        { value: "front", label: "Frontal" },
                        { value: "back", label: "Trasera" },
                        { value: "both", label: "Ambas" },
                      ]}
                      onChange={(value) => patch({ decor: { ...decor, side: value as DecorSide } })}
                    />
                    <SelectField
                      label="Montaje"
                      value={decor.mount}
                      options={[
                        { value: "press", label: "Presión" },
                        { value: "magnet", label: "Imanes" },
                        { value: "screw", label: "Tornillo M3" },
                      ]}
                      onChange={(value) => patch({ decor: { ...decor, mount: value as MountType } })}
                    />
                  </div>
                  <ColorField
                    label="Color de la placa"
                    value={decor.color}
                    onChange={(value) => patch({ decor: { ...decor, color: value } })}
                  />
                  <div
                    className={`drop-zone${dragging ? " dragging" : ""}${customShape ? " has-shape" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
                    }}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".svg,.png,.jpg,.jpeg,.webp"
                      hidden
                      onChange={(event) => onFile(event.target.files?.[0])}
                    />
                    {customShape ? (
                      <>
                        <ShapePreview shape={customShape} color={decor.color} />
                        <div className="drop-copy">
                          <strong>{customShape.name || "Dibujo importado"}</strong>
                          <small>
                            Silueta detectada · {customShape.bounds.width.toFixed(1)} × {customShape.bounds.height.toFixed(1)} mm
                          </small>
                          <span className="link-button">
                            <Upload size={13} /> Cambiar dibujo
                          </span>
                        </div>
                        <button
                          type="button"
                          className="icon-button danger"
                          title="Quitar dibujo"
                          onClick={(event) => {
                            event.stopPropagation();
                            patch({ decor: { ...decor, shape: "cat", custom: null } });
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <ImagePlus size={22} />
                        <div className="drop-copy">
                          <strong>{importing ? "Analizando dibujo…" : "Importar un dibujo"}</strong>
                          <small>SVG, PNG, JPG o WebP · se usa la silueta</small>
                        </div>
                      </>
                    )}
                  </div>
                  {importError && <p className="field-error">{importError}</p>}
                  {customShape?.warnings?.length ? <div className="inline-warning">{customShape.warnings[0]}</div> : null}
                  <div className="field-grid">
                    <NumberField
                      label="Borde"
                      value={decor.border}
                      onChange={(value) => patch({ decor: { ...decor, border: value } })}
                      min={0}
                      max={8}
                      step={0.1}
                      suffix="mm"
                    />
                    <NumberField
                      label="Relieve"
                      value={decor.relief}
                      onChange={(value) => patch({ decor: { ...decor, relief: value } })}
                      min={0}
                      max={3}
                      step={0.1}
                      suffix="mm"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="decor-note">
              <span className="note-dot" />
              <div>
                <strong>Decoración de cara</strong>
                <p>
                  Los nodos estructurales priorizan los canales de la reja. Para una placa frontal o trasera, usa los modos
                  <strong> Borde</strong> o <strong>Placa</strong>, que tienen el sistema de enganche decorativo.
                </p>
                <button type="button" className="link-button" onClick={() => patch({ family: "edge" })}>
                  Convertir en conector de borde
                </button>
              </div>
            </div>
          )}
          <button type="button" className="secondary-button wide" onClick={onSavePreset}>
            <SlidersHorizontal size={15} /> Guardar esta configuración como preset
          </button>
        </Section>

        <Section title="Especial" hint="Patas, cortes y piezas" icon={<Wrench size={17} />} defaultOpen={false}>
          <Toggle
            label="Pata o elevador"
            detail="Añade una pata al nodo."
            checked={settings.leg.enabled}
            onChange={(checked) => patch({ leg: { ...settings.leg, enabled: checked } })}
          />
          {settings.leg.enabled && (
            <div className="field-grid">
              <NumberField
                label="Altura"
                value={settings.leg.height}
                onChange={(value) => patch({ leg: { ...settings.leg, height: value } })}
                min={8}
                max={220}
                step={1}
                suffix="mm"
              />
              <div className="size-chips leg-chips">
                {[25, 50, 75, 100, 150, 200].map((height) => (
                  <button
                    type="button"
                    key={height}
                    onClick={() => patch({ leg: { ...settings.leg, height } })}
                  >
                    {height} mm
                  </button>
                ))}
              </div>
              <NumberField
                label="Ángulo"
                value={settings.leg.angle}
                onChange={(value) => patch({ leg: { ...settings.leg, angle: value } })}
                min={0}
                max={60}
                step={1}
                suffix="°"
              />
              <NumberField
                label="Pie"
                value={settings.leg.foot}
                onChange={(value) => patch({ leg: { ...settings.leg, foot: value } })}
                min={8}
                max={70}
                step={1}
                suffix="mm"
              />
            </div>
          )}
          <Toggle
            label="Recorte de apoyo"
            detail="Deja una base plana para apoyar en la mesa."
            checked={settings.special.table_cut}
            onChange={(checked) => patch({ special: { ...settings.special, table_cut: checked } })}
          />
          <Toggle
            label="Gancho de estantería"
            detail="Añade un gancho en U al cuerpo."
            checked={settings.special.hook}
            onChange={(checked) => patch({ special: { ...settings.special, hook: checked } })}
          />
          <Toggle
            label="Clavija de espuma"
            detail="Espiga para panel foam de 5 mm."
            checked={settings.special.peg}
            onChange={(checked) => patch({ special: { ...settings.special, peg: checked } })}
          />
          {settings.special.peg && (
            <div className="field-grid">
              <NumberField
                label="Diámetro de clavija"
                value={settings.special.peg_diameter}
                onChange={(value) => patch({ special: { ...settings.special, peg_diameter: value } })}
                min={2}
                max={12}
                step={0.1}
                suffix="mm"
              />
              <NumberField
                label="Largo de clavija"
                value={settings.special.peg_length}
                onChange={(value) => patch({ special: { ...settings.special, peg_length: value } })}
                min={2}
                max={30}
                step={1}
                suffix="mm"
              />
            </div>
          )}
          <Toggle
            label="Ojales para brida"
            detail="Dos anillas laterales para cables."
            checked={settings.special.zip_tie}
            onChange={(checked) => patch({ special: { ...settings.special, zip_tie: checked } })}
          />
          <div className="split-box">
            <Toggle
              label="Partido por la mitad"
              detail="Dos piezas con cara de corte plana y orejetas."
              checked={settings.split.enabled}
              onChange={(checked) =>
                patch({
                  split: {
                    ...settings.split,
                    enabled: checked,
                    offset: checked && settings.split.offset === 0 ? settings.body_height / 2 : settings.split.offset,
                  },
                })
              }
            />
            {settings.split.enabled && (
              <>
                <Segmented
                  value={settings.split.axis}
                  options={[
                    { value: "z", label: "Horizontal" },
                    { value: "x", label: "Vertical" },
                  ]}
                  onChange={(value) => patch({ split: { ...settings.split, axis: value as SplitAxis } })}
                  small
                />
                <NumberField
                  label="Altura/posición del corte"
                  value={settings.split.offset}
                  onChange={(value) => patch({ split: { ...settings.split, offset: value } })}
                  min={-30}
                  max={30}
                  step={0.5}
                  suffix="mm"
                />
                <Toggle
                  label="Orejetas atornillables"
                  checked={settings.split.screw_pads}
                  onChange={(checked) => patch({ split: { ...settings.split, screw_pads: checked } })}
                />
                <p className="micro-copy">
                  Los agujeros son pasantes para tornillo M3. Alinea las mitades antes de apretar.
                </p>
              </>
            )}
          </div>
        </Section>

        <Section title="Impresión" hint="Material y comprobaciones" icon={<Printer size={17} />} defaultOpen={false}>
          <div className="field-grid">
            <SelectField
              label="Material"
              value={settings.print.material}
              options={[
                { value: "PETG", label: "PETG · resistente" },
                { value: "PLA", label: "PLA · prototipos" },
                { value: "ABS", label: "ABS" },
                { value: "ASA", label: "ASA · exterior" },
                { value: "TPU", label: "TPU · flexible" },
                { value: "RESINA", label: "Resina" },
              ]}
              onChange={(value) => patch({ print: { ...settings.print, material: value } })}
            />
            <SelectField
              label="Boquilla"
              value={String(settings.print.nozzle)}
              options={[
                { value: "0.4", label: "0,4 mm" },
                { value: "0.6", label: "0,6 mm" },
                { value: "0.8", label: "0,8 mm" },
              ]}
              onChange={(value) => patch({ print: { ...settings.print, nozzle: Number(value) } })}
            />
            <NumberField
              label="Altura de capa"
              value={settings.print.layer}
              onChange={(value) => patch({ print: { ...settings.print, layer: value } })}
              min={0.08}
              max={0.5}
              step={0.02}
              suffix="mm"
            />
            <NumberField
              label="Cama"
              value={settings.print.bed_width}
              onChange={(value) =>
                patch({ print: { ...settings.print, bed_width: value, bed_depth: value } })
              }
              min={100}
              max={500}
              step={1}
              suffix="mm"
            />
          </div>
          <Toggle
            label="Girar 45° en la cama"
            detail="Cambia la dirección de las capas sin tocar el modelo montado."
            checked={settings.print.diagonal}
            onChange={(checked) => patch({ print: { ...settings.print, diagonal: checked } })}
          />
          <div className="print-advice">
            <Printer size={16} />
            <span>
              Para máxima resistencia imprime en diagonal o parte la pieza. Recomendado: {settings.print.material}, 4 paredes,
              0,2 mm y 30–40% de relleno.
            </span>
          </div>
          {build && (
            <div className="checks">
              <div className="checks-head">
                <strong>Comprobaciones</strong>
                <span>{build.build_ms} ms</span>
              </div>
              {build.checks.length === 0 && <p className="all-good">Todo listo para exportar.</p>}
              {build.checks.map((check, index) => (
                <div className={`check ${check.level}`} key={`${check.title}-${index}`}>
                  <span className="check-dot" />
                  <div>
                    <strong>{check.title}</strong>
                    <p>{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="tips">
            {build?.tips?.map((tip, index) => (
              <p key={index}>· {tip}</p>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}
