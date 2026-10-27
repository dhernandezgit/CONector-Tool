/// <reference lib="webworker" />

/* Python geometry engine running in the browser. */

const CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";
type Pyodide = {
  loadPackage: (names: string[]) => Promise<unknown>;
  FS: { writeFile: (path: string, data: Uint8Array) => void };
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: { set: (name: string, value: string) => void };
};

let py: Pyodide | null = null;
let ready = false;

function send(message: Record<string, unknown>) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

function progress(text: string, step?: number) {
  send({ type: "progress", text, step });
}

async function boot(zipUrl: string) {
  if (ready) {
    send({ type: "ready" });
    return;
  }
  progress("Cargando Python en el navegador…", 1);
  const mod = await import(/* @vite-ignore */ `${CDN}pyodide.mjs`);
  py = (await mod.loadPyodide({ indexURL: CDN })) as Pyodide;

  progress("Cargando NumPy, Shapely, Pillow y OpenCV…", 2);
  await py.loadPackage(["numpy", "pillow", "shapely", "opencv-python"]);

  progress("Descargando el motor de conectores…", 3);
  const response = await fetch(zipUrl, { cache: "no-cache" });
  if (!response.ok) throw new Error(`No se pudo descargar el motor (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  py.FS.writeFile("/connectors.zip", bytes);

  progress("Preparando el motor…", 4);
  await py.runPythonAsync(`
import zipfile, sys, os
os.makedirs("/motor", exist_ok=True)
with zipfile.ZipFile("/connectors.zip") as z:
    z.extractall("/motor")
sys.path.insert(0, "/motor")
`);
  ready = true;
  progress("Motor listo", 5);
  send({ type: "ready" });
}

async function call(name: string, payload: unknown) {
  if (!py) throw new Error("El motor Python no está listo.");
  py.globals.set("_payload", JSON.stringify(payload));
  const result = await py.runPythonAsync(
    `from conectors import webapi\nwebapi.${name}(_payload)`,
  );
  return JSON.parse(String(result));
}

let queue: Promise<void> = Promise.resolve();

async function handle(data: Record<string, any>) {
  try {
    if (data.type === "init") {
      await boot(String(data.zipUrl));
      return;
    }
    if (!ready || !py) throw new Error("El motor de Python todavía no está listo.");
    let result: unknown;
    if (data.type === "build") result = await call("construir", data.payload);
    else if (data.type === "analyze") result = await call("analizar", data.payload);
    else if (data.type === "export3mf") result = await call("exportar_3mf", data.payload);
    else if (data.type === "exportKit") result = await call("exportar_kit", data.payload);
    else throw new Error(`Operación desconocida: ${data.type}`);
    send({ type: "result", id: data.id, data: result });
  } catch (error) {
    const message = String((error as { message?: string })?.message || error);
    if (data.type === "init") send({ type: "fatal", error: message });
    else send({ type: "error", id: data.id, error: message });
  }
}

self.onmessage = (event: MessageEvent) => {
  const data = (event.data || {}) as Record<string, any>;
  queue = queue.then(() => handle(data));
};
