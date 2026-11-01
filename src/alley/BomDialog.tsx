import { useMemo, useState } from "react";
import { Check, Clipboard, Download, Package, X } from "lucide-react";
import { bomCsv, sceneBom } from "./scene";
import type { AlleyScene } from "./types";
import { downloadBlob, slug } from "../lib/utils";

export default function BomDialog({
  open,
  scene,
  projectName,
  onClose,
}: {
  open: boolean;
  scene: AlleyScene;
  projectName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const bom = useMemo(() => sceneBom(scene), [scene]);
  if (!open) return null;

  const copy = async () => {
    const lines = [
      `Lista de materiales · ${projectName}`,
      "",
      ...bom.parts.map((line) => `${line.qty} × ${line.name}${line.note ? ` — ${line.note}` : ""}`),
      "",
      "Uniones integradas (no requieren pieza extra):",
      ...bom.integrated.map((line) => `${line.qty} × ${line.name}`),
      "",
      `Total de piezas: ${bom.totalParts}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copia la lista:", lines);
    }
  };

  const download = () => {
    downloadBlob(new Blob([bomCsv(bom)], { type: "text/csv;charset=utf-8" }), `${slug(projectName)}-materiales.csv`);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal alley-bom-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Sandbox Artist Alley</span>
            <h2>Lista de materiales</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="alley-bom-summary">
          <div>
            <span>Piezas que necesitas</span>
            <strong>{bom.totalParts}</strong>
          </div>
          <div>
            <span>Uniones</span>
            <strong>{bom.totalJoints}</strong>
          </div>
          <div>
            <span>Líneas</span>
            <strong>{bom.parts.length + bom.integrated.length}</strong>
          </div>
        </div>

        <div className="alley-bom-scroll">
          <table className="alley-bom-table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Pieza</th>
                <th className="num">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {bom.parts.map((line) => (
                <tr key={`${line.category}-${line.name}`}>
                  <td>
                    <span className="alley-bom-category">{line.category}</span>
                  </td>
                  <td>
                    <strong>{line.name}</strong>
                    {line.note && <small>{line.note}</small>}
                  </td>
                  <td className="num">
                    <span className="alley-qty">{line.qty}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {bom.integrated.length > 0 && (
            <>
              <div className="alley-bom-section">
                <Package size={15} /> Uniones integradas
              </div>
              <p className="micro-copy">Forman parte de los paneles y no necesitan una pieza impresa extra.</p>
              <table className="alley-bom-table integrated">
                <tbody>
                  {bom.integrated.map((line) => (
                    <tr key={`${line.category}-${line.name}`}>
                      <td>
                        <span className="alley-bom-category">{line.category}</span>
                      </td>
                      <td>
                        <strong>{line.name}</strong>
                        {line.note && <small>{line.note}</small>}
                      </td>
                      <td className="num">
                        <span className="alley-qty muted">{line.qty}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {bom.parts.length === 0 && <p className="muted-copy">Añade elementos al puesto para generar la lista.</p>}
        </div>

        <div className="alley-bom-actions">
          <p className="micro-copy">
            Los modelos originales de Jessie Shi (Sandoik) no se incluyen. Esta lista cuenta las representaciones y los conectores
            del montador.
          </p>
          <div>
            <button type="button" className="secondary-button" onClick={copy}>
              {copied ? <Check size={15} /> : <Clipboard size={15} />} {copied ? "Copiada" : "Copiar"}
            </button>
            <button type="button" className="primary-button" onClick={download}>
              <Download size={15} /> CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
