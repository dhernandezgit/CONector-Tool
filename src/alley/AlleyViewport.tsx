import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CATALOG_BY_TYPE, CONNECTORS } from "./catalog";
import {
  catalogFor,
  connectedPortKeys,
  defaultConnectorType,
  findSnapForMove,
  itemAabb,
  itemColor,
  itemDims,
  panelOf,
  planeNormal,
  portCompatible,
  portsVisible,
  portWorld,
  rotateLocal,
  sceneBounds,
  scenePorts,
  sceneTables,
  tableAabb,
  type SnapCandidate,
} from "./geometry";
import type {
  AlleyItem,
  AlleyJoint,
  AlleyProjection,
  AlleyScene,
  AlleySelection,
  AlleyTable,
  AlleyTableCloth,
  AlleyViewName,
  ConnectorType,
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

export interface AlleyDragPreview {
  targetItemId: string;
  targetName: string;
  connectorType: ConnectorType;
  connectorName: string;
  panelCount: number;
}

interface Props {
  scene: AlleyScene;
  selection: AlleySelection | null;
  pendingPort: PortRef | null;
  showPorts: boolean;
  showGrid: boolean;
  projection: AlleyProjection;
  tool?: "select" | "marquee" | "measure" | "orbit";
  autoJoin?: boolean;
  onSelect: (selection: AlleySelection | null) => void;
  onPortClick: (port: PortRef) => void;
  onMoveItems: (ids: string[], dx: number, dy: number, dz: number) => void;
  onMoveMount: (itemId: string, u: number, v: number) => void;
  onTableSelect?: (tableId: string) => void;
  onMoveTable?: (tableId: string, dx: number, dy: number) => void;
  onDragPreview?: (preview: AlleyDragPreview | null) => void;
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
  outline.userData.selectionOutline = true;
  parent.add(outline);
}

function clothTexture(cloth: AlleyTableCloth): THREE.Texture {
  if (cloth.image) {
    const texture = new THREE.TextureLoader().load(cloth.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.anisotropy = 8;
    return texture;
  }

  const texture = canvasTexture((ctx, width, height) => {
    ctx.fillStyle = cloth.color;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = cloth.accent;

    if (cloth.pattern === "stripes") {
      const band = width / 8;
      ctx.globalAlpha = 0.78;
      for (let i = 0; i < 8; i += 2) ctx.fillRect(i * band, 0, band * 0.58, height);
    } else if (cloth.pattern === "checks") {
      const band = width / 6;
      ctx.globalAlpha = 0.52;
      for (let i = 0; i < 6; i += 2) ctx.fillRect(i * band, 0, band, height);
      for (let i = 0; i < 6; i += 2) ctx.fillRect(0, i * band, width, band);
      ctx.globalAlpha = 0.24;
      for (let i = 0; i < 6; i += 2) {
        for (let j = 0; j < 6; j += 2) ctx.fillRect(i * band, j * band, band, band);
      }
    } else if (cloth.pattern === "dots") {
      ctx.globalAlpha = 0.82;
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          const x = (col + 0.5) * (width / 5) + (row % 2 ? width / 10 : 0);
          const y = (row + 0.5) * (height / 5);
          ctx.beginPath();
          ctx.arc(x, y, width * 0.024, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (cloth.pattern === "flowers") {
      ctx.globalAlpha = 0.8;
      const flower = (cx: number, cy: number, scale: number) => {
        for (let petal = 0; petal < 5; petal += 1) {
          const angle = (petal / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(
            cx + Math.cos(angle) * scale * 0.9,
            cy + Math.sin(angle) * scale * 0.9,
            scale * 0.62,
            scale * 0.38,
            angle,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.fillStyle = "#f8df8f";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(cx, cy, scale * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cloth.accent;
        ctx.globalAlpha = 0.8;
      };
      flower(width * 0.27, height * 0.28, width * 0.16);
      flower(width * 0.73, height * 0.72, width * 0.14);
    } else {
      // A subtle woven texture keeps the plain colour from reading as plastic.
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (let y = 4; y < height; y += 7) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#7d4d5b";
      ctx.globalAlpha = 0.045;
      for (let x = 6; x < width; x += 9) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height * 0.12);
    ctx.globalAlpha = 1;
  }, 256);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 4);
  return texture;
}

function addTableCloth(parent: THREE.Object3D, table: AlleyTable) {
  const cloth = table.cloth;
  if (!cloth?.enabled) return;

  const material = new THREE.MeshStandardMaterial({
    map: clothTexture(cloth),
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const topZ = table.height + 0.8;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(table.width + 24, table.depth + 24), material);
  top.rotation.x = -Math.PI / 2;
  top.position.z = topZ;
  top.receiveShadow = true;
  parent.add(top);

  const drop = Math.max(0, Math.min(cloth.drop, table.height));
  if (drop < 10) return;

  const thickness = 4;
  const overhang = 12;
  const skirtHeight = drop + 2;
  const centerZ = topZ - skirtHeight / 2;

  const longGeometry = new THREE.BoxGeometry(table.width + overhang * 2, thickness, skirtHeight);
  const sideGeometry = new THREE.BoxGeometry(thickness, table.depth + overhang * 2, skirtHeight);
  for (const sign of [-1, 1]) {
    const front = new THREE.Mesh(longGeometry, material);
    front.position.set(0, sign * (table.depth / 2 + thickness / 2), centerZ);
    front.castShadow = true;
    front.receiveShadow = true;
    parent.add(front);

    const side = new THREE.Mesh(sideGeometry, material);
    side.position.set(sign * (table.width / 2 + thickness / 2), 0, centerZ);
    side.castShadow = true;
    side.receiveShadow = true;
    parent.add(side);
  }

  const hemMaterial = new THREE.MeshStandardMaterial({
    color: cloth.accent,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const hemZ = topZ - skirtHeight + 3.5;
  const longHemGeometry = new THREE.BoxGeometry(table.width + overhang * 2 + 8, 7, 7);
  const sideHemGeometry = new THREE.BoxGeometry(7, table.depth + overhang * 2 + 8, 7);
  for (const sign of [-1, 1]) {
    const frontHem = new THREE.Mesh(longHemGeometry, hemMaterial);
    frontHem.position.set(0, sign * (table.depth / 2 + thickness / 2), hemZ);
    parent.add(frontHem);
    const sideHem = new THREE.Mesh(sideHemGeometry, hemMaterial);
    sideHem.position.set(sign * (table.width / 2 + thickness / 2), 0, hemZ);
    parent.add(sideHem);
  }
}

function addTableGrid(parent: THREE.Object3D, width: number, depth: number, step: number, z = 3) {
  const points: number[] = [];
  const cols = Math.max(1, Math.round(width / Math.max(10, step)));
  const rows = Math.max(1, Math.round(depth / Math.max(10, step)));
  for (let i = 0; i <= cols; i += 1) {
    const x = -width / 2 + (i / cols) * width;
    points.push(x, -depth / 2, 0, x, depth / 2, 0);
  }
  for (let j = 0; j <= rows; j += 1) {
    const y = -depth / 2 + (j / rows) * depth;
    points.push(-width / 2, y, 0, width / 2, y, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const grid = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x95777d, transparent: true, opacity: 0.58 }),
  );
  grid.position.z = z;
  parent.add(grid);
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

function solidTexture(color: string) {
  return canvasTexture((ctx, width, height) => {
    const base = new THREE.Color(color);
    const light = `#${base.clone().lerp(new THREE.Color("#ffffff"), 0.18).getHexString()}`;
    const dark = `#${base.clone().multiplyScalar(0.82).getHexString()}`;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, light);
    gradient.addColorStop(0.55, color);
    gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 6;
    ctx.strokeRect(7, 7, width - 14, height - 14);
    ctx.strokeStyle = "rgba(60,45,50,0.14)";
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, width - 36, height - 36);
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

function buildWireShelf(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const color = new THREE.Color(itemColor(item));
  const frameMat = mat(`#${color.clone().multiplyScalar(0.72).getHexString()}`, { roughness: 0.42, metalness: 0.28 });
  const bar = 7;
  const z = Math.max(4, dims.h / 2);
  addBox(group, [dims.w, bar, 8], [0, -dims.d / 2 + bar / 2, z], frameMat);
  addBox(group, [dims.w, bar, 8], [0, dims.d / 2 - bar / 2, z], frameMat);
  addBox(group, [bar, dims.d, 8], [-dims.w / 2 + bar / 2, 0, z], frameMat);
  addBox(group, [bar, dims.d, 8], [dims.w / 2 - bar / 2, 0, z], frameMat);
  const pitch = 50;
  const points: number[] = [];
  for (let x = -dims.w / 2 + pitch; x < dims.w / 2 - pitch / 2; x += pitch) {
    points.push(x, -dims.d / 2 + bar, z + 4, x, dims.d / 2 - bar, z + 4);
  }
  for (let y = -dims.d / 2 + pitch; y < dims.d / 2 - pitch / 2; y += pitch) {
    points.push(-dims.w / 2 + bar, y, z + 4, dims.w / 2 - bar, y, z + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  group.add(
    new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: frameMat.color, transparent: true, opacity: 0.8 }),
    ),
  );
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.w, dims.d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  hit.rotation.x = -Math.PI / 2;
  hit.position.z = z;
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

function buildBaseBox(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const color = itemColor(item);
  const panelMat = mat(color, { roughness: 0.72, metalness: 0.04 });
  const topMat = mat(`#${new THREE.Color(color).clone().multiplyScalar(0.92).getHexString()}`, {
    roughness: 0.7,
  });
  const wallHeight = dims.h - 18;
  addBox(group, [dims.w, dims.d, 18], [0, 0, dims.h - 9], topMat);
  // Only the front and the two sides are covered; the back stays open.
  addBox(group, [dims.w, 18, wallHeight], [0, -dims.d / 2 + 9, wallHeight / 2], panelMat);
  for (const x of [-dims.w / 2 + 9, dims.w / 2 - 9]) {
    addBox(group, [18, dims.d, wallHeight], [x, 0, wallHeight / 2], panelMat);
  }
  const seams = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.w, dims.d, dims.h)),
    new THREE.LineBasicMaterial({ color: 0x8f5f70, transparent: true, opacity: 0.34 }),
  );
  seams.position.z = dims.h / 2;
  group.add(seams);
  const lowerConnector = mat("#b04f6e", { roughness: 0.5, metalness: 0.08 });
  const upperConnector = mat("#d9789b", { roughness: 0.5, metalness: 0.08 });
  for (const x of [-dims.w / 2 + 7, dims.w / 2 - 7]) {
    addBox(group, [17, 17, 13], [x, -dims.d / 2 + 7, 6.5], lowerConnector);
    addBox(group, [17, 17, 13], [x, -dims.d / 2 + 7, dims.h - 6.5], upperConnector);
    addBox(group, [17, 17, 13], [x, dims.d / 2 - 7, dims.h - 6.5], upperConnector);
  }
  if (selected) addOutline(group, dims);
  return group;
}

function buildOrganizer(item: AlleyItem, selected: boolean) {
  const group = new THREE.Group();
  const dims = itemDims(item);
  const color = new THREE.Color(itemColor(item));
  const frameMat = mat(`#${color.clone().multiplyScalar(0.78).getHexString()}`, {
    roughness: 0.5,
    metalness: 0.12,
  });
  const postY = dims.w / 2 - 6;
  const bar = 12;
  for (const y of [-postY, postY]) {
    addBox(group, [dims.d, bar, dims.h], [0, y, dims.h / 2], frameMat);
    addBox(group, [dims.d + 6, 18, 6], [0, y, 3], frameMat);
  }
  addBox(group, [dims.d, dims.w, bar], [0, 0, dims.h - bar / 2], frameMat);
  // Slot ledges are where a horizontal shelf/panel rests.
  const slotHeights = Array.from(new Set(catalogFor(item).ports.map((port) => port.pos[2]))).sort((a, b) => a - b);
  for (const z of slotHeights) {
    for (const y of [-postY, postY]) {
      addBox(group, [dims.d + 10, 16, 5], [0, y, z], frameMat);
    }
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
  const frameMat = mat("#d98fa5", { roughness: 0.55 });
  const footMat = mat("#f8e6ea", { roughness: 0.55 });
  const legX = dims.w / 2 - 7;
  const topZ = dims.h;
  const canopyDepth = dims.d;
  const drop = dims.w > 320 ? 115 : 100;
  const canopyFrontZ = topZ - drop;
  const armReach = Math.min(canopyDepth * 0.6, 185);
  const armFrontZ = topZ - drop * (armReach / canopyDepth);
  const flapHeight = 108;
  const slope = Math.atan2(drop, canopyDepth);

  // The top/back corner sits on the grid corner. Short brackets hang from the
  // standard corner connectors, then the arms carry the canopy forward/down.
  for (const x of [-legX, legX]) {
    addBox(group, [14, 14, 70], [x, -14, topZ - 35], frameMat);
    addBox(group, [26, 24, 11], [x, 0, topZ - 5.5], footMat);
    cylinderBetween(
      group,
      new THREE.Vector3(x, -14, topZ - 8),
      new THREE.Vector3(x, -armReach, armFrontZ - 8),
      4.5,
      frameMat,
    );
  }
  addBox(group, [dims.w * 0.94, 10, 9], [0, 0, topZ - 5], frameMat);
  addBox(group, [dims.w * 0.9, 8, 8], [0, -armReach, armFrontZ - 8], frameMat);

  const canopyTexture = stripeTexture(color);
  const canopy = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.w, canopyDepth),
    new THREE.MeshStandardMaterial({
      map: canopyTexture,
      roughness: 0.75,
      side: THREE.DoubleSide,
    }),
  );
  canopy.rotation.x = slope;
  canopy.position.set(0, -canopyDepth / 2, topZ - drop / 2);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  group.add(canopy);

  // Frame rails follow the same slope and make the support structure visible.
  addBox(group, [dims.w, 9, 7], [0, 0, topZ - 4], frameMat);
  addBox(group, [dims.w, 9, 7], [0, -canopyDepth, canopyFrontZ - 4], frameMat);
  for (const x of [-dims.w / 2, dims.w / 2]) {
    cylinderBetween(
      group,
      new THREE.Vector3(x, 0, topZ - 4),
      new THREE.Vector3(x, -canopyDepth, canopyFrontZ - 4),
      4.2,
      frameMat,
    );
  }

  // Front valance: four curved lobes, leaning 30° forward from vertical.
  const flapShape = new THREE.Shape();
  const halfWidth = dims.w / 2;
  const lobes = 4;
  const lobeWidth = dims.w / lobes;
  flapShape.moveTo(-halfWidth, 0);
  flapShape.lineTo(halfWidth, 0);
  flapShape.lineTo(halfWidth, -flapHeight);
  for (let index = lobes - 1; index >= 0; index -= 1) {
    const left = -halfWidth + index * lobeWidth;
    flapShape.quadraticCurveTo(left + lobeWidth / 2, -flapHeight - 13, left, -flapHeight);
  }
  flapShape.closePath();
  const flapGeometry = new THREE.ShapeGeometry(flapShape, 18);
  const flapPositions = flapGeometry.getAttribute("position");
  const flapUvs = flapGeometry.getAttribute("uv");
  for (let index = 0; index < flapPositions.count; index += 1) {
    flapUvs.setXY(
      index,
      (flapPositions.getX(index) + halfWidth) / dims.w,
      (flapPositions.getY(index) + flapHeight + 13) / (flapHeight + 13),
    );
  }
  flapUvs.needsUpdate = true;
  const flap = new THREE.Mesh(
    flapGeometry,
    new THREE.MeshStandardMaterial({
      map: stripeTexture(color),
      roughness: 0.78,
      side: THREE.DoubleSide,
    }),
  );
  // 60° around X = vertical plane leaning 30° toward the viewer.
  flap.rotation.x = Math.PI / 3;
  flap.position.set(0, -canopyDepth, canopyFrontZ);
  flap.castShadow = true;
  flap.receiveShadow = true;
  group.add(flap);

  if (selected) addOutline(group, dims);
  return group;
}

function buildItem(item: AlleyItem, selected: boolean): THREE.Group {
  const catalog = catalogFor(item);
  let group: THREE.Group;
  switch (item.type) {
    case "slatwall30":
    case "slatwall35":
    case "slatwall15":
    case "slatwall15x30":
    case "slatwall30x15":
      group = buildFlatPanel(item, slatTexture(itemColor(item)), selected);
      break;
    case "skadis30":
    case "skadis35":
    case "skadis15":
    case "skadis15x30":
    case "skadis30x15":
      group = buildFlatPanel(item, skadisTexture(itemColor(item)), selected);
      break;
    case "wire30":
    case "wire35":
    case "wire15":
    case "wire15x30":
    case "wire30x15":
      group = buildWirePanel(item, selected);
      break;
    case "flat30":
    case "flat35":
    case "flat15":
    case "flat15x30":
    case "flat30x15":
      group = buildFlatPanel(item, solidTexture(itemColor(item)), selected);
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
    case "wireshelf30":
      group = buildWireShelf(item, selected);
      break;
    case "basebox40":
      group = buildBaseBox(item, selected);
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

const JOINT_SPHERE_GEOMETRY = new THREE.SphereGeometry(14, 12, 8);
const JOINT_ARM_GEOMETRY = new THREE.CylinderGeometry(4.5, 4.5, 18, 8);
const jointMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function jointMaterial(color: string, suppressed: boolean) {
  const key = `${color}|${suppressed ? 1 : 0}`;
  let material = jointMaterialCache.get(key);
  if (!material) {
    material = mat(color, {
      roughness: 0.4,
      metalness: 0.08,
      transparent: suppressed,
      opacity: suppressed ? 0.35 : 1,
    });
    jointMaterialCache.set(key, material);
  }
  return material;
}

function buildJoint(scene: AlleyScene, joint: AlleyJoint, selected: boolean): THREE.Group {
  const group = new THREE.Group();
  const def = CONNECTORS[joint.type];
  const color = joint.suppressed ? "#9aa0a4" : def?.color || "#e47f9c";
  const material = jointMaterial(color, Boolean(joint.suppressed));
  const hub = new THREE.Mesh(JOINT_SPHERE_GEOMETRY, material);
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
    const arm = new THREE.Mesh(JOINT_ARM_GEOMETRY, material);
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

const PORT_SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 12, 10);
const portMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

function portMaterial(color: string) {
  let material = portMaterialCache.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
    });
    portMaterialCache.set(color, material);
  }
  return material;
}

function buildPortSphere(port: WorldPort, color: string, radius: number): THREE.Mesh {
  const sphere = new THREE.Mesh(PORT_SPHERE_GEOMETRY, portMaterial(color));
  // The cached geometry is a unit sphere, so the port radius is also its world scale.
  const baseScale = radius;
  sphere.scale.setScalar(baseScale);
  sphere.position.set(port.x, port.y, port.z);
  sphere.renderOrder = 20;
  sphere.userData = { type: "port", itemId: port.itemId, portId: port.portId, baseScale };
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

function previewForSnap(
  scene: AlleyScene,
  movedIds: string[],
  delta: Vec3,
  snap: SnapCandidate,
): AlleyDragPreview | null {
  const moved = new Set(movedIds);
  const items = scene.items.map((item) =>
    moved.has(item.id)
      ? { ...item, x: item.x + delta[0], y: item.y + delta[1], baseZ: item.baseZ + delta[2] }
      : item,
  );
  const previewScene: AlleyScene = { ...scene, items, joints: [] };
  const refs: PortRef[] = [];
  for (const port of scenePorts(previewScene)) {
    if (port.system === "mount") continue;
    if (Math.hypot(port.x - snap.target.x, port.y - snap.target.y, port.z - snap.target.z) <= 2) {
      refs.push({ itemId: port.itemId, portId: port.portId });
    }
  }
  if (refs.length < 2) {
    refs.push({ itemId: snap.source.itemId, portId: snap.source.portId });
    refs.push({ itemId: snap.target.itemId, portId: snap.target.portId });
  }
  const connectorType = defaultConnectorType(previewScene, refs);
  const target = items.find((item) => item.id === snap.target.itemId);
  return {
    targetItemId: snap.target.itemId,
    targetName: target?.name || "panel",
    connectorType,
    connectorName: CONNECTORS[connectorType]?.name || connectorType,
    panelCount: new Set(refs.map((ref) => ref.itemId)).size,
  };
}

export default forwardRef<AlleyViewportHandle, Props>(function AlleyViewport(
  {
    scene,
    selection,
    pendingPort,
    showPorts,
    showGrid,
    projection,
    tool = "select",
    autoJoin = true,
    onSelect,
    onPortClick,
    onMoveItems,
    onMoveMount,
    onTableSelect,
    onMoveTable,
    onDragPreview,
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
  const tableGroups = useRef(new Map<string, THREE.Group>());
  const portsGroupRef = useRef<THREE.Group | null>(null);
  const jointGroups = useRef(new Map<string, THREE.Group>());
  const pickablesRef = useRef<THREE.Object3D[]>([]);
  const portMeshesRef = useRef<THREE.Mesh[]>([]);
  const hoverPortRef = useRef<THREE.Mesh | null>(null);
  const snapMarkerRef = useRef<THREE.Mesh | null>(null);
  const dragRef = useRef<{
    kind: "items" | "mount" | "table";
    ids: string[];
    itemId: string;
    tableId?: string;
    startX: number;
    startY: number;
    startZ: number;
    startPointer: THREE.Vector3;
    startPositions: Map<string, { x: number; y: number; z: number }>;
    portStartPositions?: Map<THREE.Mesh, THREE.Vector3>;
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
  const callbacks = useRef({
    onSelect,
    onPortClick,
    onMoveItems,
    onMoveMount,
    onTableSelect,
    onMoveTable,
    onDragPreview,
    onCameraChange,
  });
  callbacks.current = {
    onSelect,
    onPortClick,
    onMoveItems,
    onMoveMount,
    onTableSelect,
    onMoveTable,
    onDragPreview,
    onCameraChange,
  };
  const gridRef = useRef(scene.grid);
  gridRef.current = scene.grid;
  const lastCameraReport = useRef({ azimuth: 0, polar: 0, at: 0 });
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const autoJoinRef = useRef(autoJoin);
  autoJoinRef.current = autoJoin;
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [measureLabel, setMeasureLabel] = useState<{ text: string; x: number; y: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const measureStartRef = useRef<THREE.Vector3 | null>(null);
  const measureLineRef = useRef<THREE.Line | null>(null);

  useEffect(() => {
    setMarquee(null);
    marqueeStartRef.current = null;
    measureStartRef.current = null;
    setMeasureLabel(null);
    if (measureLineRef.current) measureLineRef.current.visible = false;
  }, [tool]);

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

    const portsGroup = new THREE.Group();
    scene3.add(portsGroup);
    portsGroupRef.current = portsGroup;

    const snapMarker = new THREE.Mesh(
      new THREE.TorusGeometry(16, 3, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xf4c542, transparent: true, opacity: 0.9, depthTest: false }),
    );
    snapMarker.rotation.x = Math.PI / 2;
    snapMarker.visible = false;
    snapMarker.renderOrder = 30;
    scene3.add(snapMarker);
    snapMarkerRef.current = snapMarker;

    const measureLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x7c5aa6, transparent: true, opacity: 0.95, depthTest: false }),
    );
    measureLine.visible = false;
    measureLine.renderOrder = 31;
    scene3.add(measureLine);
    measureLineRef.current = measureLine;

    const snapLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xf4a7bb, transparent: true, opacity: 0.9, depthTest: false }),
    );
    snapLine.visible = false;
    snapLine.renderOrder = 29;
    scene3.add(snapLine);
    const snapPreview = new THREE.Mesh(
      new THREE.SphereGeometry(18, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf4a7bb, transparent: true, opacity: 0.42, depthTest: false, depthWrite: false }),
    );
    snapPreview.visible = false;
    snapPreview.renderOrder = 29;
    scene3.add(snapPreview);
    let lastPreviewKey = "";

    const clearSnapPreview = () => {
      snapMarker.visible = false;
      snapLine.visible = false;
      snapPreview.visible = false;
      if (lastPreviewKey) {
        lastPreviewKey = "";
        callbacks.current.onDragPreview?.(null);
      }
    };

    const showSnapPreview = (snap: SnapCandidate, preview: AlleyDragPreview) => {
      const color = new THREE.Color(CONNECTORS[preview.connectorType]?.color || "#f4a7bb");
      snapMarker.visible = true;
      snapMarker.position.set(snap.target.x, snap.target.y, snap.target.z);
      (snapMarker.material as THREE.MeshBasicMaterial).color.copy(color);
      snapPreview.visible = true;
      snapPreview.position.set(snap.target.x, snap.target.y, snap.target.z);
      (snapPreview.material as THREE.MeshBasicMaterial).color.copy(color);
      snapLine.visible = true;
      const positions = snapLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      positions.setXYZ(0, snap.source.x, snap.source.y, snap.source.z);
      positions.setXYZ(1, snap.target.x, snap.target.y, snap.target.z);
      positions.needsUpdate = true;
      (snapLine.material as THREE.LineBasicMaterial).color.copy(color);
      const key = `${preview.targetItemId}|${preview.connectorType}|${preview.panelCount}`;
      if (key !== lastPreviewKey) {
        lastPreviewKey = key;
        callbacks.current.onDragPreview?.(preview);
      }
    };

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

    const objectAt = (event: PointerEvent): { type: "item" | "joint" | "table"; id: string } | null => {
      setPointer(event);
      const activeCamera = cameraRef.current;
      if (!activeCamera) return null;
      ray.setFromCamera(pointer, activeCamera);
      const hits = ray.intersectObjects(pickablesRef.current, true);
      const found: Array<{ type: "item" | "joint" | "table"; id: string }> = [];
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

    const collectPortStarts = (ids: string[]) => {
      const wanted = new Set(ids);
      const positions = new Map<THREE.Mesh, THREE.Vector3>();
      for (const mesh of portMeshesRef.current) {
        if (wanted.has(mesh.userData.itemId)) positions.set(mesh, mesh.position.clone());
      }
      return positions;
    };

    const setPortPreview = (delta: Vec3) => {
      const drag = dragRef.current;
      if (!drag?.portStartPositions) return;
      for (const [mesh, start] of drag.portStartPositions) {
        mesh.position.set(start.x + delta[0], start.y + delta[1], start.z + delta[2]);
      }
    };

    const setItemPreview = (ids: string[], delta: Vec3) => {
      for (const id of ids) {
        const group = itemGroups.current.get(id);
        const start = dragRef.current?.startPositions.get(id);
        if (!group || !start) continue;
        group.position.set(start.x + delta[0], start.y + delta[1], start.z + delta[2]);
      }
      setPortPreview(delta);
    };

    const resolveDragDelta = (
      event: PointerEvent,
      drag: NonNullable<typeof dragRef.current>,
      maxDistance: number,
    ): { delta: Vec3; snap: SnapCandidate | null } => {
      const point = planePoint(event, drag.startZ);
      if (!point) return { delta: drag.delta, snap: null };
      let dx = point.x - drag.startPointer.x;
      let dy = point.y - drag.startPointer.y;
      let snap: SnapCandidate | null = null;
      if (autoJoinRef.current) {
        const grid = gridRef.current || 1;
        const snappedX = Math.round((drag.startX + dx) / grid) * grid;
        const snappedY = Math.round((drag.startY + dy) / grid) * grid;
        dx = snappedX - drag.startX;
        dy = snappedY - drag.startY;
        snap = findSnapForMove(sceneDataRef.current, drag.ids, [dx, dy, 0], maxDistance);
      } else {
        dx = Math.round(dx);
        dy = Math.round(dy);
      }
      const delta: Vec3 = snap ? [snap.dx, snap.dy, snap.dz] : [dx, dy, 0];
      drag.delta = delta;
      return { delta, snap };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || toolRef.current !== "select") return;
      clearSnapPreview();
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
      if (hit.type === "table") {
        callbacks.current.onTableSelect?.(hit.id);
        const table = sceneTables(data).find((candidate) => candidate.id === hit.id);
        if (!table || table.locked) return;
        const point = planePoint(event, 0);
        if (!point) return;
        const box = tableAabb(table);
        const tableItemIds = data.items
          .filter(
            (candidate) =>
              candidate.x >= box.minX - 20 &&
              candidate.x <= box.maxX + 20 &&
              candidate.y >= box.minY - 20 &&
              candidate.y <= box.maxY + 20,
          )
          .map((candidate) => candidate.id);
        const startPositions = new Map<string, { x: number; y: number; z: number }>();
        for (const id of tableItemIds) {
          const candidate = data.items.find((entry) => entry.id === id);
          if (candidate) startPositions.set(id, { x: candidate.x, y: candidate.y, z: candidate.baseZ });
        }
        dragRef.current = {
          kind: "table",
          ids: tableItemIds,
          itemId: "",
          tableId: table.id,
          startX: table.x,
          startY: table.y,
          startZ: 0,
          startPointer: point,
          startPositions,
          portStartPositions: collectPortStarts(tableItemIds),
          delta: [0, 0, 0],
          moved: false,
          mountU: 0.5,
          mountV: 0.5,
        };
        controls.enabled = false;
        renderer.domElement.setPointerCapture(event.pointerId);
        event.stopImmediatePropagation();
        return;
      }
      const item = data.items.find((candidate) => candidate.id === hit.id);
      if (!item) return;
      const current = selectionRef.current;
      const previous = current && current.type !== "joint" ? current.ids : [];
      let selectedIds: string[];
      if (event.shiftKey) {
        selectedIds = previous.includes(item.id)
          ? previous.filter((id) => id !== item.id)
          : Array.from(new Set([...previous, item.id]));
        if (!selectedIds.length) {
          callbacks.current.onSelect(null);
          return;
        }
        callbacks.current.onSelect({ type: selectedIds.length > 1 ? "items" : "item", ids: selectedIds });
      } else if (previous.includes(item.id)) {
        // Keep an existing multi-selection so dragging moves every selected item.
        selectedIds = previous;
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
          portStartPositions: collectPortStarts([item.id]),
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
          portStartPositions: collectPortStarts(ids),
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
        if (hoverPortRef.current && hoverPortRef.current !== mesh) {
          hoverPortRef.current.scale.setScalar(hoverPortRef.current.userData.baseScale || 1);
        }
        if (mesh) {
          mesh.scale.setScalar((mesh.userData.baseScale || 1) * 1.28);
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
      if (drag.kind === "table") {
        const point = planePoint(event, 0);
        if (!point || !drag.tableId) return;
        const step = 10;
        const dx = Math.round((point.x - drag.startPointer.x) / step) * step;
        const dy = Math.round((point.y - drag.startPointer.y) / step) * step;
        drag.delta = [dx, dy, 0];
        const tableGroup = tableGroups.current.get(drag.tableId);
        if (tableGroup) tableGroup.position.set(drag.startX + dx, drag.startY + dy, 0);
        for (const id of drag.ids) {
          const group = itemGroups.current.get(id);
          const start = drag.startPositions.get(id);
          if (group && start) group.position.set(start.x + dx, start.y + dy, start.z);
        }
        setPortPreview([dx, dy, 0]);
        return;
      }
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
        setPortPreview([panel.x + local[0] - item.x, panel.y + local[1] - item.y, panel.baseZ + local[2] - item.baseZ]);
        return;
      }
      const { delta, snap } = resolveDragDelta(event, drag, 160);
      setItemPreview(drag.ids, delta);
      if (snap) {
        const preview = previewForSnap(sceneDataRef.current, drag.ids, delta, snap);
        if (preview) showSnapPreview(snap, preview);
        else clearSnapPreview();
      } else {
        clearSnapPreview();
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.moved && drag.kind === "items") {
        const final = resolveDragDelta(event, drag, 180);
        drag.delta = final.delta;
        setItemPreview(drag.ids, final.delta);
      }
      if (drag.moved && drag.kind === "table" && drag.tableId) {
        const point = planePoint(event, 0);
        if (point) {
          const step = 10;
          drag.delta = [
            Math.round((point.x - drag.startPointer.x) / step) * step,
            Math.round((point.y - drag.startPointer.y) / step) * step,
            0,
          ];
        }
      }
      clearSnapPreview();
      dragRef.current = null;
      controls.enabled = true;
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        /* no capture */
      }
      if (!drag.moved) return;
      if (drag.kind === "table") {
        if (drag.tableId) callbacks.current.onMoveTable?.(drag.tableId, drag.delta[0], drag.delta[1]);
      } else if (drag.kind === "mount") {
        callbacks.current.onMoveMount(drag.itemId, drag.mountU, drag.mountV);
      } else {
        callbacks.current.onMoveItems(drag.ids, drag.delta[0], drag.delta[1], drag.delta[2]);
      }
      event.stopPropagation();
    };

    const onPointerLeave = () => {
      if (hoverPortRef.current) hoverPortRef.current.scale.setScalar(hoverPortRef.current.userData.baseScale || 1);
      hoverPortRef.current = null;
      renderer.domElement.style.cursor = "";
      if (dragRef.current) clearSnapPreview();
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
            now - last.at > 140 &&
            (Math.abs(azimuth - last.azimuth) > 2 || Math.abs(polar - last.polar) > 2)
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
    tableGroups.current.clear();
    jointGroups.current.clear();
    portMeshesRef.current = [];
    hoverPortRef.current = null;
    const pickables: THREE.Object3D[] = [];

    const tableBoxes = sceneTables(scene).map(tableAabb);
    const floorMinX = tableBoxes.length ? Math.min(...tableBoxes.map((box) => box.minX)) - 700 : -1400;
    const floorMaxX = tableBoxes.length ? Math.max(...tableBoxes.map((box) => box.maxX)) + 700 : 1400;
    const floorMinY = tableBoxes.length ? Math.min(...tableBoxes.map((box) => box.minY)) - 700 : -1100;
    const floorMaxY = tableBoxes.length ? Math.max(...tableBoxes.map((box) => box.maxY)) + 700 : 1100;
    // Z-up scene: a PlaneGeometry in XY is already horizontal. Keep the floor
    // shadow-only so it never reads as a giant white wall behind the booth.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorMaxX - floorMinX, floorMaxY - floorMinY),
      new THREE.ShadowMaterial({ color: 0x2b1c22, opacity: 0.2, transparent: true }),
    );
    floor.position.set((floorMinX + floorMaxX) / 2, (floorMinY + floorMaxY) / 2, -1);
    floor.receiveShadow = true;
    root.add(floor);

    for (const table of sceneTables(scene)) {
      const tableRoot = new THREE.Group();
      tableRoot.position.set(table.x, table.y, 0);
      tableRoot.rotation.z = table.rotation * DEG;
      root.add(tableRoot);
      tableGroups.current.set(table.id, tableRoot);

      const tableTop = new THREE.Mesh(
        new THREE.BoxGeometry(table.width, table.depth, 26),
        mat(table.color, { roughness: 0.62 }),
      );
      tableTop.position.z = table.height - 13;
      tableTop.castShadow = true;
      tableTop.receiveShadow = true;
      tableTop.userData = { type: "table", id: table.id };
      tableRoot.add(tableTop);
      pickables.push(tableTop);

      const legHeight = Math.max(4, table.height - 26);
      const legMat = mat(new THREE.Color(table.color).multiplyScalar(0.72).getStyle(), { roughness: 0.7 });
      for (const x of [-table.width / 2 + 70, table.width / 2 - 70]) {
        for (const y of [-table.depth / 2 + 60, table.depth / 2 - 60]) {
          addBox(tableRoot, [42, 42, legHeight], [x, y, legHeight / 2], legMat);
        }
      }

      if (table.cloth?.enabled) {
        addTableCloth(tableRoot, table);
      } else {
        const runner = new THREE.Mesh(
          new THREE.BoxGeometry(table.width * 0.72, 3, table.depth * 0.32),
          new THREE.MeshStandardMaterial({ color: "#f3b7c7", roughness: 0.8, transparent: true, opacity: 0.45 }),
        );
        runner.position.set(0, 0, table.height + 1.5);
        runner.receiveShadow = true;
        tableRoot.add(runner);
      }

      if (showGrid) {
        const gridZ = table.cloth?.enabled ? table.height + 20 : table.height + 3;
        addTableGrid(tableRoot, table.width, table.depth, scene.grid || 100, gridZ);
      }
    }

    for (const item of scene.items) {
      const group = buildItem(item, false);
      itemGroups.current.set(item.id, group);
      root.add(group);
      pickables.push(group);
    }

    for (const joint of scene.joints) {
      const group = buildJoint(scene, joint, false);
      jointGroups.current.set(joint.id, group);
      root.add(group);
      pickables.push(group);
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
        const cz = Math.max((sceneTables(scene)[0]?.height || 750) * 0.55, (bounds.minZ + bounds.maxZ) / 2);
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
  }, [scene, showGrid]);

  useEffect(() => {
    const removeSelectionMarkers = (group: THREE.Group) => {
      for (const child of [...group.children]) {
        if (!child.userData.selectionOutline) continue;
        group.remove(child);
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      }
    };

    const selectedItems = selection && selection.type !== "joint" ? new Set(selection.ids) : new Set<string>();
    for (const [id, group] of itemGroups.current) {
      removeSelectionMarkers(group);
      if (!selectedItems.has(id)) continue;
      const item = scene.items.find((candidate) => candidate.id === id);
      if (item) addOutline(group, itemDims(item));
    }

    const selectedJoint = selection?.type === "joint" ? selection.ids[0] : undefined;
    for (const [id, group] of jointGroups.current) {
      removeSelectionMarkers(group);
      if (id !== selectedJoint) continue;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(17, 2.4, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xf4c542 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.userData.selectionOutline = true;
      group.add(ring);
    }
  }, [scene, selection]);

  useEffect(() => {
    const group = portsGroupRef.current;
    if (!group) return;
    for (const child of [...group.children]) group.remove(child);
    portMeshesRef.current = [];
    hoverPortRef.current = null;
    if (!portsVisible(showPorts, selection)) return;
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
      let color = connected.has(key) ? "#c77b93" : "#f5b8c8";
      let radius = connected.has(key) ? 13 : 16;
      if (pending && pending.itemId === port.itemId && pending.portId === port.portId) {
        color = "#d81b60";
        radius = 21;
      } else if (pending && portCompatible(pending, port)) {
        color = "#ff9fc0";
        radius = 19;
      }
      const sphere = buildPortSphere(port, color, radius);
      portMeshesRef.current.push(sphere);
      group.add(sphere);
    }
  }, [scene, selection, pendingPort, showPorts]);

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
        const cz = Math.max((sceneTables(sceneDataRef.current)[0]?.height || 750) * 0.55, (bounds.minZ + bounds.maxZ) / 2);
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

  const projectToHost = (x: number, y: number, z: number) => {
    const camera = cameraRef.current;
    const host = hostRef.current;
    if (!camera || !host) return null;
    const rect = host.getBoundingClientRect();
    const point = new THREE.Vector3(x, y, z).project(camera);
    return {
      x: (point.x * 0.5 + 0.5) * rect.width,
      y: (-point.y * 0.5 + 0.5) * rect.height,
      z: point.z,
    };
  };

  const marqueeSelect = (rect: { left: number; top: number; right: number; bottom: number }) => {
    const currentScene = sceneDataRef.current;
    const projected = new Map<string, { left: number; top: number; right: number; bottom: number }>();
    for (const item of currentScene.items) {
      const box = itemAabb(item);
      const corners: Array<[number, number, number]> = [];
      for (const x of [box.minX, box.maxX]) {
        for (const y of [box.minY, box.maxY]) {
          for (const z of [box.minZ, box.maxZ]) corners.push([x, y, z]);
        }
      }
      const points = corners.map(([x, y, z]) => projectToHost(x, y, z)).filter(Boolean) as Array<{ x: number; y: number; z: number }>;
      if (!points.length || !points.some((point) => point.z >= -1 && point.z <= 1)) continue;
      const left = Math.min(...points.map((point) => point.x));
      const right = Math.max(...points.map((point) => point.x));
      const top = Math.min(...points.map((point) => point.y));
      const bottom = Math.max(...points.map((point) => point.y));
      projected.set(item.id, { left, top, right, bottom });
    }
    const ids = currentScene.items
      .filter((item) => {
        const box = projected.get(item.id);
        if (!box) return false;
        return !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom);
      })
      .map((item) => item.id);
    if (!ids.length) callbacks.current.onSelect(null);
    else callbacks.current.onSelect({ type: ids.length > 1 ? "items" : "item", ids });
  };

  const marqueeDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    marqueeStartRef.current = start;
    setMarquee({ x: start.x, y: start.y, width: 0, height: 0 });
  };

  const marqueeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = marqueeStartRef.current;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setMarquee({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  };

  const marqueeUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = marqueeStartRef.current;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const selectionRect = {
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      right: Math.max(start.x, x),
      bottom: Math.max(start.y, y),
    };
    if (selectionRect.right - selectionRect.left > 3 && selectionRect.bottom - selectionRect.top > 3) {
      marqueeSelect(selectionRect);
    }
    marqueeStartRef.current = null;
    setMarquee(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* no capture */
    }
  };

  const measurePoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const camera = cameraRef.current;
    const host = hostRef.current;
    if (!camera || !host) return null;
    const rect = host.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(sceneTables(sceneDataRef.current)[0]?.height || 750));
    const point = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, point) ? point : null;
  };

  const measureDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = measurePoint(event);
    if (!point) return;
    const line = measureLineRef.current;
    if (!measureStartRef.current) {
      measureStartRef.current = point;
      const hostRect = hostRef.current?.getBoundingClientRect();
      setMeasureLabel({
        text: "Primer punto. Haz clic en el segundo.",
        x: event.clientX - (hostRect?.left || 0),
        y: event.clientY - (hostRect?.top || 0),
      });
      if (line) {
        line.visible = true;
        const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
        positions.setXYZ(0, point.x, point.y, point.z + 2);
        positions.setXYZ(1, point.x, point.y, point.z + 2);
        positions.needsUpdate = true;
      }
      return;
    }
    const start = measureStartRef.current;
    const distance = start.distanceTo(point);
    if (line) {
      line.visible = true;
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      positions.setXYZ(0, start.x, start.y, start.z + 2);
      positions.setXYZ(1, point.x, point.y, point.z + 2);
      positions.needsUpdate = true;
    }
    const a = projectToHost(start.x, start.y, start.z);
    const b = projectToHost(point.x, point.y, point.z);
    setMeasureLabel({
      text: distance >= 100 ? `${(distance / 10).toFixed(1)} cm` : `${Math.round(distance)} mm`,
      x: a && b ? (a.x + b.x) / 2 : event.clientX,
      y: a && b ? (a.y + b.y) / 2 : event.clientY,
    });
    measureStartRef.current = null;
  };

  return (
    <div className="alley-viewport">
      <div className="alley-canvas" ref={hostRef} />
      {tool === "marquee" && (
        <div
          className="alley-marquee-layer"
          onPointerDown={marqueeDown}
          onPointerMove={marqueeMove}
          onPointerUp={marqueeUp}
          onPointerCancel={marqueeUp}
        >
          {marquee && (
            <div
              className="alley-marquee-box"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
        </div>
      )}
      {tool === "measure" && <div className="alley-measure-layer" onPointerDown={measureDown} />}
      {measureLabel && tool === "measure" && (
        <div className="alley-measure-label" style={{ left: measureLabel.x, top: measureLabel.y }}>
          {measureLabel.text}
        </div>
      )}
      <div className="alley-viewport-badge">
        <span className="dot pink" />
        <span>Sandbox Artist Alley</span>
        <span className="muted">· selecciona una pieza para ver los puertos</span>
      </div>
      <div className="alley-viewport-hint">
        {tool === "marquee"
          ? "Arrastra un rectángulo para seleccionar varias piezas"
          : tool === "measure"
            ? "Haz clic en dos puntos de la mesa para medir"
            : tool === "orbit"
              ? "Arrastra para orbitar; cambia a Seleccionar para editar"
              : !autoJoin
                ? "Movimiento libre: sin imán de puertos · las esferas siguen permitiendo conectar"
                : "Arrastra el fondo para orbitar · rueda para acercar · R gira 90°"}
      </div>
    </div>
  );
});
