import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CATALOG_BY_TYPE, CONNECTORS } from "./catalog";
import {
  catalogFor,
  connectedPortKeys,
  findSnapForMove,
  itemColor,
  itemDims,
  panelOf,
  planeNormal,
  portCompatible,
  portWorld,
  rotateLocal,
  sceneBounds,
  scenePorts,
} from "./geometry";
import type {
  AlleyItem,
  AlleyJoint,
  AlleyProjection,
  AlleyScene,
  AlleySelection,
  AlleyViewName,
  PortRef,
  Vec3,
  WorldPort,
} from "./types";

const DEG = Math.PI / 180;

export interface AlleyViewportHandle {
  fit: () => void;
  setView: (view: AlleyViewName) => void;
  orbit: (dx: number, dy: number) => void;
  screenshot: () => string;
}

interface Props {
  scene: AlleyScene;
  selection: AlleySelection | null;
  pendingPort: PortRef | null;
  showPorts: boolean;
  showGrid: boolean;
  projection: AlleyProjection;
  onSelect: (selection: AlleySelection | null) => void;
  onPortClick: (port: PortRef) => void;
  onMoveItems: (ids: string[], dx: number, dy: number, dz: number) => void;
  onMoveMount: (itemId: string, u: number, v: number) => void;
  onCameraChange?: (azimuth: number, polar: number) => void;
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void, size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const texture = (material as THREE.MeshStandardMaterial).map;
        if (texture) texture.dispose();
        material.dispose();
      }
    }
  });
}

function mat(color: string, options: { roughness?: number; metalness?: number; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.68,
    metalness: options.metalness ?? 0.03,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  rotation?: [number, number, number],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 0.01) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.position.copy(from.clone().add(to).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addOutline(parent: THREE.Object3D, dims: { w: number; d: number; h: number }, color = "#e47f9c") {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.w + 6, dims.d + 6, dims.h + 6)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
  );
  outline.position.z = dims.h / 2;
  parent.add(outline);
}

function slatTexture(color: string) {
  return canvasTexture((ctx, width, height) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    const step = 58;
    for (let y = 18; y < height; y += step) {
      ctx.fillStyle = "rgba(70, 45, 52, 0.18)";
      ctx.fillRect(8, y, width - 16, 12);
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.fillRect(8, y + 12, width - 16, 4);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, width - 12, height - 12);
  });
}

function skadisTexture(color: string) {
  return canvasTexture((ctx, width, height) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(50, 38, 43, 0.28)";
    const stepX = 42;
    const stepY = 36;
    for (let row = 0; row * stepY < height; row += 1) {
      for (let col = 0; col * stepX < width; col += 1) {
        const x = col * stepX + (row % 2 ? stepX / 2 : 0) + 12;
        const y = row * stepY + 12;
        ctx.beginPath();
        ctx.roundRect(x, y, 11, 19, 5);
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, width - 10, height - 10);
  });
}

function stripeTexture(color: string) {
  return canvasTexture((ctx, width, height) => {
    ctx.fillStyle = "#fff8f4";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color;
    const stripe = width / 10;
    for (let i = 0; i < 10; i += 2) ctx.fillRect(i * stripe, 0, stripe, height);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, 0, width, 10);
    ctx.fillStyle = "rgba(95, 55, 65, 0.12)";
    ctx.fillRect(0, height - 14, width, 14);
  }, 256);
}

function buildFlatPanel(item: AlleyItem, texture: THREE.Texture, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const base = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.d, dims.h), mat(itemColor(item), { roughness: 0.78 }));
  base.position.z = dims.h / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  for (const sign of [-1, 1]) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(dims.w - 10, dims.h - 10),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, side: THREE.DoubleSide }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.set(0, sign * (dims.d / 2 + 0.6), dims.h / 2);
    face.castShadow = true;
    face.receiveShadow = true;
    group.add(face);
  }
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.w, dims.d, dims.h)),
    new THREE.LineBasicMaterial({ color: 0x6f4d59, transparent: true, opacity: 0.55 }),
  );
  border.position.z = dims.h / 2;
  group.add(border);
  if (selected) addOutline(group, dims);
  return group;
}

function buildWirePanel(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const color = new THREE.Color(itemColor(item));
  const frameMat = mat(`#${color.clone().multiplyScalar(0.72).getHexString()}`, { roughness: 0.42, metalness: 0.28 });
  const bar = 7;
  const depth = 10;
  addBox(group, [dims.w, depth, bar], [0, 0, dims.h - bar / 2], frameMat);
  addBox(group, [dims.w, depth, bar], [0, 0, bar / 2], frameMat);
  addBox(group, [bar, depth, dims.h], [-dims.w / 2 + bar / 2, 0, dims.h / 2], frameMat);
  addBox(group, [bar, depth, dims.h], [dims.w / 2 - bar / 2, 0, dims.h / 2], frameMat);
  const pitch = 50;
  const points: number[] = [];
  for (let x = -dims.w / 2 + pitch; x < dims.w / 2 - pitch / 2; x += pitch) {
    points.push(x, 0, bar, x, 0, dims.h - bar);
  }
  for (let z = bar + pitch; z < dims.h - pitch / 2; z += pitch) {
    points.push(-dims.w / 2 + bar, 0, z, dims.w / 2 - bar, 0, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: frameMat.color, transparent: true, opacity: 0.8 })));
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.w, dims.h),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  hit.rotation.x = -Math.PI / 2;
  hit.position.z = dims.h / 2;
  hit.userData.pickTarget = true;
  group.add(hit);
  if (selected) addOutline(group, dims);
  return group;
}

function buildTrianglePanel(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const shape = new THREE.Shape();
  shape.moveTo(-dims.w / 2, 0);
  shape.lineTo(dims.w / 2, 0);
  shape.lineTo(-dims.w / 2, -dims.h);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: dims.d, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -dims.d / 2, 0);
  const mesh = new THREE.Mesh(geometry, mat(itemColor(item), { roughness: 0.75 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x5d7a72, transparent: true, opacity: 0.65 }),
  );
  group.add(border);
  if (selected) addOutline(group, dims);
  return group;
}

function buildDisplay(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const catalog = catalogFor(item);
  const color = itemColor(item);
  const levels = Number(catalog.tags.find((tag) => /^\d+$/.test(tag)) || 4);
  const dark = new THREE.Color(color).multiplyScalar(0.72);
  const frameMat = mat(`#${dark.getHexString()}`, { roughness: 0.55 });
  const bodyMat = mat(color, { roughness: 0.72 });
  const shelfMat = mat("#fff8f4", { roughness: 0.6 });
  addBox(group, [dims.w, dims.d, 10], [0, 0, 5], frameMat);
  addBox(group, [dims.w, 8, dims.h], [0, dims.d / 2 - 4, dims.h / 2], bodyMat);
  addBox(group, [10, dims.d, dims.h], [-dims.w / 2 + 5, 0, dims.h / 2], bodyMat);
  addBox(group, [10, dims.d, dims.h], [dims.w / 2 - 5, 0, dims.h / 2], bodyMat);
  const slope = 82;
  const front = addBox(group, [dims.w - 20, 8, dims.h * 0.96], [0, -dims.d / 2 + slope / 2 + 4, dims.h / 2], mat("#fbe9ee", { roughness: 0.7 }), [
    -Math.atan2(slope, dims.h),
    0,
    0,
  ]);
  front.castShadow = true;
  const cardColors = ["#f7d9e4", "#cfe8e2", "#f4d99a", "#d9c2e8", "#f4a7bb", "#b9d8ee"];
  for (let level = 1; level <= levels; level += 1) {
    const z = (dims.h * level) / (levels + 1);
    const shelf = addBox(group, [dims.w - 18, 74, 8], [0, -dims.d / 2 + 48, z], shelfMat);
    shelf.castShadow = true;
    addBox(group, [dims.w - 18, 8, 15], [0, -dims.d / 2 + 12, z + 9], bodyMat);
    for (let card = 0; card < 3; card += 1) {
      const cardMesh = addBox(
        group,
        [Math.min(58, dims.w / 4), 2, 58],
        [-dims.w / 3 + card * (dims.w / 3), -dims.d / 2 + 48, z + 32],
        mat(cardColors[(level + card) % cardColors.length], { roughness: 0.85 }),
        [0, 0, 0],
      );
      cardMesh.rotation.x = -0.12;
    }
  }
  addBox(group, [dims.w - 14, 8, 18], [0, dims.d / 2 - 4, dims.h - 9], frameMat);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.w * 0.55, 26),
    new THREE.MeshBasicMaterial({ color: "#fff8f4", transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, dims.d / 2 + 0.7, dims.h - 24);
  group.add(label);
  if (selected) addOutline(group, dims);
  return group;
}

function buildRiser(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const catalog = catalogFor(item);
  const levels = Number(catalog.tags.find((tag) => /^\d+$/.test(tag)) || 3);
  const color = itemColor(item);
  const sideMat = mat(color, { roughness: 0.72 });
  const shelfMat = mat("#fff8f4", { roughness: 0.66 });
  for (const x of [-dims.w / 2 + 6, dims.w / 2 - 6]) {
    addBox(group, [12, dims.d, dims.h], [x, 0, dims.h / 2], sideMat);
    addBox(group, [16, dims.d + 8, 12], [x, 0, 6], sideMat);
  }
  for (let level = 1; level <= levels; level += 1) {
    const z = (dims.h * level) / (levels + 1);
    addBox(group, [dims.w - 16, dims.d - 12, 12], [0, 0, z], shelfMat);
    addBox(group, [dims.w - 16, 5, 18], [0, -dims.d / 2 + 6, z + 10], mat(color, { roughness: 0.7 }));
  }
  for (const x of [-dims.w / 2 + 18, dims.w / 2 - 18]) {
    const brace = addBox(group, [8, 18, dims.h * 0.8], [x, dims.d / 2 - 12, dims.h / 2], sideMat);
    brace.rotation.x = 0.1;
  }
  if (selected) addOutline(group, dims);
  return group;
}

function buildOrganizer(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const color = itemColor(item);
  const backMat = mat(color, { roughness: 0.7 });
  addBox(group, [dims.w, 8, dims.h], [0, dims.d / 2 - 4, dims.h / 2], backMat);
  const shelfMat = mat("#fff8f4", { roughness: 0.62 });
  for (let level = 0; level < 4; level += 1) {
    const z = dims.h * (0.18 + level * 0.21);
    addBox(group, [dims.w - 12, dims.d - 8, 7], [0, 0, z], shelfMat);
    addBox(group, [dims.w - 12, 6, 20], [0, -dims.d / 2 + 3, z + 12], backMat);
    addBox(group, [dims.w - 20, dims.d - 12, 18], [0, 0, z + 11], mat(["#f7d9e4", "#cfe8e2", "#f4d99a", "#d9c2e8"][level], { roughness: 0.8, transparent: true, opacity: 0.8 }));
  }
  if (selected) addOutline(group, dims);
  return group;
}

function buildHook(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const material = mat(itemColor(item), { roughness: 0.55, metalness: 0.15 });
  addBox(group, [dims.w, 8, dims.h * 0.8], [0, dims.d / 2 - 4, dims.h * 0.5], material);
  const curve = new THREE.Mesh(new THREE.TorusGeometry(14, 4, 8, 18, Math.PI * 1.25), material);
  curve.position.set(0, -dims.d / 2 + 18, dims.h * 0.5);
  curve.rotation.set(Math.PI / 2, 0, Math.PI * 0.1);
  group.add(curve);
  addBox(group, [10, 34, 7], [0, -dims.d / 2 + 18, dims.h * 0.5 + 18], material);
  if (selected) addOutline(group, dims);
  return group;
}

function buildClips(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const material = mat(itemColor(item), { roughness: 0.6 });
  for (let i = 0; i < 4; i += 1) {
    const x = -dims.w / 2 + 18 + i * ((dims.w - 36) / 3);
    addBox(group, [12, 8, dims.h], [x, dims.d / 2 - 4, dims.h / 2], material);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 3.2, 8, 16, Math.PI * 1.4), material);
    ring.position.set(x, -dims.d / 2 + 14, dims.h / 2);
    ring.rotation.set(Math.PI / 2, 0, 0);
    group.add(ring);
  }
  if (selected) addOutline(group, dims);
  return group;
}

function buildBins(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const colors = ["#f7d9e4", "#cfe8e2", "#f4d99a", "#d9c2e8"];
  const count = 4;
  const width = (dims.w - 18) / count;
  for (let i = 0; i < count; i += 1) {
    const x = -dims.w / 2 + 9 + width / 2 + i * width;
    const material = mat(colors[i], { roughness: 0.75 });
    const bin = new THREE.Group();
    bin.position.set(x, 0, 0);
    addBox(bin, [width - 6, dims.d, 6], [0, 0, 3], material);
    addBox(bin, [width - 6, 5, dims.h], [0, dims.d / 2 - 2.5, dims.h / 2], material);
    addBox(bin, [width - 6, 5, dims.h], [0, -dims.d / 2 + 2.5, dims.h / 2], material);
    addBox(bin, [5, dims.d, dims.h], [-width / 2 + 2.5, 0, dims.h / 2], material);
    addBox(bin, [5, dims.d, dims.h], [width / 2 - 2.5, 0, dims.h / 2], material);
    group.add(bin);
  }
  if (selected) addOutline(group, dims);
  return group;
}

function buildFanHandle(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const shape = new THREE.Shape();
  const w = dims.w / 2;
  const d = dims.d / 2;
  shape.moveTo(-w, -d);
  shape.lineTo(w, -d);
  shape.lineTo(w, d - 26);
  shape.quadraticCurveTo(0, d + 18, -w, d - 26);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, d - 42, 13, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false });
  const mesh = new THREE.Mesh(geometry, mat(itemColor(item), { roughness: 0.7 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const lock = addBox(group, [18, 24, 4], [dims.w / 2 + 16, 0, 2], mat("#c9a87c", { roughness: 0.6 }));
  lock.castShadow = true;
  if (selected) addOutline(group, dims);
  return group;
}

function buildAwning(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const color = itemColor(item);
  const legMat = mat("#f8e6ea", { roughness: 0.55 });
  const frameMat = mat("#d98fa5", { roughness: 0.55 });
  const legX = dims.w * 0.3;
  for (const x of [-legX, legX]) {
    addBox(group, [11, 11, dims.h - 30], [x, 0, (dims.h - 30) / 2], legMat);
    addBox(group, [22, 22, 8], [x, 0, 4], frameMat);
  }
  const canopyTexture = stripeTexture(color);
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(dims.w, dims.d * 0.9, 8),
    new THREE.MeshStandardMaterial({ map: canopyTexture, roughness: 0.7, side: THREE.DoubleSide }),
  );
  canopy.position.set(0, -dims.d * 0.3, dims.h - 18);
  canopy.rotation.x = -0.12;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  group.add(canopy);
  const frontZ = dims.h - 26;
  for (let i = 0; i < 9; i += 1) {
    const x = -dims.w / 2 + (i + 0.5) * (dims.w / 9);
    const scallop = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { roughness: 0.7 }));
    scallop.position.set(x, -dims.d * 0.75, frontZ);
    scallop.rotation.x = Math.PI / 2;
    group.add(scallop);
  }
  for (const x of [-legX, legX]) {
    const armStart = new THREE.Vector3(x, 0, dims.h - 42);
    const armEnd = new THREE.Vector3(x, -dims.d * 0.62, dims.h - 4);
    cylinderBetween(group, armStart, armEnd, 4.5, frameMat);
  }
  addBox(group, [dims.w * 0.9, 9, 9], [0, dims.d * 0.12, dims.h - 32], frameMat);
  if (selected) addOutline(group, dims);
  return group;
}

function buildItem(item: AlleyItem, selected: boolean): THREE.Group {
  const catalog = catalogFor(item);
  let group: THREE.Group;
  switch (item.type) {
    case "slatwall30":
    case "slatwall35":
      group = buildFlatPanel(item, slatTexture(itemColor(item)), selected);
      break;
    case "skadis30":
    case "skadis35":
      group = buildFlatPanel(item, skadisTexture(itemColor(item)), selected);
      break;
    case "wire30":
    case "wire35":
      group = buildWirePanel(item, selected);
      break;
    case "triangle":
      group = buildTrianglePanel(item, selected);
      break;
    case "display25":
    case "display3":
    case "display4":
    case "display5":
      group = buildDisplay(item, selected);
      break;
    case "riser1":
    case "riser3":
    case "minishelf":
      group = buildRiser(item, selected);
      break;
    case "organizer":
      group = buildOrganizer(item, selected);
      break;
    case "shelfhook":
      group = buildHook(item, selected);
      break;
    case "panelclips":
      group = buildClips(item, selected);
      break;
    case "bins":
      group = buildBins(item, selected);
      break;
    case "fanhandle":
      group = buildFanHandle(item, selected);
      break;
    case "awning30":
    case "awning35":
      group = buildAwning(item, selected);
      break;
    default:
      group = buildFlatPanel(item, slatTexture(itemColor(item)), selected);
  }
  group.position.set(item.x, item.y, item.baseZ);
  group.rotation.z = item.rotation * DEG;
  group.userData = { type: "item", id: item.id };
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).castShadow = true;
      (child as THREE.Mesh).receiveShadow = true;
    }
  });
  return group;
}

function buildJoint(scene: AlleyScene, joint: AlleyJoint, selected: boolean): THREE.Group {
  const group = new THREE.Group();
  const def = CONNECTORS[joint.type];
  const color = joint.suppressed ? "#9aa0a4" : def?.color || "#e47f9c";
  const material = mat(color, { roughness: 0.4, metalness: 0.08, transparent: joint.suppressed, opacity: joint.suppressed ? 0.35 : 1 });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), material);
  hub.castShadow = true;
  group.add(hub);
  for (const ref of joint.ports) {
    const item = scene.items.find((candidate) => candidate.id === ref.itemId);
    if (!item) continue;
    const port = portWorld(item, ref.portId);
    if (!port) continue;
    const direction = new THREE.Vector3(-port.nx, -port.ny, -port.nz);
    if (direction.lengthSq() < 0.01) continue;
    direction.normalize();
    const start = direction.clone().multiplyScalar(4);
    const end = direction.clone().multiplyScalar(22);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 18, 10), material);
    arm.position.copy(start.clone().add(end).multiplyScalar(0.5));
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    arm.castShadow = true;
    group.add(arm);
  }
  if (selected) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(17, 2.4, 8, 24), new THREE.MeshBasicMaterial({ color: 0xf4c542 }));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  group.position.set(joint.x, joint.y, joint.z);
  group.userData = { type: "joint", id: joint.id };
  return group;
}

function buildPortSphere(port: WorldPort, color: string, radius: number): THREE.Mesh {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false }),
  );
  sphere.position.set(port.x, port.y, port.z);
  sphere.renderOrder = 20;
  sphere.userData = { type: "port", itemId: port.itemId, portId: port.portId };
  return sphere;
}

function updateCameraFrustum(
  perspective: THREE.PerspectiveCamera,
  ortho: THREE.OrthographicCamera,
  width: number,
  height: number,
  orthoHeight: number,
) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  perspective.aspect = aspect;
  perspective.updateProjectionMatrix();
  ortho.left = (-orthoHeight * aspect) / 2;
  ortho.right = (orthoHeight * aspect) / 2;
  ortho.top = orthoHeight / 2;
  ortho.bottom = -orthoHeight / 2;
  ortho.updateProjectionMatrix();
}

export default forwardRef<AlleyViewportHandle, Props>(function AlleyViewport(
  {
    scene,
    selection,
    pendingPort,
    showPorts,
    showGrid,
    projection,
    onSelect,
    onPortClick,
    onMoveItems,
    onMoveMount,
    onCameraChange,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const perspectiveRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoRef = useRef<THREE.OrthographicCamera | null>(null);
  const viewportSizeRef = useRef({ width: 1, height: 1 });
  const orthoHeightRef = useRef(1600);
  const projectionRef = useRef<AlleyProjection>(projection);
  projectionRef.current = projection;
  const controlsRef = useRef<OrbitControls | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const itemGroups = useRef(new Map<string, THREE.Group>());
  const jointGroups = useRef(new Map<string, THREE.Group>());
  const pickablesRef = useRef<THREE.Object3D[]>([]);
  const portMeshesRef = useRef<THREE.Mesh[]>([]);
  const hoverPortRef = useRef<THREE.Mesh | null>(null);
  const snapMarkerRef = useRef<THREE.Mesh | null>(null);
  const dragRef = useRef<{
    kind: "items" | "mount";
    ids: string[];
    itemId: string;
    startX: number;
    startY: number;
    startZ: number;
    startPointer: THREE.Vector3;
    startPositions: Map<string, { x: number; y: number; z: number }>;
    delta: Vec3;
    moved: boolean;
    mountU: number;
    mountV: number;
    panelId?: string;
  } | null>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const firstFitRef = useRef(false);
  const sceneDataRef = useRef(scene);
  sceneDataRef.current = scene;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const callbacks = useRef({ onSelect, onPortClick, onMoveItems, onMoveMount, onCameraChange });
  callbacks.current = { onSelect, onPortClick, onMoveItems, onMoveMount, onCameraChange };
  const gridRef = useRef(scene.grid);
  gridRef.current = scene.grid;
  const lastCameraReport = useRef({ azimuth: 0, polar: 0, at: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene3 = new THREE.Scene();
    sceneRef.current = scene3;
    const perspective = new THREE.PerspectiveCamera(34, 1, 1, 20000);
    perspective.up.set(0, 0, 1);
    perspective.position.set(1400, -1700, 1350);
    const ortho = new THREE.OrthographicCamera(-800, 800, 800, -800, 1, 20000);
    ortho.up.set(0, 0, 1);
    ortho.position.copy(perspective.position);
    ortho.zoom = 1;
    perspectiveRef.current = perspective;
    orthoRef.current = ortho;
    const camera = projectionRef.current === "isometric" ? ortho : perspective;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0, 900);
    controls.minDistance = 180;
    controls.maxDistance = 8000;
    controls.maxPolarAngle = Math.PI * 0.49;
    controlsRef.current = controls;

    scene3.add(new THREE.HemisphereLight(0xfffaf3, 0x9a8a83, 2.3));
    const key = new THREE.DirectionalLight(0xfff8ef, 3.1);
    key.position.set(1400, -1200, 2200);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -2200;
    key.shadow.camera.right = 2200;
    key.shadow.camera.top = 2200;
    key.shadow.camera.bottom = -2200;
    key.shadow.bias = -0.0004;
    scene3.add(key);
    const fill = new THREE.DirectionalLight(0xffd4c2, 1.25);
    fill.position.set(-1400, 900, 1200);
    scene3.add(fill);
    const rim = new THREE.DirectionalLight(0xc7ddff, 1.6);
    rim.position.set(0, 1600, -1000);
    scene3.add(rim);

    const snapMarker = new THREE.Mesh(
      new THREE.TorusGeometry(16, 3, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xf4c542, transparent: true, opacity: 0.9, depthTest: false }),
    );
    snapMarker.rotation.x = Math.PI / 2;
    snapMarker.visible = false;
    snapMarker.renderOrder = 30;
    scene3.add(snapMarker);
    snapMarkerRef.current = snapMarker;

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const portAt = (event: PointerEvent): PortRef | null => {
      setPointer(event);
      const activeCamera = cameraRef.current;
      if (!activeCamera) return null;
      ray.setFromCamera(pointer, activeCamera);
      const hits = ray.intersectObjects(portMeshesRef.current, false);
      const hit = hits[0];
      if (!hit) return null;
      const data = hit.object.userData;
      return data?.itemId && data?.portId ? { itemId: data.itemId, portId: data.portId } : null;
    };

    const objectAt = (event: PointerEvent): { type: "item" | "joint"; id: string } | null => {
      setPointer(event);
      const activeCamera = cameraRef.current;
      if (!activeCamera) return null;
      ray.setFromCamera(pointer, activeCamera);
      const hits = ray.intersectObjects(pickablesRef.current, true);
      const found: Array<{ type: "item" | "joint"; id: string }> = [];
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (node.userData?.type && node.userData?.id) {
            found.push({ type: node.userData.type, id: node.userData.id });
            break;
          }
          node = node.parent;
        }
      }
      return found.find((item) => item.type === "joint") || found[0] || null;
    };

    const planePoint = (event: PointerEvent, z: number): THREE.Vector3 | null => {
      setPointer(event);
      const activeCamera = cameraRef.current;
      if (!activeCamera) return null;
      ray.setFromCamera(pointer, activeCamera);
      dragPlane.constant = -z;
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(dragPlane, hit) ? hit : null;
    };

    const panelPlanePoint = (event: PointerEvent, panel: AlleyItem): THREE.Vector3 | null => {
      setPointer(event);
      const activeCamera = cameraRef.current;
      if (!activeCamera) return null;
      ray.setFromCamera(pointer, activeCamera);
      const normal = planeNormal(panel);
      const point = new THREE.Vector3(panel.x, panel.y, panel.baseZ + itemDims(panel).h / 2);
      const plane = new THREE.Plane(new THREE.Vector3(normal[0], normal[1], normal[2]), 0);
      plane.constant = -plane.normal.dot(point);
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, hit) ? hit : null;
    };

    const setItemPreview = (ids: string[], delta: Vec3) => {
      for (const id of ids) {
        const group = itemGroups.current.get(id);
        const start = dragRef.current?.startPositions.get(id);
        if (!group || !start) continue;
        group.position.set(start.x + delta[0], start.y + delta[1], start.z + delta[2]);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerStart.current = { x: event.clientX, y: event.clientY };
      const port = portAt(event);
      if (port) {
        event.stopPropagation();
        event.preventDefault();
        callbacks.current.onPortClick(port);
        return;
      }
      const hit = objectAt(event);
      if (!hit) {
        callbacks.current.onSelect(null);
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      const data = sceneDataRef.current;
      if (hit.type === "joint") {
        callbacks.current.onSelect({ type: "joint", ids: [hit.id] });
        return;
      }
      const item = data.items.find((candidate) => candidate.id === hit.id);
      if (!item) return;
      const current = selectionRef.current;
      let selectedIds: string[];
      if (event.shiftKey) {
        const previous = current && current.type !== "joint" ? current.ids : [];
        selectedIds = Array.from(new Set([...previous, item.id]));
        callbacks.current.onSelect({ type: "items", ids: selectedIds });
      } else {
        selectedIds = [item.id];
        callbacks.current.onSelect({ type: "item", ids: [item.id] });
      }
      const moveIds = new Set<string>();
      for (const id of selectedIds) {
        const selected = data.items.find((candidate) => candidate.id === id);
        if (!selected) continue;
        if (selected.groupId) {
          for (const grouped of data.items.filter((candidate) => candidate.groupId === selected.groupId)) moveIds.add(grouped.id);
        } else {
          moveIds.add(selected.id);
        }
      }
      const ids = Array.from(moveIds);
      const startPositions = new Map<string, { x: number; y: number; z: number }>();
      for (const id of ids) {
        const candidate = data.items.find((entry) => entry.id === id);
        if (candidate) startPositions.set(id, { x: candidate.x, y: candidate.y, z: candidate.baseZ });
      }
      if (item.mount) {
        const panel = panelOf(data, item);
        if (!panel) return;
        dragRef.current = {
          kind: "mount",
          ids: [item.id],
          itemId: item.id,
          startX: item.x,
          startY: item.y,
          startZ: item.baseZ,
          startPointer: new THREE.Vector3(),
          startPositions,
          delta: [0, 0, 0],
          moved: false,
          mountU: item.mount.u,
          mountV: item.mount.v,
          panelId: panel.id,
        };
      } else {
        const point = planePoint(event, item.baseZ);
        if (!point) return;
        dragRef.current = {
          kind: "items",
          ids,
          itemId: item.id,
          startX: item.x,
          startY: item.y,
          startZ: item.baseZ,
          startPointer: point,
          startPositions,
          delta: [0, 0, 0],
          moved: false,
          mountU: 0.5,
          mountV: 0.5,
        };
      }
      controls.enabled = false;
      renderer.domElement.setPointerCapture(event.pointerId);
      event.stopImmediatePropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        const port = portAt(event);
        const mesh = port
          ? portMeshesRef.current.find(
              (candidate) => candidate.userData.itemId === port.itemId && candidate.userData.portId === port.portId,
            ) || null
          : null;
        if (hoverPortRef.current && hoverPortRef.current !== mesh) hoverPortRef.current.scale.setScalar(1);
        if (mesh) {
          mesh.scale.setScalar(1.28);
          renderer.domElement.style.cursor = "pointer";
        } else {
          renderer.domElement.style.cursor = "";
        }
        hoverPortRef.current = mesh;
        return;
      }
      if (!drag.moved && Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 3) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      if (drag.kind === "mount") {
        const data = sceneDataRef.current;
        const item = data.items.find((candidate) => candidate.id === drag.itemId);
        const panel = data.items.find((candidate) => candidate.id === drag.panelId);
        if (!item || !panel) return;
        const point = panelPlanePoint(event, panel);
        if (!point) return;
        const angle = panel.rotation * DEG;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = point.x - panel.x;
        const dy = point.y - panel.y;
        const localX = dx * cos + dy * sin;
        const localZ = point.z - panel.baseZ;
        const dims = itemDims(panel);
        const itemDimsValue = itemDims(item);
        const u = Math.max(0.05, Math.min(0.95, 0.5 + localX / dims.w));
        const v = Math.max(0.05, Math.min(0.95, (localZ + itemDimsValue.h / 2) / dims.h));
        drag.mountU = u;
        drag.mountV = v;
        const faceSign = item.mount?.face === "back" ? 1 : -1;
        const local = rotateLocal(panel, [
          (u - 0.5) * dims.w,
          faceSign * (dims.d / 2 + itemDimsValue.d / 2 + 1),
          v * dims.h - itemDimsValue.h / 2,
        ]);
        const group = itemGroups.current.get(item.id);
        if (group) group.position.set(panel.x + local[0], panel.y + local[1], panel.baseZ + local[2]);
        return;
      }
      const point = planePoint(event, drag.startZ);
      if (!point) return;
      const grid = gridRef.current || 1;
      let dx = point.x - drag.startPointer.x;
      let dy = point.y - drag.startPointer.y;
      const snappedX = Math.round((drag.startX + dx) / grid) * grid;
      const snappedY = Math.round((drag.startY + dy) / grid) * grid;
      dx = snappedX - drag.startX;
      dy = snappedY - drag.startY;
      const data = sceneDataRef.current;
      const snap = findSnapForMove(data, drag.ids, [dx, dy, 0], 78);
      const delta: Vec3 = snap ? [snap.dx, snap.dy, snap.dz] : [dx, dy, 0];
      drag.delta = delta;
      setItemPreview(drag.ids, delta);
      const marker = snapMarkerRef.current;
      if (marker) {
        marker.visible = Boolean(snap);
        if (snap) marker.position.set(snap.target.x, snap.target.y, snap.target.z);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      controls.enabled = true;
      if (snapMarkerRef.current) snapMarkerRef.current.visible = false;
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        /* no capture */
      }
      if (!drag.moved) return;
      if (drag.kind === "mount") {
        callbacks.current.onMoveMount(drag.itemId, drag.mountU, drag.mountV);
      } else {
        callbacks.current.onMoveItems(drag.ids, drag.delta[0], drag.delta[1], drag.delta[2]);
      }
      event.stopPropagation();
    };

    const onPointerLeave = () => {
      if (hoverPortRef.current) hoverPortRef.current.scale.setScalar(1);
      hoverPortRef.current = null;
      renderer.domElement.style.cursor = "";
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      viewportSizeRef.current = { width, height };
      renderer.setSize(width, height, false);
      updateCameraFrustum(perspective, ortho, width, height, orthoHeightRef.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      const activeCamera = cameraRef.current;
      if (activeCamera) {
        renderer.render(scene3, activeCamera);
        const offset = activeCamera.position.clone().sub(controls.target);
        const radius = offset.length();
        if (radius > 1) {
          const azimuth = (Math.atan2(offset.y, offset.x) * 180) / Math.PI;
          const polar = (Math.acos(Math.max(-1, Math.min(1, offset.z / radius))) * 180) / Math.PI;
          const now = performance.now();
          const last = lastCameraReport.current;
          if (
            now - last.at > 70 &&
            (Math.abs(azimuth - last.azimuth) > 1.5 || Math.abs(polar - last.polar) > 1.5)
          ) {
            lastCameraReport.current = { azimuth, polar, at: now };
            callbacks.current.onCameraChange?.(azimuth, polar);
          }
        }
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      scene3.traverse((object) => disposeObject(object));
    };
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    const perspective = perspectiveRef.current;
    const ortho = orthoRef.current;
    const current = cameraRef.current;
    if (!controls || !perspective || !ortho || !current) return;
    if (projection === "isometric" && current !== ortho) {
      const target = controls.target.clone();
      const distance = Math.max(300, current.position.distanceTo(target));
      const visibleHeight = 2 * distance * Math.tan((perspective.fov * Math.PI) / 360);
      orthoHeightRef.current = visibleHeight;
      ortho.position.copy(current.position);
      ortho.quaternion.copy(current.quaternion);
      ortho.up.copy(current.up);
      ortho.zoom = 1;
      const { width, height } = viewportSizeRef.current;
      updateCameraFrustum(perspective, ortho, width, height, orthoHeightRef.current);
      controls.object = ortho;
      cameraRef.current = ortho;
      controls.update();
    } else if (projection === "perspective" && current !== perspective) {
      const target = controls.target.clone();
      const visibleHeight = orthoHeightRef.current / Math.max(0.01, ortho.zoom);
      const distance = visibleHeight / (2 * Math.tan((perspective.fov * Math.PI) / 360));
      const direction = ortho.position.clone().sub(target);
      if (direction.lengthSq() < 0.01) direction.set(1.15, -1.55, 0.9);
      direction.normalize().multiplyScalar(Math.max(300, distance));
      perspective.position.copy(target).add(direction);
      perspective.quaternion.copy(ortho.quaternion);
      perspective.up.copy(ortho.up);
      controls.object = perspective;
      cameraRef.current = perspective;
      controls.update();
    }
  }, [projection]);

  useEffect(() => {
    const scene3 = sceneRef.current;
    if (!scene3) return;
    const old = contentRef.current;
    if (old) {
      scene3.remove(old);
      old.traverse((object) => disposeObject(object));
    }
    const root = new THREE.Group();
    contentRef.current = root;
    itemGroups.current.clear();
    jointGroups.current.clear();
    portMeshesRef.current = [];
    hoverPortRef.current = null;
    const pickables: THREE.Object3D[] = [];

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(5200, 4200),
      new THREE.MeshStandardMaterial({ color: "#e9e0d4", roughness: 0.96 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1;
    floor.receiveShadow = true;
    root.add(floor);

    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(scene.table.width, scene.table.depth, 26),
      mat(scene.table.color, { roughness: 0.62 }),
    );
    tableTop.position.z = scene.table.height - 13;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    root.add(tableTop);
    const legMat = mat(new THREE.Color(scene.table.color).multiplyScalar(0.72).getStyle(), { roughness: 0.7 });
    for (const x of [-scene.table.width / 2 + 70, scene.table.width / 2 - 70]) {
      for (const y of [-scene.table.depth / 2 + 60, scene.table.depth / 2 - 60]) {
        addBox(root, [42, 42, scene.table.height - 26], [x, y, (scene.table.height - 26) / 2], legMat);
      }
    }
    const runner = new THREE.Mesh(
      new THREE.BoxGeometry(scene.table.width * 0.72, 3, scene.table.depth * 0.32),
      new THREE.MeshStandardMaterial({ color: "#f3b7c7", roughness: 0.8, transparent: true, opacity: 0.45 }),
    );
    runner.position.set(0, 0, scene.table.height + 1.5);
    runner.receiveShadow = true;
    root.add(runner);

    if (showGrid) {
      const size = Math.max(scene.table.width, scene.table.depth);
      const divisions = Math.max(8, Math.round(size / (scene.grid || 50)));
      const grid = new THREE.GridHelper(size, divisions, 0xbfa8a5, 0xd9c9c5);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = scene.table.height + 3;
      const material = grid.material as THREE.Material;
      material.transparent = true;
      material.opacity = 0.42;
      root.add(grid);
    }

    for (const item of scene.items) {
      const selected = Boolean(selection && selection.type !== "joint" && selection.ids.includes(item.id));
      const group = buildItem(item, selected);
      itemGroups.current.set(item.id, group);
      root.add(group);
      pickables.push(group);
    }

    for (const joint of scene.joints) {
      const selected = Boolean(selection?.type === "joint" && selection.ids.includes(joint.id));
      const group = buildJoint(scene, joint, selected);
      jointGroups.current.set(joint.id, group);
      root.add(group);
      pickables.push(group);
    }

    if (showPorts) {
      const connected = connectedPortKeys(scene);
      const pending = pendingPort
        ? (() => {
            const item = scene.items.find((candidate) => candidate.id === pendingPort.itemId);
            return item ? portWorld(item, pendingPort.portId) : null;
          })()
        : null;
      for (const port of scenePorts(scene)) {
        if (port.system === "mount") continue;
        const key = `${port.itemId}:${port.portId}`;
        let color = connected.has(key) ? "#69b86a" : "#42b6a6";
        let radius = connected.has(key) ? 13 : 16;
        if (pending && pending.itemId === port.itemId && pending.portId === port.portId) {
          color = "#e47f9c";
          radius = 21;
        } else if (pending && portCompatible(pending, port)) {
          color = "#f4c542";
          radius = 19;
        }
        const sphere = buildPortSphere(port, color, radius);
        portMeshesRef.current.push(sphere);
        root.add(sphere);
      }
    }

    scene3.add(root);
    pickablesRef.current = pickables;

    if (!firstFitRef.current) {
      firstFitRef.current = true;
      const bounds = sceneBounds(scene);
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const ortho = orthoRef.current;
      const perspective = perspectiveRef.current;
      if (camera && controls) {
        const span = Math.max(bounds.width, bounds.depth, bounds.height, 900);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;
        const cz = Math.max(scene.table.height * 0.55, (bounds.minZ + bounds.maxZ) / 2);
        if (camera === ortho && ortho && perspective) {
          orthoHeightRef.current = span * 1.35;
          const { width, height } = viewportSizeRef.current;
          updateCameraFrustum(perspective, ortho, width, height, orthoHeightRef.current);
          ortho.zoom = 1;
        }
        controls.target.set(cx, cy, cz);
        camera.position.set(cx + span * 1.15, cy - span * 1.55, cz + span * 0.9);
        controls.update();
      }
    }
  }, [scene, selection, pendingPort, showPorts, showGrid]);

  useImperativeHandle(
    ref,
    () => ({
      screenshot() {
        return rendererRef.current?.domElement.toDataURL("image/png") || "";
      },
      setView(view) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const ortho = orthoRef.current;
        const perspective = perspectiveRef.current;
        if (!camera || !controls) return;
        const bounds = sceneBounds(sceneDataRef.current);
        const span = Math.max(bounds.width, bounds.depth, bounds.height, 900);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;
        const cz = Math.max(300, (bounds.minZ + bounds.maxZ) / 2);
        if (camera === ortho && ortho && perspective) {
          orthoHeightRef.current = span * 1.35;
          const { width, height } = viewportSizeRef.current;
          updateCameraFrustum(perspective, ortho, width, height, orthoHeightRef.current);
          ortho.zoom = 1;
        }
        controls.target.set(cx, cy, cz);
        const distance = span * 1.9;
        if (view === "front") camera.position.set(cx, cy - distance, cz + span * 0.1);
        else if (view === "back") camera.position.set(cx, cy + distance, cz + span * 0.1);
        else if (view === "left") camera.position.set(cx - distance, cy, cz + span * 0.1);
        else if (view === "right") camera.position.set(cx + distance, cy, cz + span * 0.1);
        else if (view === "top") camera.position.set(cx, cy, cz + distance * 1.15);
        else camera.position.set(cx + span * 1.1, cy - span * 1.5, cz + span * 0.85);
        controls.update();
      },
      orbit(dx, dy) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const target = controls.target;
        const offset = camera.position.clone().sub(target);
        const radius = Math.max(1, offset.length());
        const azimuth = Math.atan2(offset.y, offset.x) - dx * 0.008;
        const polar = Math.max(
          0.18,
          Math.min(Math.PI / 2 - 0.05, Math.acos(Math.max(-1, Math.min(1, offset.z / radius))) + dy * 0.008),
        );
        camera.position.set(
          target.x + radius * Math.sin(polar) * Math.cos(azimuth),
          target.y + radius * Math.sin(polar) * Math.sin(azimuth),
          target.z + radius * Math.cos(polar),
        );
        controls.update();
      },
      fit() {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const ortho = orthoRef.current;
        const perspective = perspectiveRef.current;
        if (!camera || !controls) return;
        const bounds = sceneBounds(sceneDataRef.current);
        const span = Math.max(bounds.width, bounds.depth, bounds.height, 900);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;
        const cz = Math.max(sceneDataRef.current.table.height * 0.55, (bounds.minZ + bounds.maxZ) / 2);
        if (camera === ortho && ortho && perspective) {
          orthoHeightRef.current = span * 1.35;
          const { width, height } = viewportSizeRef.current;
          updateCameraFrustum(perspective, ortho, width, height, orthoHeightRef.current);
          ortho.zoom = 1;
        }
        controls.target.set(cx, cy, cz);
        camera.position.set(cx + span * 1.15, cy - span * 1.55, cz + span * 0.9);
        controls.update();
      },
    }),
    [],
  );

  return (
    <div className="alley-viewport">
      <div className="alley-canvas" ref={hostRef} />
      <div className="alley-viewport-badge">
        <span className="dot teal" />
        <span>Sandbox Artist Alley</span>
        <span className="muted">· arrastra piezas · toca una esfera para conectar</span>
      </div>
      <div className="alley-viewport-hint">Arrastra el fondo para orbitar · rueda para acercar · R gira 90°</div>
    </div>
  );
});
