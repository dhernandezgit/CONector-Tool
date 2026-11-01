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
              El catálogo incluye paneles, expositores, estantes, baldas, organizadores laterales, accesorios y el toldo.
              La escena inicial es la doble torre con una estantería central hecha con dos organizadores y dos toldos
              sobre el puente; los grupos rápidos colocan una composición completa y se pueden mover o girar como una sola
              pieza.
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
            <h3>Arrastra y conecta</h3>
            <p>
              Arrastra una pieza cerca de un puerto: se imanta, se mueve en directo y muestra una línea con el panel destino
              y el conector que se formará. Al soltar queda unida. También puedes seleccionar una pieza y usar las esferas
              rosas: las libres son rosas suaves, las conectadas rosas oscuras, el origen rosa intenso y el destino rosa
              brillante.
            </p>
          </article>
          <article>
            <span className="help-num">04</span>
            <h3>Cambia el conector</h3>
            <p>
              Selecciona una unión para ver sus piezas y cambiar el tipo de conector. Se ofrecen todos los conectores
              compatibles con el número de paneles, no solo los de un sistema: puedes mezclar slatwall, Skadis y rejilla, y
              el editor elige automáticamente un tipo válido. El toldo se ancla con dos soportes y dos brazos; incluye
              faldón frontal y no tiene patas al suelo.
            </p>
          </article>
          <article>
            <span className="help-num">05</span>
            <h3>Selecciona, copia y agrupa</h3>
            <p>
              Con Mayús + clic añade o quita piezas de la selección. Al arrastrar una pieza seleccionada se mueve todo el
              conjunto. Usa Ctrl+C / Ctrl+V para copiar y pegar, Ctrl+A para seleccionar todo, G para agrupar y las flechas
              para ajustar 1 cm (Mayús: 5 cm). Si una pieza pertenece a un grupo, el color y los campos X/Y/altura/rotación
              se aplican a todo el grupo.
            </p>
          </article>
          <article>
            <span className="help-num">06</span>
            <h3>Gira en 90°</h3>
            <p>
              Pulsa R o E para girar +90° y Q para girar -90°. También tienes los botones de rotación en la barra flotante de
              selección y en el inspector, además de la rotación fina y los cuatro ángulos rápidos.
            </p>
          </article>
          <article>
            <span className="help-num">07</span>
            <h3>Trabaja en L</h3>
            <p>
              En «Mesas de trabajo» puedes añadir una mesa recta o una mesa en L girada 90°. Las mesas comparten altura para
              que las piezas apoyen bien. Los ejemplos «Mesa en L de trabajo» y «Mesa en L + pared» montan la configuración
              completa.
            </p>
          </article>
          <article>
            <span className="help-num">08</span>
            <h3>Guarda o abre un archivo</h3>
            <p>
              «Archivo» descarga un JSON local con mesas, piezas, grupos, colores y conexiones. «Abrir» recupera ese archivo
              en cualquier navegador. El guardado automático sigue funcionando en este navegador.
            </p>
          </article>
          <article>
            <span className="help-num">09</span>
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
            R/E gira +90° · Q gira -90° · Ctrl+C/V copia y pega · Ctrl+D duplica · Ctrl+G agrupa · Supr elimina · F encuadra ·
            Ctrl+Z deshace · Esc cancela una conexión. Todo se guarda en este navegador y también puede exportarse a un archivo
            local. Los modelos STL originales del pack no se cargan, no se sirven y no se publican: el sandbox usa
            representaciones originales y simplificadas.
          </span>
        </div>
      </div>
    </div>
  );
}
