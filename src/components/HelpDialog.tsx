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
            <h3>Elige un preset</h3>
            <p>Empieza por esquina, T, cruz, ángulo, pata, borde o una placa decorativa. Todos son puntos de partida editables.</p>
          </article>
          <article>
            <span className="help-num">02</span>
            <h3>Mide tu reja</h3>
            <p>El perfil base usa cable de 4 mm. Si tu reja es de marco, cámbialo a 3,8 mm; para foam, usa la clavija de 5 mm.</p>
          </article>
          <article>
            <span className="help-num">03</span>
            <h3>Prueba el cupón</h3>
            <p>Imprime el cupón de calibración antes del conector final. Prueba los cinco canales y ajusta la holgura.</p>
          </article>
          <article>
            <span className="help-num">04</span>
            <h3>Decora</h3>
            <p>Elige una silueta o importa un SVG, PNG, JPG o WebP. La app detecta el contorno y lo convierte en placa intercambiable.</p>
          </article>
          <article>
            <span className="help-num">05</span>
            <h3>Parte si hace falta</h3>
            <p>El modo partido divide la pieza en dos mitades con orejetas M3. También puedes imprimir en diagonal para reforzar las capas.</p>
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
