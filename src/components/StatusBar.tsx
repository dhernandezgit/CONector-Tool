import { AlertTriangle, Box, CheckCircle2, CircleDashed, Loader2, Weight } from "lucide-react";
import type { BuildResult } from "../types";
import { fmt } from "../lib/utils";

export default function StatusBar({
  build,
  building,
  engineReady,
  progressText,
}: {
  build: BuildResult | null;
  building: boolean;
  engineReady: boolean;
  progressText: string;
}) {
  const warnings = build?.checks.filter((check) => check.level !== "info").length || 0;
  return (
    <footer className="status-bar">
      <span className={`status-engine ${engineReady ? "ready" : "loading"}`}>
        {engineReady ? <CheckCircle2 size={13} /> : <Loader2 size={13} className="spin" />}
        {engineReady ? "Motor Python listo" : progressText}
      </span>
      {building && (
        <span className="status-item">
          <CircleDashed size={13} className="spin" /> generando
        </span>
      )}
      {build && (
        <>
          <span className="status-item">
            <Box size={13} />
            {fmt(build.dimensions.width)} × {fmt(build.dimensions.height)} × {fmt(build.dimensions.depth)} mm
          </span>
          <span className="status-item">
            <Weight size={13} />
            {fmt(build.material_grams, 1)} g
          </span>
          <span className={`status-item ${warnings ? "warn" : "ok"}`}>
            {warnings ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
            {warnings ? `${warnings} aviso${warnings === 1 ? "" : "s"}` : "sin avisos"}
          </span>
        </>
      )}
      <span className="status-spacer" />
      <span className="status-item muted">Local-first · sin subir archivos · {build?.version ? `v${build.version}` : "v0.1"}</span>
    </footer>
  );
}
