import { ExternalLink, Github, Heart, X } from "lucide-react";

export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal about-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Acerca de</span>
            <h2>CONector Tool · Artist Alley</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <p className="about-lead">
          Un sandbox 3D para montar y editar un puesto de artistas con paneles, expositores, estantes, baldas,
          organizadores, accesorios y toldo. La escena inicial es una doble torre de cuatro cubos con una estantería
          central de organizadores y dos toldos. Puedes probar composiciones, trabajar sobre una o varias mesas en L,
          copiar y pegar grupos, guardar el proyecto en un archivo local y preparar la lista de materiales antes de montar
          el puesto real.
        </p>

        <div className="about-grid">
          <section>
            <h3>Qué incluye</h3>
            <p>
              Representaciones originales y simplificadas inspiradas en las piezas del Artist Alley STL Pack: paneles
              slatwall, Skadis, rejilla y triangulares, también en medidas de 1/4 y 1/2 y en versión lisa coloreada;
              expositores de 2,5 a 5 pulgadas; risers, mini estante, balda horizontal, organizadores laterales con
              ranuras, bandejas, ganchos, clips, toldo con faldón y sin patas al suelo, y mango de abanico. Los ejemplos
              rápidos combinan paneles con baldas y organizadores, y los conectores se eligen automáticamente entre los
              válidos para cada unión.
            </p>
          </section>
          <section>
            <h3>Qué no incluye</h3>
            <p>
              Los archivos STL comprados no se incluyen, no se cargan, no se sirven y no se publican. Tampoco se ofrece el
              estudio de impresión ni la exportación de modelos en esta versión: el foco es el montaje y la planificación.
            </p>
          </section>
        </div>

        <div className="credit-box">
          <div className="credit-icon">
            <Heart size={18} />
          </div>
          <div>
            <strong>Diseño del pack: Jessie Shi (Sandoik / @sandoikstitches)</strong>
            <p>
              El <strong>Artist Alley STL Pack</strong> es una creación de Jessie Shi. Este sandbox es una herramienta de
              planificación independiente con geometría original y simplificada; no reproduce ni redistribuye sus mallas.
            </p>
            <p>
              El pack es de uso personal. Si quieres imprimir las piezas reales, consigue el pack original y respeta su
              licencia. La atribución se mantiene visible en el catálogo y en esta ventana.
            </p>
            <a href="https://www.instagram.com/sandoikstitches/" target="_blank" rel="noreferrer">
              @sandoikstitches <ExternalLink size={13} />
            </a>
          </div>
        </div>

        <div className="about-footer">
          <span>
            Tu puesto se guarda automáticamente en este navegador y también puede descargarse como archivo local. Los cambios
            se pueden deshacer con Ctrl+Z, las piezas se copian con Ctrl+C / Ctrl+V y la lista de materiales se puede copiar o
            descargar en CSV.
          </span>
          <a href="https://github.com/dhernandezgit/CONector-Tool" target="_blank" rel="noreferrer">
            <Github size={14} /> Repositorio
          </a>
        </div>
      </div>
    </div>
  );
}
