import { useState } from "react";
import { Download, FileArchive, FileJson, Layers3, Printer, X } from "lucide-react";
import type { BuildResult, ConnectorSettings } from "../types";
import { base64ToBlob, downloadBlob, fmt, slug } from "../lib/utils";

export default function ExportDialog({
  open,
  onClose,
  build,
  settings,
  engineReady,
  onExport3mf,
  onExportProject,
}: {
  open: boolean;
  onClose: () => void;
  build: BuildResult | null;
  settings: ConnectorSettings;
  engineReady: boolean;
  onExport3mf: () => Promise<void>;
  onExportProject: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const downloadPart = (index: number) => {
    if (!build?.parts[index]) return;
    const part = build.parts[index];
    downloadBlob(
      base64ToBlob(part.print_b64),
      `${slug(settings.name)}-${slug(part.name)}.stl`,
    );
  };

  const export3mf = async () => {
    setBusy(true);
    setError("");
    try {
      await onExport3mf();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal export-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Exportar</span>
            <h2>Lleva el conector a la impresora</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {!build ? (
          <p className="muted-copy">Todavía no hay un modelo generado.</p>
        ) : (
          <>
            <div className="export-summary">
              <div>
                <span>Dimensiones</span>
                <strong>
                  {fmt(build.dimensions.width)} × {fmt(build.dimensions.height)} × {fmt(build.dimensions.depth)} mm
                </strong>
              </div>
              <div>
                <span>Material</span>
                <strong>{fmt(build.material_grams, 1)} g · {build.material}</strong>
              </div>
              <div>
                <span>Malla</span>
                <strong>{build.parts.reduce((sum, part) => sum + part.triangles, 0).toLocaleString("es-ES")} tris</strong>
              </div>
            </div>

            <div className="export-parts">
              <div className="export-parts-head">
                <Layers3 size={16} /> Piezas
                <small>STL ya orientados para la cama</small>
              </div>
              {build.parts.map((part, index) => (
                <div className="export-part" key={part.id}>
                  <span className="part-color" style={{ background: part.color }} />
                  <span className="part-copy">
                    <strong>{part.name}</strong>
                    <small>
                      {part.print_dimensions.map((value) => fmt(value)).join(" × ")} mm · {fmt(part.volume / 1000, 1)} cm³
                    </small>
                  </span>
                  {!part.watertight && <span className="part-warning">malla abierta</span>}
                  <button type="button" className="icon-button" onClick={() => downloadPart(index)} title={`Descargar ${part.name} en STL`}>
                    <Download size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="export-actions">
              <button type="button" className="primary-button" onClick={export3mf} disabled={!engineReady || busy}>
                <FileArchive size={16} /> {busy ? "Generando 3MF…" : "Descargar 3MF"}
              </button>
              <button type="button" className="secondary-button" onClick={onExportProject}>
                <FileJson size={16} /> Proyecto .conector
              </button>
              <span className="export-note">
                <Printer size={14} /> Usa PETG o ASA para conectores que vayan a soportar peso.
              </span>
            </div>
            {error && <p className="field-error">{error}</p>}

            {build.checks.length > 0 && (
              <div className="export-checks">
                <strong>Antes de imprimir</strong>
                {build.checks.map((check, index) => (
                  <p className={check.level} key={index}>
                    · {check.title}: {check.detail}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
