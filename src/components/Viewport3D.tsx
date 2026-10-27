import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildResult } from "../types";
import { base64ToBytes } from "../lib/utils";

export interface ViewportHandle {
  setView: (view: "iso" | "front" | "side" | "top" | "fit") => void;
  screenshot: () => string;
}

interface Props {
  build: BuildResult | null;
  building: boolean;
  error?: string;
  showBed?: boolean;
  showDecor?: boolean;
  autoRotate?: boolean;
  bedWidth?: number;
  bedDepth?: number;
}

export default forwardRef<ViewportHandle, Props>(function Viewport3D(
  { build, building, error, showBed = true, showDecor = true, autoRotate = false, bedWidth = 256, bedDepth = 256 },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.Group | null>(null);
  const bedRef = useRef<THREE.Mesh | null>(null);
  const bedBorderRef = useRef<THREE.LineSegments | null>(null);
  const centerRef = useRef(new THREE.Vector3(0, 0, 10));
  const radiusRef = useRef(80);
  const firstFitRef = useRef(false);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(120, -190, 140);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-label", "Vista 3D del conector");
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0, 12);
    controls.minDistance = 20;
    controls.maxDistance = 1600;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xfff8ec, 0x6d7d80, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(150, -180, 260);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -220;
    key.shadow.camera.right = 220;
    key.shadow.camera.top = 220;
    key.shadow.camera.bottom = -220;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffd9c1, 1.0);
    fill.position.set(-220, 130, 100);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc7e3ff, 1.3);
    rim.position.set(-80, 180, -120);
    scene.add(rim);

    const grid = new THREE.Group();
    const gridHelper = new THREE.GridHelper(600, 60, 0x9ea8a6, 0xcbd0ca);
    gridHelper.rotation.x = Math.PI / 2;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.52;
    grid.add(gridHelper);
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(256, 256),
      new THREE.MeshStandardMaterial({
        color: 0xf3eee4,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      }),
    );
    bed.position.z = -0.35;
    bed.receiveShadow = true;
    grid.add(bed);
    bedRef.current = bed;
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(256, 256, 1.4)),
      new THREE.LineBasicMaterial({ color: 0xa6ada6, transparent: true, opacity: 0.6 }),
    );
    border.position.z = -0.35;
    grid.add(border);
    bedBorderRef.current = border;
    scene.add(grid);
    gridRef.current = grid;

    const placeholder = new THREE.Group();
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(38, 38, 38)),
      new THREE.LineBasicMaterial({ color: 0xb7aaa0, transparent: true, opacity: 0.7 }),
    );
    placeholder.add(box);
    placeholder.name = "placeholder";
    scene.add(placeholder);

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
      controls.autoRotate = autoRotateRef.current;
      controls.autoRotateSpeed = 1.4;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) material.dispose();
        }
      });
    };
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (grid) grid.visible = showBed;
  }, [showBed]);

  useEffect(() => {
    const safeW = Math.max(80, Math.min(600, bedWidth));
    const safeD = Math.max(80, Math.min(600, bedDepth));
    if (bedRef.current) bedRef.current.scale.set(safeW / 256, safeD / 256, 1);
    if (bedBorderRef.current) bedBorderRef.current.scale.set(safeW / 256, safeD / 256, 1);
  }, [bedWidth, bedDepth]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const existing = modelRef.current;
    if (existing) {
      scene.remove(existing);
      existing.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) material.dispose();
        }
      });
      modelRef.current = null;
    }
    const placeholder = scene.getObjectByName("placeholder");
    if (placeholder) placeholder.visible = !build;
    if (!build) return;
    const group = new THREE.Group();
    const loader = new STLLoader();
    const box = new THREE.Box3();
    for (const part of build.parts) {
      if (!showDecor && part.name.startsWith("Placa")) continue;
      try {
        const bytes = base64ToBytes(part.b64);
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        const rawGeometry = loader.parse(buffer);
                // closed slices.  Welding nearby vertices here turns that visible
        // stair-step shading into a smooth printed surface.
        const geometry = mergeVertices(rawGeometry, 0.06);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(part.color),
          roughness: 0.48,
          metalness: 0.04,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        geometry.computeBoundingBox();
        if (geometry.boundingBox) box.union(geometry.boundingBox);
      } catch (err) {
        console.error("No se pudo cargar una pieza STL", err);
      }
    }
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      group.position.set(-center.x, -center.y, -box.min.z);
      centerRef.current.set(center.x, center.y, center.z);
      const size = box.getSize(new THREE.Vector3());
      radiusRef.current = Math.max(size.length() / 2, 30);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.set(0, 0, Math.max(8, size.z * 0.45));
        if (!firstFitRef.current) {
          const camera = cameraRef.current;
          if (camera) {
            const r = Math.max(radiusRef.current, 35);
            camera.position.set(r * 2.15, -r * 2.8, r * 2.0);
            controls.target.set(0, 0, Math.max(8, size.z * 0.36));
            controls.update();
          }
          firstFitRef.current = true;
        }
      }
    }
    scene.add(group);
    modelRef.current = group;
  }, [build, showDecor]);

  useImperativeHandle(ref, () => ({
    setView(view) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const target = centerRef.current.clone();
      target.z = Math.max(8, target.z * 0.65);
      const radius = Math.max(radiusRef.current, 40);
      const positions: Record<string, THREE.Vector3> = {
        iso: new THREE.Vector3(radius * 2.15, -radius * 2.8, radius * 2.0),
        front: new THREE.Vector3(0, -radius * 3.7, radius * 1.0),
        side: new THREE.Vector3(radius * 3.7, 0, radius * 1.0),
        top: new THREE.Vector3(0, 0, radius * 3.8),
        fit: new THREE.Vector3(radius * 2.15, -radius * 2.8, radius * 2.0),
      };
      const position = positions[view] || positions.iso;
      camera.position.copy(target).add(position);
      controls.target.copy(target);
      controls.update();
    },
    screenshot() {
      const renderer = rendererRef.current;
      if (!renderer) return "";
      return renderer.domElement.toDataURL("image/png");
    },
  }), []);

  return (
    <div className="viewport">
      <div className="viewport-canvas" ref={hostRef} />
      <div className="viewport-badge">
        <span className="dot" />
        <span>Vista 3D</span>
        <span className="muted">· arrastra para orbitar</span>
      </div>
      {building && (
        <div className="viewport-loading">
          <span className="spinner" />
          <span>Calculando geometría…</span>
        </div>
      )}
      {error && !building && (
        <div className="viewport-error">
          <strong>No se pudo generar el modelo</strong>
          <span>{error}</span>
        </div>
      )}
      {!build && !building && !error && (
        <div className="viewport-hint">
          <span>Elige un preset o empieza a ajustar</span>
          <small>El modelo aparecerá aquí</small>
        </div>
      )}
    </div>
  );
});
