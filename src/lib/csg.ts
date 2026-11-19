import type { BuildResult } from "../types";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { base64ToBytes, bytesToBase64 } from "./utils";

type WasmManifold = {
  setup: () => void;
  Manifold: {
    ofMesh: (mesh: unknown) => { subtract: (other: unknown) => unknown; getMesh: () => { vertProperties: Float32Array; triVerts: Uint32Array } };
  };
  Mesh: new (options: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array }) => unknown;
};

let wasmPromise: Promise<WasmManifold> | null = null;

async function getWasm(): Promise<WasmManifold> {
  if (!wasmPromise) {
    wasmPromise = import("manifold-3d").then(async (loaded) => {
      const factory = (loaded.default ?? loaded) as unknown as (options?: { locateFile?: () => string }) => Promise<WasmManifold>;
      const wasm = await factory({ locateFile: () => wasmUrl });
      wasm.setup();
      return wasm;
    });
  }
  return wasmPromise;
}

type StlGeometry = { vertices: Float32Array; triangles: Uint32Array };

function parseBinaryStl(bytes: Uint8Array): StlGeometry {
  if (bytes.byteLength < 84) return { vertices: new Float32Array(), triangles: new Uint32Array() };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const welded: number[] = [];
  const triangles: number[] = [];
  const index = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const offset = 84 + i * 50;
    for (let corner = 0; corner < 3; corner++) {
      const o = offset + 12 + corner * 12;
      const x = view.getFloat32(o, true);
      const y = view.getFloat32(o + 4, true);
      const z = view.getFloat32(o + 8, true);
      const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
      let idx = index.get(key);
      if (idx === undefined) {
        idx = welded.length / 3;
        index.set(key, idx);
        welded.push(x, y, z);
      }
      triangles.push(idx);
    }
  }
  return { vertices: new Float32Array(welded), triangles: new Uint32Array(triangles) };
}

function toManifold(wasm: WasmManifold, geometry: StlGeometry) {
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: geometry.vertices,
    triVerts: geometry.triangles,
  });
  return wasm.Manifold.ofMesh(mesh);
}

function writeBinaryStl(vertices: Float32Array, triangles: Uint32Array): Uint8Array {
  const count = triangles.length / 3;
  const bytes = new Uint8Array(84 + count * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, count, true);
  for (let i = 0; i < count; i++) {
    const a = triangles[i * 3] * 3;
    const b = triangles[i * 3 + 1] * 3;
    const c = triangles[i * 3 + 2] * 3;
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2];
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2];
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    const o = 84 + i * 50;
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
    view.setFloat32(o + 12, ax, true); view.setFloat32(o + 16, ay, true); view.setFloat32(o + 20, az, true);
    view.setFloat32(o + 24, bx, true); view.setFloat32(o + 28, by, true); view.setFloat32(o + 32, bz, true);
    view.setFloat32(o + 36, cx, true); view.setFloat32(o + 40, cy, true); view.setFloat32(o + 44, cz, true);
  }
  return bytes;
}

export async function applyCsg(build: BuildResult): Promise<BuildResult> {
  if (!build.csg || !build.parts.length) return build;
  const wasm = await getWasm();
  let result: any = toManifold(wasm, parseBinaryStl(base64ToBytes(build.csg.base_b64)));
  for (const cutter of build.csg.cutters_b64) {
    result = (result as { subtract: (other: unknown) => unknown }).subtract(
      toManifold(wasm, parseBinaryStl(base64ToBytes(cutter))),
    );
  }
  const mesh = result.getMesh();
  const vertices = mesh.vertProperties;
  const triangles = mesh.triVerts;
  const stl = writeBinaryStl(vertices, triangles);
  const encoded = bytesToBase64(stl);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let signedVolume = 0;
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3;
    signedVolume += (
      vertices[a] * (vertices[b + 1] * vertices[c + 2] - vertices[b + 2] * vertices[c + 1]) +
      vertices[a + 1] * (vertices[b + 2] * vertices[c] - vertices[b] * vertices[c + 2]) +
      vertices[a + 2] * (vertices[b] * vertices[c + 1] - vertices[b + 1] * vertices[c])
    ) / 6;
  }
  const dims: [number, number, number] = [maxX - minX, maxY - minY, maxZ - minZ];
  const bounds = { min: [minX, minY, minZ] as [number, number, number], max: [maxX, maxY, maxZ] as [number, number, number] };
  const part = build.parts[0];
  part.b64 = encoded;
  part.print_b64 = encoded;
  part.bounds = bounds;
  part.print_bounds = bounds;
  part.dimensions = dims;
  part.print_dimensions = dims;
  part.volume = Math.abs(signedVolume);
  part.triangles = triangles.length / 3;
  part.watertight = true;
  part.overhang = 0;
  part.print_overhang = 0;
  part.print_orientation = "CSG";
  build.dimensions = { width: dims[0], height: dims[2], depth: dims[1] };
  build.csg = undefined;
  return build;
}
