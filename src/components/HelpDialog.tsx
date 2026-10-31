import { X } from "lucide-react";

export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal help-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Guía rápida</span>
            <h2>De una reja a un conector imprimible</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="help-grid">
          <article>
            <span className="help-num">01</span>
            <h3>Elige una base</h3>
            <p>La biblioteca tiene las 7 bases exactas. Elige la unión que necesites; las demás formas se crean modificando esa base.</p>
          </article>
          <article>
            <span className="help-num">02</span>
            <h3>Mide tu reja</h3>
            <p>Las bases están calibradas para la reja de referencia. Si tu reja tiene otro grosor, imprime el cupón y ajusta la holgura.</p>
          </article>
          <article>
            <span className="help-num">03</span>
            <h3>Prueba el cupón</h3>
            <p>Imprime el cupón de calibración antes del conector final. Prueba los cinco canales y elige el que mejor encaje.</p>
          </article>
          <article>
            <span className="help-num">04</span>
            <h3>Decora</h3>
            <p>Añade una de las 22 siluetas en un lado libre. La placa se imprime aparte, plana y en su color, y se encola en la base.</p>
          </article>
          <article>
            <span className="help-num">05</span>
            <h3>Añade patas</h3>
            <p>Coloca patas en los lados libres para elevar la pieza. Con altura 0 se convierten en extensiones planas; el giro siempre es vertical.</p>
          </article>
          <article>
            <span className="help-num">06</span>
            <h3>Monta el puesto</h3>
            <p>En Puesto 3D arrastra paneles y uniones, cambia su color y tipo de reja, y exporta un kit 3MF con las cantidades.</p>
          </article>
        </div>

        <div className="help-callout">
          <strong>Consejo de impresión</strong>
          <span>
            Para conectores de exposición, PETG/ASA con 4 paredes y 0,2 mm suele ser más duradero que PLA. La resistencia depende de la
            orientación de las capas: revisa la vista y prueba una pieza antes de imprimir todo el set.
          </span>
        </div>
      </div>
    </div>
  );
}
