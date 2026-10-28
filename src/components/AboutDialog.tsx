import { ExternalLink, Github, Heart, X } from "lucide-react";

export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal about-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Acerca de</span>
            <h2>CONector Tool</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <p className="about-lead">
          Un estudio paramétrico para diseñar conectores de rejas de exposición y montar el puesto completo antes de imprimir.
          Todo se calcula en tu navegador con Python y no se sube ningún archivo.
        </p>

        <div className="about-grid">
          <section>
            <h3>Motor</h3>
            <p>Python 3.12 sobre Pyodide, NumPy, Shapely y un núcleo de mallas propio. React y Three.js para la vista 3D.</p>
          </section>
          <section>
            <h3>Impresión</h3>
            <p>Exporta STL por pieza y 3MF con objetos separados. Incluye cupón de calibración, comprobaciones y split.</p>
          </section>
        </div>

        <div className="credit-box">
          <div className="credit-icon">
            <Heart size={18} />
          </div>
          <div>
            <strong>Inspiración y referencia de formas</strong>
            <p>
              La gramática de conectores de rejilla (planos horizontal/vertical, brazos, cinturón y canales festoneados) está
              inspirada en <strong>Wire Grid Connector Set</strong> de <strong>CloudedCat</strong>, publicado en Printables con
              licencia <strong>CC BY-NC 4.0</strong>.
            </p>
            <p>
              Esta aplicación <strong>no incluye ni redistribuye sus STL</strong> ni los archivos de pago de Etsy: todas las
              geometrías se generan paramétricamente en el navegador. La mención es un reconocimiento de la referencia de diseño.
            </p>
            <a href="https://www.printables.com/model/1721006-wire-grid-connector-set" target="_blank" rel="noreferrer">
              Wire Grid Connector Set · CloudedCat <ExternalLink size={13} />
            </a>
          </div>
        </div>

        <div className="about-footer">
          <span>Si quieres cambiar una base, usa los presets; si quieres una forma nueva, ajusta agarre, brazos, cinturón, patas y decoración.</span>
          <a href="https://github.com/dhernandezgit/CONector-Tool" target="_blank" rel="noreferrer">
            <Github size={14} /> Repositorio
          </a>
        </div>
      </div>
    </div>
  );
}
