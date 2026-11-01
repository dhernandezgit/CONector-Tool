import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Box, Camera, Rotate3D } from "lucide-react";
import type { AlleyProjection, AlleyViewName } from "./types";

interface Props {
  view: AlleyViewName;
  projection: AlleyProjection;
  azimuth: number;
  polar: number;
  onView: (view: AlleyViewName) => void;
  onProjection: (projection: AlleyProjection) => void;
  onOrbit: (dx: number, dy: number) => void;
}

const FACES: Array<{ label: string; className: string }> = [
  { label: "FRENTE", className: "front" },
  { label: "DETRÁS", className: "back" },
  { label: "IZQ.", className: "left" },
  { label: "DER.", className: "right" },
  { label: "ARRIBA", className: "top" },
  { label: "ISO", className: "bottom" },
];

export default function ViewCube({ view, projection, azimuth, polar, onView, onProjection, onOrbit }: Props) {
  const [local, setLocal] = useState({ azimuth, polar });
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    setLocal({ azimuth, polar });
  }, [azimuth, polar]);

  useEffect(() => {
    if (view === "front") setLocal({ azimuth: -90, polar: 90 });
    else if (view === "back") setLocal({ azimuth: 90, polar: 90 });
    else if (view === "left") setLocal({ azimuth: 180, polar: 90 });
    else if (view === "right") setLocal({ azimuth: 0, polar: 90 });
    else if (view === "top") setLocal({ azimuth: -90, polar: 0.1 });
    else setLocal({ azimuth: -53, polar: 65 });
  }, [view]);

  const pitch = local.polar - 90;
  const yaw = -local.azimuth - 90;

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    drag.current = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId };
    suppressClick.current = false;
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    if (!current.moved) {
      current.moved = true;
      suppressClick.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* no capture */
      }
    }
    current.x = event.clientX;
    current.y = event.clientY;
    setLocal((value) => ({
      azimuth: value.azimuth - dx * 0.55,
      polar: Math.max(4, Math.min(88, value.polar - dy * 0.45)),
    }));
    onOrbit(dx, dy);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (current.moved) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* no capture */
      }
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  };

  const chooseZone = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (y < 0.3) onView("top");
    else if (y > 0.78) onView("iso");
    else if (x < 0.28) onView("left");
    else if (x > 0.72) onView("right");
    else onView("front");
  };

  return (
    <div className="view-cube-panel" aria-label="Cubo de vistas">
      <div className="view-cube-stage">
        <div
          className="view-cube"
          style={{ transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)` }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={chooseZone}
          title="Toca arriba para vista superior, a los lados para lateral, al centro para frontal. Arrastra para orbitar."
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onView("iso");
            }
          }}
        >
          {FACES.map((face) => (
            <span key={face.className} className={`view-cube-face ${face.className}`} aria-hidden="true">
              {face.label}
            </span>
          ))}
        </div>
        <span className="view-cube-axis" aria-hidden="true">
          <Rotate3D size={12} />
        </span>
      </div>
      <div className="view-cube-modes" role="group" aria-label="Proyección de cámara">
        <button
          type="button"
          className={projection === "isometric" ? "active" : ""}
          onClick={() => onProjection("isometric")}
          title="Isométrico: sin perspectiva, ideal para colocar piezas"
        >
          <Box size={13} /> Iso
        </button>
        <button
          type="button"
          className={projection === "perspective" ? "active" : ""}
          onClick={() => onProjection("perspective")}
          title="Perspectiva: vista realista con profundidad"
        >
          <Camera size={13} /> Persp.
        </button>
      </div>
      <div className="view-cube-foot">
        <small className="view-cube-hint">Orbitar</small>
        <button type="button" className="view-cube-back" onClick={() => onView("back")}>
          Detrás
        </button>
      </div>
    </div>
  );
}
