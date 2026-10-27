import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildResult, ConnectorSettings, ShapeAnalysis } from "../types";
import { base64ToBlob, bytesToBase64, downloadBlob } from "../lib/utils";

type Status = "loading" | "ready" | "error";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

const TIMEOUT_MS = 180_000;

export function usePythonEngine() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);
  const readyRef = useRef(false);
  const [bootKey, setBootKey] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [progressText, setProgressText] = useState("Preparando el motor Python…");
  const [progressStep, setProgressStep] = useState(0);
  const [engineError, setEngineError] = useState("");

  const rejectAll = useCallback((message: string) => {
    for (const [, item] of pending.current) {
      window.clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    pending.current.clear();
  }, []);

  useEffect(() => {
    setStatus("loading");
    setEngineError("");
    setProgressText("Preparando el motor Python…");
    setProgressStep(0);
    readyRef.current = false;
    const worker = new Worker(new URL("../workers/pyodide.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === "progress") {
        setProgressText(String(data.text || ""));
        setProgressStep(Number(data.step || 0));
        return;
      }
      if (data.type === "ready") {
        readyRef.current = true;
        setStatus("ready");
        setProgressText("Motor listo");
        setProgressStep(5);
        return;
      }
      if (data.type === "fatal") {
        readyRef.current = false;
        setStatus("error");
        setEngineError(String(data.error || "No se pudo iniciar el motor Python."));
        rejectAll(String(data.error || "No se pudo iniciar el motor Python."));
        return;
      }
      if (data.type === "result" || data.type === "error") {
        const item = pending.current.get(Number(data.id));
        if (!item) return;
        pending.current.delete(Number(data.id));
        window.clearTimeout(item.timer);
        if (data.type === "result") item.resolve(data.data);
        else item.reject(new Error(String(data.error || "Error del motor Python")));
      }
    };
    worker.onerror = (event) => {
      const message = event.message || "No se pudo iniciar el motor Python.";
      readyRef.current = false;
      setStatus("error");
      setEngineError(message);
      rejectAll(message);
    };
    worker.onmessageerror = () => {
      const message = "El motor ha devuelto una respuesta ilegible.";
      readyRef.current = false;
      setStatus("error");
      setEngineError(message);
      rejectAll(message);
    };
    const zipUrl = new URL("connectors.zip", document.baseURI).href;
    worker.postMessage({ type: "init", zipUrl });
    return () => {
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
      rejectAll("El motor Python se reinició.");
    };
  }, [bootKey, rejectAll]);

  const restart = useCallback(() => {
    setEngineError("");
    setBootKey((value) => value + 1);
  }, []);

  const request = useCallback((type: string, payload: unknown): Promise<any> => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("El motor no está iniciado."));
    if (!readyRef.current) return Promise.reject(new Error("El motor Python todavía está cargando."));
    const id = nextId.current++;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.current.delete(id);
        reject(new Error("El motor ha tardado demasiado. Prueba un modelo más sencillo."));
      }, TIMEOUT_MS);
      pending.current.set(id, { resolve, reject, timer });
      worker.postMessage({ type, id, payload });
    });
  }, []);

  const build = useCallback(async (settings: ConnectorSettings): Promise<BuildResult> => {
    const result = await request("build", settings);
    if (!result.ok) throw new Error(result.error || "No se pudo generar la geometría.");
    return result as BuildResult;
  }, [request]);

  const analyzeFile = useCallback(async (file: File, targetMm = 70): Promise<ShapeAnalysis> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await request("analyze", {
      filename: file.name,
      data_b64: bytesToBase64(bytes),
      target_mm: targetMm,
      // Decorations use the outer silhouette, not the line-art tracing path.
      force_filled: true,
    });
    if (!result.ok) throw new Error(result.error || "No se pudo analizar el dibujo.");
    return result as ShapeAnalysis;
  }, [request]);

  const export3mf = useCallback(async (settings: ConnectorSettings, name: string) => {
    const result = await request("export3mf", settings);
    if (!result.ok) throw new Error(result.error || "No se pudo crear el 3MF.");
    downloadBlob(base64ToBlob(result.data_b64, "application/vnd.ms-3mfdocument"), `${name}.3mf`);
    return result;
  }, [request]);

  const exportKit = useCallback(async (items: Array<{ settings: ConnectorSettings; quantity: number }>, name: string) => {
    const result = await request("exportKit", { items });
    if (!result.ok) throw new Error(result.error || "No se pudo crear el kit 3MF.");
    downloadBlob(base64ToBlob(result.data_b64, "application/vnd.ms-3mfdocument"), `${name}.3mf`);
    return result;
  }, [request]);

  return {
    status,
    ready: status === "ready",
    progressText,
    progressStep,
    engineError,
    restart,
    build,
    analyzeFile,
    export3mf,
    exportKit,
  };
}
