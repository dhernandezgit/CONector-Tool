import { X } from "lucide-react";

export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal help-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Guía rápida</span>
            <h2>Monta tu puesto Artist Alley</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="help-grid">
          <article>
            <span className="help-num">01</span>
            <h3>Elige una pieza o un grupo</h3>
            <p>
              El catálogo incluye paneles, expositores, estantes, accesorios y el toldo. Los grupos rápidos colocan una
              composición completa y se pueden mover o girar como una sola pieza.
            </p>
          </article>
          <article>
            <span className="help-num">02</span>
            <h3>Coloca en isométrico</h3>
            <p>
              El cubo de arriba a la derecha alterna entre isométrico y perspectiva. En isométrico no hay distorsión y es
              más fácil alinear paneles. Arrastra el cubo o el fondo para orbitar; toca una zona del cubo para cambiar de vista.
            </p>
          </article>
          <article>
            <span className="help-num">03</span>
            <h3>Conecta por las esferas</h3>
            <p>
              Las esferas grandes son los puertos de las esquinas y bordes. Toca una esfera, luego una amarilla compatible:
              las piezas se acercan y se crea la unión. Las verdes ya están conectadas y la rosa es el origen elegido.
            </p>
          </article>
          <article>
            <span className="help-num">04</span>
            <h3>Cambia el conector</h3>
            <p>
              Selecciona una esfera de unión para ver sus piezas y cambiar el tipo de conector. Solo aparecen las opciones
              válidas para el número de paneles y su ángulo: recto, esquina, L, T, Skadis, cola de milano o rejilla.
            </p>
          </article>
          <article>
            <span className="help-num">05</span>
            <h3>Agrupa y reutiliza</h3>
            <p>
              Con Mayús + clic selecciona varias piezas y pulsa Agrupar. Un grupo se mueve y gira completo. Puedes
              desagruparlo, duplicarlo o eliminarlo sin romper el resto del puesto. Las piezas duplicadas se reutilizan en
              lugar de apilarse.
            </p>
          </article>
          <article>
            <span className="help-num">06</span>
            <h3>Genera la lista</h3>
            <p>
              La lista de materiales cuenta cada pieza y cada conector colocado. Distingue las uniones integradas, que no
              necesitan una pieza extra, y permite copiar o descargar un CSV para preparar la compra.
            </p>
          </article>
        </div>

        <div className="help-callout">
          <strong>Atajos y seguridad</strong>
          <span>
            R gira 90° · Ctrl+D duplica · G agrupa · Supr elimina · Ctrl+Z deshace · Esc cancela una conexión. Todo se guarda
            en este navegador. Los modelos STL originales del pack no se cargan, no se sirven y no se publican: el sandbox usa
            representaciones originales y simplificadas.
          </span>
        </div>
      </div>
    </div>
  );
}
