import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SimJoint, SimPanel, SimulatorScene } from "../types";
import { ARMS_BY_PRESET } from "../data/presets";
import { cm } from "../lib/utils";
import { sceneBounds, nearestConnectionPoint, sceneConnectionPoints } from "./data";

export type SimSelection = { type: "panel" | "joint"; id: string } | null;

export interface SimulatorViewportHandle {
  screenshot: () => string;
  setView: (view: "iso" | "front" | "top" | "side") => void;
  fit: () => void;
}

interface Props {
  scene: SimulatorScene;
  selection: SimSelection;
  showMeasurements: boolean;
  showGrid: boolean;
  onSelect: (selection: SimSelection) => void;
  onMovePanel: (id: string, x: number, y: number) => void;
  onMoveJoint: (id: string, x: number, y: number, z: number) => void;
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeLabel(text: string, color = "#273033"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 384, 96);
  ctx.font = "600 34px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 253, 247, 0.92)";
  ctx.beginPath();
  ctx.roundRect(10, 16, 364, 64, 20);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, 192, 49);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(72, 18, 1);
  return sprite;
}

function lineBetween(a: THREE.Vector3, b: THREE.Vector3, color: number, dashed = false): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 3 })
    : new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
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

function buildPanel(panel: SimPanel, selected: boolean, disposed: THREE.Object3D[]): THREE.Group {
  const group = new THREE.Group();
  const w = panel.width;
  const h = panel.height;
  const baseColor = new THREE.Color(panel.color);
  const dark = baseColor.clone().multiplyScalar(0.72);
  const frameMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.5, metalness: 0.22 });
  // Invisible hit surface: an open wire grid is otherwise very hard to select
  // with a ray, because most of its area is empty space.
  const hitSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  hitSurface.rotation.x = Math.PI / 2;
  hitSurface.position.y = 0.2;
  hitSurface.userData.pickTarget = true;
  group.add(hitSurface);
  if (panel.kind === "wire") {
    const bar = 7;
    const depth = 9;
    const barGeo = new THREE.BoxGeometry(w, depth, bar);
    const verticalGeo = new THREE.BoxGeometry(bar, depth, h);
    const top = new THREE.Mesh(barGeo, frameMat);
    top.position.z = h / 2 - bar / 2;
    const bottom = new THREE.Mesh(barGeo, frameMat);
    bottom.position.z = -h / 2 + bar / 2;
    const left = new THREE.Mesh(verticalGeo, frameMat);
    left.position.x = -w / 2 + bar / 2;
    const right = new THREE.Mesh(verticalGeo, frameMat);
    right.position.x = w / 2 - bar / 2;
    group.add(top, bottom, left, right);
    const pitch = 50;
    const points: number[] = [];
    for (let x = -w / 2 + pitch; x < w / 2 - pitch / 2; x += pitch) {
      points.push(x, 0, -h / 2 + bar, x, 0, h / 2 - bar);
    }
    for (let z = -h / 2 + pitch; z < h / 2 - pitch / 2; z += pitch) {
      points.push(-w / 2 + bar, 0, z, w / 2 - bar, 0, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: dark, transparent: true, opacity: 0.85 }),
    );
    group.add(lines);
    disposed.push(group);
  } else if (panel.kind === "solid" || panel.kind === "skadis") {
    const texture = canvasTexture((ctx, width, height) => {
      ctx.fillStyle = panel.color;
      ctx.fillRect(0, 0, width, height);
      if (panel.kind === "skadis") {
        ctx.fillStyle = "rgba(25, 34, 38, 0.42)";
        const step = 27;
        for (let row = 0; row * step < height; row += 1) {
          for (let col = 0; col * step < width; col += 1) {
            const x = col * step + (row % 2 ? step / 2 : 0) + 9;
            const y = row * step + 9;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        ctx.strokeStyle = "rgba(35, 43, 48, 0.18)";
        ctx.lineWidth = 3;
        const step = 38;
        for (let i = 0; i <= width; i += step) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, height);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(width, i);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= width; i += step) {
          ctx.beginPath();
          ctx.moveTo(i + 2, 0);
          ctx.lineTo(i + 2, height);
          ctx.stroke();
        }
      }
    });
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.66,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    );
    face.rotation.x = Math.PI / 2;
    group.add(face);
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
      new THREE.LineBasicMaterial({ color: dark, transparent: true, opacity: 0.55 }),
    );
    border.rotation.x = Math.PI / 2;
    border.position.y = 0.6;
    group.add(border);
  } else {
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(w, 4, h),
      new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.7, metalness: 0.02 }),
    );
    face.castShadow = true;
    face.receiveShadow = true;
    group.add(face);
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 4.5, h)),
      new THREE.LineBasicMaterial({ color: dark }),
    );
    group.add(border);
  }
  if (selected) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 5, 16, h + 5)),
      new THREE.LineBasicMaterial({ color: 0xef6f5e, transparent: true, opacity: 0.96 }),
    );
    group.add(outline);
  }
  group.position.set(panel.x, panel.y, panel.z + h / 2);
  group.rotation.z = (panel.rotation * Math.PI) / 180;
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).castShadow = true;
      (child as THREE.Mesh).receiveShadow = true;
    }
  });
  group.userData = { type: "panel", id: panel.id };
  return group;
}

function direction(name: string): THREE.Vector3 {
  const map: Record<string, [number, number, number]> = {
    "+x": [1, 0, 0],
    "-x": [-1, 0, 0],
    "+y": [0, 1, 0],
    "-y": [0, -1, 0],
    "+z": [0, 0, 1],
    "-z": [0, 0, -1],
  };
  const value = map[name] || [1, 0, 0];
  return new THREE.Vector3(...value);
}

function buildJoint(joint: SimJoint, selected: boolean): THREE.Group {
  const group = new THREE.Group();
  const scale = Math.max(0.5, joint.scale || 1);
  const base = new THREE.Color(joint.color);
  const material = new THREE.MeshStandardMaterial({ color: base, roughness: 0.42, metalness: 0.06 });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(8 * scale, 20, 14), material);
  hub.castShadow = true;
  group.add(hub);
  const arms = ARMS_BY_PRESET[joint.presetId] || ARMS_BY_PRESET.corner90;
  for (const arm of arms) {
    const dir = direction(arm);
    const start = dir.clone().multiplyScalar(5 * scale);
    const end = dir.clone().multiplyScalar(22 * scale);
    const length = start.distanceTo(end);
    const geometry = new THREE.CylinderGeometry(3.3 * scale, 3.3 * scale, length, 12);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.castShadow = true;
    group.add(mesh);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(4.7 * scale, 0.8 * scale, 8, 18), material);
    lip.position.copy(end);
    lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    group.add(lip);
  }
  if (selected) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(54 * scale, 54 * scale, 54 * scale)),
      new THREE.LineBasicMaterial({ color: 0x1c9d91 }),
    );
    group.add(outline);
  }
  group.position.set(joint.x, joint.y, joint.z);
  group.rotation.z = (joint.rotation * Math.PI) / 180;
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).castShadow = true;
      (child as THREE.Mesh).receiveShadow = true;
    }
  });
  group.userData = { type: "joint", id: joint.id };
  return group;
}

export default forwardRef<SimulatorViewportHandle, Props>(function SimulatorViewport(
  { scene, selection, showMeasurements, showGrid, onSelect, onMovePanel, onMoveJoint },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const pickablesRef = useRef<THREE.Object3D[]>([]);
  const panelGroups = useRef(new Map<string, THREE.Group>());
  const jointGroups = useRef(new Map<string, THREE.Group>());
  const dragRef = useRef<{
    type: "panel" | "joint";
    id: string;
    offsetX: number;
    offsetY: number;
    planeZ: number;
  } | null>(null);
  const firstFitRef = useRef(false);
  const snapRef = useRef(50);
  snapRef.current = scene.grid || 50;
  const callbacks = useRef({ onSelect, onMovePanel, onMoveJoint });
  callbacks.current = { onSelect, onMovePanel, onMoveJoint };
  const sceneDataRef = useRef(scene);
  sceneDataRef.current = scene;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene3 = new THREE.Scene();
    sceneRef.current = scene3;
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 12000);
    camera.up.set(0, 0, 1);
    camera.position.set(900, -1200, 900);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
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
    controls.target.set(0, 0, 170);
    controls.minDistance = 160;
    controls.maxDistance = 5500;
    controlsRef.current = controls;

    scene3.add(new THREE.HemisphereLight(0xfffaf1, 0x7b898a, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(900, -900, 1400);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1300;
    key.shadow.camera.right = 1300;
    key.shadow.camera.top = 1300;
    key.shadow.camera.bottom = -1300;
    key.shadow.bias = -0.0005;
    scene3.add(key);
    const fill = new THREE.DirectionalLight(0xffd5bd, 1.2);
    fill.position.set(-1000, 700, 700);
    scene3.add(fill);
    const rim = new THREE.DirectionalLight(0xc6dcff, 1.5);
    rim.position.set(0, 1200, -700);
    scene3.add(rim);

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const raycastObject = (event: PointerEvent): { type: "panel" | "joint"; id: string } | null => {
      setPointer(event);
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects(pickablesRef.current, true);
      const found: Array<{ type: "panel" | "joint"; id: string }> = [];
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
      // Joints are small and frequently sit right on a panel plane.  Give
      // them priority so they remain selectable with a normal click.
      return found.find((item) => item.type === "joint") || found[0] || null;
    };

    const groundPoint = (event: PointerEvent, z: number): THREE.Vector3 | null => {
      setPointer(event);
      ray.setFromCamera(pointer, camera);
      ground.constant = -z;
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(ground, hit) ? hit : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const hit = raycastObject(event);
      if (!hit) {
        callbacks.current.onSelect(null);
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      const data = sceneDataRef.current;
      const item =
        hit.type === "panel" ? data.panels.find((item) => item.id === hit.id) : data.joints.find((item) => item.id === hit.id);
      if (!item) return;
      const point = groundPoint(event, hit.type === "panel" ? 0 : (item as SimJoint).z);
      if (!point) return;
      dragRef.current = {
        type: hit.type,
        id: hit.id,
        offsetX: point.x - item.x,
        offsetY: point.y - item.y,
        planeZ: hit.type === "panel" ? 0 : (item as SimJoint).z,
      };
      controls.enabled = false;
      callbacks.current.onSelect(hit);
      renderer.domElement.setPointerCapture(event.pointerId);
      event.stopImmediatePropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = groundPoint(event, drag.planeZ);
      if (!point) return;
      const grid = snapRef.current > 0 ? snapRef.current : 1;
      let x = Math.round((point.x - drag.offsetX) / grid) * grid;
      let y = Math.round((point.y - drag.offsetY) / grid) * grid;
      let z = drag.planeZ;
      if (drag.type === "joint") {
        const snap = nearestConnectionPoint(sceneDataRef.current, x, y, drag.planeZ, 500);
        if (snap) {
          x = snap.x;
          y = snap.y;
          z = snap.z;
        }
      }
      const group = drag.type === "panel" ? panelGroups.current.get(drag.id) : jointGroups.current.get(drag.id);
      if (group) {
        group.position.set(x, y, z);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = groundPoint(event, drag.planeZ);
      dragRef.current = null;
      controls.enabled = true;
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        /* no capture */
      }
      if (point) {
        const grid = snapRef.current > 0 ? snapRef.current : 1;
        let x = Math.round((point.x - drag.offsetX) / grid) * grid;
        let y = Math.round((point.y - drag.offsetY) / grid) * grid;
        let z = drag.planeZ;
        if (drag.type === "joint") {
          const snap = nearestConnectionPoint(sceneDataRef.current, x, y, drag.planeZ, 500);
          if (snap) {
            x = snap.x;
            y = snap.y;
            z = snap.z;
          }
        }
        if (drag.type === "panel") callbacks.current.onMovePanel(drag.id, x, y);
        else callbacks.current.onMoveJoint(drag.id, x, y, z);
      }
      event.stopPropagation();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene3, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      scene3.traverse((object) => disposeObject(object));
    };
  }, []);

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
    panelGroups.current.clear();
    jointGroups.current.clear();
    const pickables: THREE.Object3D[] = [];

    if (scene.table.show) {
      const tableTop = new THREE.Mesh(
        new THREE.BoxGeometry(scene.table.width, scene.table.depth, 26),
        new THREE.MeshStandardMaterial({ color: scene.table.color, roughness: 0.48, metalness: 0.02 }),
      );
      tableTop.position.z = -14;
      tableTop.castShadow = true;
      tableTop.receiveShadow = true;
      root.add(tableTop);
      const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(scene.table.color).multiplyScalar(0.7), roughness: 0.6 });
      for (const x of [-scene.table.width / 2 + 55, scene.table.width / 2 - 55]) {
        for (const y of [-scene.table.depth / 2 + 45, scene.table.depth / 2 - 45]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(34, 34, scene.table.height), legMat);
          leg.position.set(x, y, -scene.table.height / 2);
          leg.castShadow = true;
          root.add(leg);
        }
      }
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(2800, scene.table.width + 1200), Math.max(2200, scene.table.depth + 1200)),
        new THREE.MeshStandardMaterial({ color: 0xd8d2c7, roughness: 0.95, transparent: true, opacity: 0.42 }),
      );
      floor.position.z = -scene.table.height - 1;
      floor.receiveShadow = true;
      root.add(floor);
    }

    if (showGrid) {
      const size = Math.max(scene.table.width, 1600);
      const divisions = Math.max(8, Math.round(size / (scene.grid || 50)));
      const grid = new THREE.GridHelper(size, divisions, 0xb3b9b5, 0xd5d5cf);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = 0.6;
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      root.add(grid);
    }

    for (const panel of scene.panels) {
      const group = buildPanel(panel, selection?.type === "panel" && selection.id === panel.id, []);
      panelGroups.current.set(panel.id, group);
      root.add(group);
      pickables.push(group);
    }
    for (const joint of scene.joints) {
      const group = buildJoint(joint, selection?.type === "joint" && selection.id === joint.id);
      jointGroups.current.set(joint.id, group);
      root.add(group);
      pickables.push(group);
    }

    if (selection?.type === "joint") {
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x2f8f83, transparent: true, opacity: 0.85 });
      for (const point of sceneConnectionPoints(scene)) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 10), dotMaterial);
        dot.position.set(point.x, point.y, point.z);
        root.add(dot);
      }
    }

    if (showMeasurements) {
      const b = sceneBounds(scene);
      if (b.width > 0 && b.height > 0) {
        const yOff = b.maxY + 65;
        const xOff = b.maxX + 65;
        const zOff = b.minZ + 15;
        const color = 0x50626a;
        const wLine = lineBetween(new THREE.Vector3(b.minX, yOff, 0), new THREE.Vector3(b.maxX, yOff, 0), color, true);
        const dLine = lineBetween(new THREE.Vector3(xOff, b.minY, 0), new THREE.Vector3(xOff, b.maxY, 0), color, true);
        const hLine = lineBetween(new THREE.Vector3(xOff, b.maxY, b.minZ), new THREE.Vector3(xOff, b.maxY, b.maxZ), color, true);
        const wLabel = makeLabel(`${cm(b.width)}`, "#3f5159");
        wLabel.position.set((b.minX + b.maxX) / 2, yOff, 22);
        const dLabel = makeLabel(`${cm(b.depth)}`, "#3f5159");
        dLabel.position.set(xOff + 20, (b.minY + b.maxY) / 2, 22);
        const hLabel = makeLabel(`${cm(b.height)}`, "#3f5159");
        hLabel.position.set(xOff + 22, b.maxY + 18, (b.minZ + b.maxZ) / 2);
        root.add(wLine, dLine, hLine, wLabel, dLabel, hLabel);
      }
    }

    scene3.add(root);
    pickablesRef.current = pickables;

    if (!firstFitRef.current) {
      const b = sceneBounds(scene);
      const span = Math.max(b.width, b.depth, b.height, 620);
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        const cx = (b.minX + b.maxX) / 2;
        const cy = (b.minY + b.maxY) / 2;
        const cz = Math.max(100, b.maxZ * 0.48);
        controls.target.set(cx, cy, cz);
        camera.position.set(cx + span * 1.15, cy - span * 1.55, cz + span * 0.9);
        controls.update();
        firstFitRef.current = true;
      }
    }
  }, [scene, selection, showMeasurements, showGrid]);

  useImperativeHandle(ref, () => ({
    screenshot() {
      return rendererRef.current?.domElement.toDataURL("image/png") || "";
    },
    setView(view) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const target = new THREE.Vector3(0, 0, 180);
      const distance = 1500;
      if (view === "front") camera.position.set(0, -distance, 300);
      else if (view === "side") camera.position.set(distance, 0, 300);
      else if (view === "top") camera.position.set(0, 0, distance);
      else camera.position.set(900, -1200, 900);
      controls.target.copy(target);
      controls.update();
    },
    fit() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const b = sceneBounds(sceneDataRef.current);
      const span = Math.max(b.width, b.depth, b.height, 620);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const cz = Math.max(100, b.maxZ * 0.48);
      controls.target.set(cx, cy, cz);
      camera.position.set(cx + span * 1.15, cy - span * 1.55, cz + span * 0.9);
      controls.update();
    },
  }), []);

  return (
    <div className="sim-viewport">
      <div className="sim-canvas" ref={hostRef} />
      <div className="viewport-badge">
        <span className="dot teal" />
        <span>Editor libre</span>
        <span className="muted">· clic para seleccionar · arrastra para mover</span>
      </div>
      <div className="sim-hint">Gira con el botón izquierdo en el vacío · rueda para acercar</div>
    </div>
  );
});
