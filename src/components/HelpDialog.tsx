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
              El catálogo incluye paneles, expositores, estantes, baldas, organizadores laterales, cajas base, accesorios
              y el toldo. La escena inicial es la doble torre sobre seis cajas rosas y seis toldos, con las cajas unidas al
              grupo de torres. Las cajas llevan sus propios Edge2_Corner y Edge3_Corner, y se enlazan con 360 Connector. La
              estantería de organizadores es opcional. Los grupos rápidos colocan composiciones completas.
            </p>
          </article>
          <article>
            <span className="help-num">02</span>
            <h3>Coloca en isométrico</h3>
            <p>
              El cubo de arriba a la derecha alterna entre isométrico y perspectiva. En isométrico no hay distorsión y es
              más fácil alinear paneles. Arrastra el cubo o el fondo para orbitar; toca una zona del cubo para cambiar de
              vista. El modo claro es el predeterminado y el fondo del visor se cambia en el inspector.
            </p>
          </article>
          <article>
            <span className="help-num">03</span>
            <h3>Arrastra y conecta</h3>
            <p>
              Arrastra una pieza cerca de un puerto: se imanta, se mueve en directo y muestra una línea con el panel destino
              y el conector que se formará. Al soltar queda unida. El botón **Auto unir / Libre** alterna entre ese imán y
              el movimiento libre sin conexión automática; las esferas siguen sirviendo para conectar a mano. Las esferas
              libres son rosas suaves, las conectadas rosas oscuras, el origen rosa intenso y el destino rosa brillante.
            </p>
          </article>
          <article>
            <span className="help-num">04</span>
            <h3>Cambia el conector</h3>
            <p>
              Selecciona una unión para ver sus piezas y cambiar el tipo de conector. Solo aparecen los conectores reales
              que encajan: Edge2/3/4/5/7, Angled30/45, placas Skadis, dovetail, rejilla, ranura de organizador, montaje de
              toldo integrado y 360 Connector para la base. La esquina superior del toldo coincide con la esquina del panel;
              sus patas cortas se insertan en los conectores de esquina existentes (no incluidos), la lona baja hacia
              delante y su faldón de lóbulos curvos queda a unos 30° sin llegar al suelo. Al seleccionar un panel puedes
              cambiarlo por su equivalente del mismo tamaño; el fondo del visor se elige en el inspector.
            </p>
          </article>
          <article>
            <span className="help-num">05</span>
            <h3>Selecciona, copia y agrupa</h3>
            <p>
              Con Mayús + clic añade o quita piezas; la herramienta de rectángulo (`2`) selecciona todo lo que cae dentro.
              Al arrastrar una pieza seleccionada se mueve todo el conjunto. Usa Ctrl+C / Ctrl+V para copiar y pegar, Ctrl+A
              para seleccionar todo, G para agrupar y las flechas para ajustar 1 cm (Mayús: 5 cm). La lista **Tus grupos**
              permite seleccionar grupos completos; Mayús + clic en varios grupos crea un grupo padre. Al desagrupar solo
              se separa un nivel y los subgrupos se mantienen. El color y los campos de transformación se aplican al grupo.
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
              En «Mesas de trabajo» puedes añadir una mesa recta o una mesa en L girada 90°. Arrastra una mesa desde una
              zona libre del tablero para moverla con todo lo que tiene encima y usa «Bloquear mesa» para fijarla. Las mesas
              comparten altura; los ejemplos «Mesa en L de trabajo» y «Mesa en L + pared» montan la configuración completa.
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
            1/2/3/4 cambian de herramienta · PgUp/PgDn sube o baja 5 cm · R/E gira +90° · Q gira -90° · Ctrl+C/V copia
            y pega · Ctrl+D duplica · Ctrl+G agrupa · Supr elimina · F encuadra · Ctrl+Z deshace · Ctrl+Mayús+Z o Ctrl+Y
            rehace · Esc cancela una conexión. Todo se guarda en este
            navegador y también puede exportarse a un archivo local. Los modelos STL originales del pack no se cargan, no se
            sirven y no se publican: el sandbox usa representaciones originales y simplificadas.
          </span>
        </div>
      </div>
    </div>
  );
}
