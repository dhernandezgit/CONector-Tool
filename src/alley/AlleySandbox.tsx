import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Grid2X2,
  Group,
  Layers,
  Link2,
  List,
  Maximize2,
  MousePointer2,
  Package,
  PanelTop,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  Ungroup,
  Unlink,
  X,
} from "lucide-react";
import { CATALOG, CATALOG_BY_TYPE, CATEGORY_LABELS, CONNECTORS, GROUPS, PALETTE } from "./catalog";
import {
  allowedConnectorTypes,
  catalogFor,
  itemColor,
  jointItems,
  portCompatible,
  portWorld,
} from "./geometry";
import {
  addCatalogItem,
  addGroup,
  clearScene,
  commitScene,
  countGroupItems,
  deleteGroup,
  deleteItems,
  duplicateSelection,
  expandSelectionWithGroups,
  groupFor,
  groupSelection,
  itemsInGroup,
  moveItems,
  moveMountedItem,
  mountItem,
  rotateItems,
  sceneBom,
  selectedPanelForMount,
  setJointType,
  starterScene,
  toggleJointSuppressed,
  ungroupSelection,
  unmountItem,
} from "./scene";
import type {
  AlleyCategory,
  AlleyItem,
  AlleyProjection,
  AlleyScene,
  AlleySelection,
  AlleyViewName,
  ConnectorType,
  PortRef,
} from "./types";
import AlleyViewport, { type AlleyViewportHandle } from "./AlleyViewport";
import ViewCube from "./ViewCube";
import { ColorField, NumberField, RangeField, Segmented, SelectField, Toggle } from "../components/UI";
import { clamp } from "../lib/utils";

type CategoryFilter = AlleyCategory | "todos";

interface Props {
  scene: AlleyScene;
  projectName: string;
  onChange: (scene: AlleyScene) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenBom: () => void;
  onToast: (message: string) => void;
}

function itemTypeLabel(item: AlleyItem): string {
  return catalogFor(item).name;
}

function dot(color: string) {
  return <span className="alley-dot" style={{ background: color }} />;
}

export default function AlleySandbox({
  scene,
  projectName,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenBom,
  onToast,
}: Props) {
  const viewportRef = useRef<AlleyViewportHandle | null>(null);
  const [selection, setSelection] = useState<AlleySelection | null>(null);
  const [pendingPort, setPendingPort] = useState<PortRef | null>(null);
  const [category, setCategory] = useState<CategoryFilter>("todos");
  const [query, setQuery] = useState("");
  const [showPorts, setShowPorts] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showGroups, setShowGroups] = useState(true);
  const [projection, setProjection] = useState<AlleyProjection>("isometric");
  const [cameraAngles, setCameraAngles] = useState({ azimuth: -53, polar: 65 });

  const selectedItems = useMemo(
    () => (selection && selection.type !== "joint" ? scene.items.filter((item) => selection.ids.includes(item.id)) : []),
    [scene.items, selection],
  );
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : undefined;
  const selectedJoint = useMemo(
    () => (selection?.type === "joint" ? scene.joints.find((joint) => selection.ids.includes(joint.id)) : undefined),
    [scene.joints, selection],
  );
  const selectedGroup = selectedItem?.groupId ? groupFor(scene, selectedItem.groupId) : undefined;
  const selectedGroupItems = selectedGroup ? itemsInGroup(scene, selectedGroup.id) : [];
  const selectedPanel = selectedPanelForMount(scene, selection);
  const bom = useMemo(() => sceneBom(scene), [scene]);
  const activeJoints = scene.joints.filter((joint) => !joint.suppressed).length;
  const panels = scene.items.filter((item) => catalogFor(item).category === "paneles");
  const pendingItem = pendingPort ? scene.items.find((item) => item.id === pendingPort.itemId) : undefined;

  const filteredCatalog = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CATALOG.filter((item) => {
      if (category !== "todos" && category !== "grupos" && item.category !== category) return false;
      if (!needle) return true;
      return [item.name, item.subtitle, item.description, ...item.tags].join(" ").toLowerCase().includes(needle);
    });
  }, [category, query]);

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return GROUPS;
    return GROUPS.filter((group) => [group.name, group.description].join(" ").toLowerCase().includes(needle));
  }, [query]);

  const mutate = useCallback(
    (next: AlleyScene) => {
      if (next !== scene) onChange(next);
    },
    [onChange, scene],
  );

  const changeView = useCallback((next: AlleyViewName) => {
    viewportRef.current?.setView(next);
  }, []);

  const changeProjection = useCallback((next: AlleyProjection) => {
    setProjection(next);
  }, []);

  const activeView = useMemo<AlleyViewName>(() => {
    const azimuth = ((cameraAngles.azimuth % 360) + 360) % 360;
    const polar = cameraAngles.polar;
    if (polar < 8) return "top";
    if (polar > 82) {
      if (Math.abs(azimuth - 270) < 12) return "front";
      if (Math.abs(azimuth - 90) < 12) return "back";
      if (azimuth < 12 || azimuth > 348) return "right";
      if (Math.abs(azimuth - 180) < 12) return "left";
    }
    return "iso";
  }, [cameraAngles]);

  useEffect(() => {
    if (!selection) return;
    if (selection.type === "joint") {
      if (!scene.joints.some((joint) => selection.ids.includes(joint.id))) setSelection(null);
      return;
    }
    const valid = selection.ids.filter((id) => scene.items.some((item) => item.id === id));
    if (valid.length !== selection.ids.length) {
      setSelection(valid.length ? { type: valid.length > 1 ? "items" : "item", ids: valid } : null);
    }
  }, [scene, selection]);

  const updateItem = useCallback(
    (id: string, patch: Partial<AlleyItem>) => {
      const items = scene.items.map((item) => (item.id === id ? { ...item, ...patch } : item));
      mutate(commitScene({ ...scene, items }));
    },
    [mutate, scene],
  );

  const updateTable = useCallback(
    (patch: Partial<AlleyScene["table"]>) => {
      const oldHeight = scene.table.height;
      const nextHeight = patch.height ?? oldHeight;
      const dz = nextHeight - oldHeight;
      const items = dz ? scene.items.map((item) => ({ ...item, baseZ: Math.max(0, item.baseZ + dz) })) : scene.items;
      mutate(commitScene({ ...scene, table: { ...scene.table, ...patch }, items }));
    },
    [mutate, scene],
  );

  const addItem = useCallback(
    (type: string) => {
      const catalog = CATALOG_BY_TYPE[type];
      if (!catalog) return;
      const result = addCatalogItem(scene, type, { panelId: selectedPanel?.id });
      mutate(result.scene);
      setSelection({ type: "item", ids: [result.itemId] });
      setPendingPort(null);
      if (!result.created) {
        onToast(`${catalog.name}: ya había una pieza igual, se ha reutilizado.`);
        return;
      }
      const added = result.scene.items.find((item) => item.id === result.itemId);
      if (added?.mount) {
        const panel = result.scene.items.find((item) => item.id === added.mount?.panelId);
        onToast(`${catalog.name} montado en ${panel ? itemTypeLabel(panel) : "el panel"}.`);
      } else if (catalog.mountable) {
        onToast(`${catalog.name} colocado en la mesa. Añade un panel para montarlo.`);
      } else {
        onToast(`${catalog.name} añadido. Arrástralo o conéctalo por las esferas.`);
      }
    },
    [mutate, onToast, scene, selectedPanel?.id],
  );

  const addPreset = useCallback(
    (presetId: string) => {
      const result = addGroup(scene, presetId);
      if (!result.created) {
        onToast("Ese grupo ya está completo en la escena; no se ha duplicado.");
        return;
      }
      mutate(result.scene);
      const first = result.scene.items.find((item) => item.groupId === result.groupId);
      if (first) setSelection({ type: "item", ids: [first.id] });
      setPendingPort(null);
      onToast(`Grupo añadido: ${result.created} pieza${result.created === 1 ? "" : "s"}.`);
      window.setTimeout(() => viewportRef.current?.fit(), 60);
    },
    [mutate, onToast, scene],
  );

  const rotate = useCallback(
    (delta: number) => {
      if (!selection || selection.type === "joint") {
        onToast("Selecciona una pieza o un grupo para girarlo.");
        return;
      }
      mutate(rotateItems(scene, selection.ids, delta));
    },
    [mutate, onToast, scene, selection],
  );

  const duplicate = useCallback(() => {
    if (!selection || selection.type === "joint") {
      onToast("Selecciona una pieza o un grupo para duplicarlo.");
      return;
    }
    const result = duplicateSelection(scene, selection.ids);
    if (!result.ids.length) {
      onToast("La copia caía sobre una pieza existente; no se ha duplicado.");
      return;
    }
    mutate(result.scene);
    setSelection({ type: result.ids.length > 1 ? "items" : "item", ids: result.ids });
    onToast(`Copia creada (${result.ids.length} pieza${result.ids.length === 1 ? "" : "s"}).`);
  }, [mutate, onToast, scene, selection]);

  const removeSelection = useCallback(() => {
    if (!selection) return;
    if (selection.type === "joint") {
      mutate(toggleJointSuppressed(scene, selection.ids[0]));
      onToast("Conector oculto. La pieza sigue en su sitio y puedes restaurarlo.");
      return;
    }
    const removed = selection.ids.length;
    mutate(deleteItems(scene, selection.ids));
    setSelection(null);
    setPendingPort(null);
    onToast(`${removed === 1 ? "Pieza eliminada" : `${removed} piezas eliminadas`}. El resto del puesto sigue en pie.`);
  }, [mutate, onToast, scene, selection]);

  const removeGroup = useCallback(() => {
    if (!selectedGroup) return;
    const count = countGroupItems(scene, selectedGroup.id);
    mutate(deleteGroup(scene, selectedGroup.id));
    setSelection(null);
    setPendingPort(null);
    onToast(`Grupo "${selectedGroup.name}" eliminado (${count} piezas).`);
  }, [mutate, onToast, scene, selectedGroup]);

  const groupSelected = useCallback(() => {
    if (selectedItems.length < 2) {
      onToast("Selecciona al menos dos piezas con Mayús + clic para agruparlas.");
      return;
    }
    const ids = selectedItems.map((item) => item.id);
    const result = groupSelection(scene, ids);
    mutate(result.scene);
    setSelection({ type: "items", ids });
    const group = result.scene.groups.find((entry) => entry.id === result.groupId);
    onToast(`Grupo "${group?.name || "nuevo"}" creado. Se moverá y girará junto.`);
  }, [mutate, onToast, scene, selectedItems]);

  const ungroupSelected = useCallback(() => {
    if (!selectedItems.length) return;
    mutate(ungroupSelection(scene, selectedItems.map((item) => item.id)));
    onToast("Piezas desagrupadas. Ahora puedes moverlas por separado.");
  }, [mutate, onToast, scene, selectedItems]);

  const selectWholeGroup = useCallback(() => {
    if (!selectedGroup) return;
    setSelection({ type: "items", ids: selectedGroupItems.map((item) => item.id) });
    onToast(`Grupo "${selectedGroup.name}" seleccionado (${selectedGroupItems.length} piezas).`);
  }, [onToast, selectedGroup, selectedGroupItems]);

  const handlePortClick = useCallback(
    (port: PortRef) => {
      const item = scene.items.find((candidate) => candidate.id === port.itemId);
      if (!item) return;
      if (!pendingPort) {
        setPendingPort(port);
        setSelection({ type: "item", ids: [item.id] });
        onToast("Origen elegido. Toca una esfera amarilla para conectar, o Esc para cancelar.");
        return;
      }
      if (pendingPort.itemId === port.itemId && pendingPort.portId === port.portId) {
        setPendingPort(null);
        onToast("Conexión cancelada.");
        return;
      }
      const sourceItem = scene.items.find((candidate) => candidate.id === pendingPort.itemId);
      if (!sourceItem) {
        setPendingPort(null);
        return;
      }
      const source = portWorld(sourceItem, pendingPort.portId);
      const target = portWorld(item, port.portId);
      if (!source || !target) {
        setPendingPort(null);
        return;
      }
      if (!portCompatible(source, target)) {
        onToast("Esas esferas no comparten sistema: prueba una esfera amarilla.");
        return;
      }
      if (item.mount) {
        onToast("Ese accesorio está montado en un panel. Desmóntalo para conectarlo.");
        return;
      }
      const moveIds = expandSelectionWithGroups(scene, [item.id]);
      const delta = { dx: source.x - target.x, dy: source.y - target.y, dz: source.z - target.z };
      const next = moveItems(scene, moveIds, delta.dx, delta.dy, delta.dz);
      mutate(next);
      setPendingPort(null);
      const joint = next.joints.find(
        (candidate) =>
          candidate.ports.some((ref) => ref.itemId === pendingPort.itemId && ref.portId === pendingPort.portId) &&
          candidate.ports.some((ref) => ref.itemId === port.itemId && ref.portId === port.portId),
      );
      if (joint) {
        setSelection({ type: "joint", ids: [joint.id] });
        onToast(`Conexión creada con ${CONNECTORS[joint.type]?.short || "conector"}.`);
      } else {
        onToast("Las piezas se han acercado; no se ha podido crear la unión.");
      }
    },
    [mutate, onToast, pendingPort, scene],
  );

  const handleMoveItems = useCallback(
    (ids: string[], dx: number, dy: number, dz: number) => {
      if (!dx && !dy && !dz) return;
      const next = moveItems(scene, ids, dx, dy, dz);
      mutate(next);
      const missing = ids.some((id) => !next.items.some((item) => item.id === id));
      if (missing) onToast("La pieza coincidía con otra: se ha reutilizado la existente, sin duplicar.");
      else if (dz) onToast(`Altura ajustada a ${Math.round((next.items.find((item) => item.id === ids[0])?.baseZ || 0) / 10)} cm.`);
    },
    [mutate, onToast, scene],
  );

  const handleMoveMount = useCallback(
    (itemId: string, u: number, v: number) => {
      mutate(moveMountedItem(scene, itemId, u, v));
    },
    [mutate, scene],
  );

  const loadExample = useCallback(() => {
    mutate(starterScene());
    setSelection(null);
    setPendingPort(null);
    onToast("Puesto de ejemplo cargado. Todo es editable.");
    window.setTimeout(() => viewportRef.current?.fit(), 60);
  }, [mutate, onToast]);

  const emptyTable = useCallback(() => {
    if (!scene.items.length) {
      onToast("La mesa ya está vacía.");
      return;
    }
    if (!window.confirm("¿Vaciar la mesa? Podrás deshacerlo con Ctrl+Z.")) return;
    mutate(clearScene(scene));
    setSelection(null);
    setPendingPort(null);
    onToast("Mesa vacía. Usa Ctrl+Z para recuperar el puesto.");
  }, [mutate, onToast, scene]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicate();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelection();
        return;
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        rotate(event.shiftKey ? -90 : 90);
        return;
      }
      if (event.key.toLowerCase() === "g" && !mod) {
        event.preventDefault();
        groupSelected();
        return;
      }
      if (event.key === "Escape") {
        setSelection(null);
        setPendingPort(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicate, groupSelected, onRedo, onUndo, removeSelection, rotate]);

  const jointTypes = selectedJoint ? allowedConnectorTypes(scene, selectedJoint) : [];
  if (selectedJoint && !jointTypes.includes(selectedJoint.type)) jointTypes.unshift(selectedJoint.type);
  const jointTypeOptions = jointTypes.map((type) => ({
    value: type,
    label: CONNECTORS[type]?.name || type,
  }));
  const jointItemsList = selectedJoint ? jointItems(scene, selectedJoint) : [];

  const itemBom = selectedItem ? catalogFor(selectedItem).bom : [];
  const panelOptions = [
    { value: "", label: "Elegir panel…" },
    ...panels.map((panel) => ({ value: panel.id, label: itemTypeLabel(panel) })),
  ];
  const mountFace = selectedItem?.mount?.face || "front";
  const mountU = selectedItem?.mount?.u ?? 0.5;
  const mountV = selectedItem?.mount?.v ?? 0.5;

  const renderCatalogItem = (item: (typeof CATALOG)[number]) => (
    <button
      type="button"
      key={item.type}
      className="alley-catalog-item"
      onClick={() => addItem(item.type)}
      title={`${item.description} · ${item.dims.w} × ${item.dims.d} × ${item.dims.h} mm`}
    >
      <span className="alley-catalog-icon" style={{ background: `${item.color}55`, color: item.color }}>
        {item.icon}
      </span>
      <span className="alley-catalog-copy">
        <strong>{item.name}</strong>
        <small>{item.subtitle}</small>
      </span>
      <span className="alley-catalog-add">
        <Plus size={15} />
      </span>
    </button>
  );

  return (
    <div className="alley-sandbox">
      <aside className="alley-rail alley-rail-left">
        <div className="alley-rail-head">
          <div>
            <span className="eyebrow">Catálogo</span>
            <h2>Piezas del puesto</h2>
          </div>
          <span className="alley-count">{CATALOG.length}</span>
        </div>

        <div className="alley-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar panel, toldo, gancho…"
            aria-label="Buscar piezas"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="alley-category-chips">
          {(["todos", "paneles", "expositores", "estantes", "accesorios", "grupos"] as CategoryFilter[]).map((entry) => (
            <button
              type="button"
              key={entry}
              className={category === entry ? "active" : ""}
              onClick={() => setCategory(entry)}
            >
              {entry === "todos" ? "Todo" : CATEGORY_LABELS[entry]}
            </button>
          ))}
        </div>

        <div className="alley-catalog-scroll">
          {(category === "todos" || category === "grupos") && filteredGroups.length > 0 && (
            <section className="alley-catalog-section">
              <button type="button" className="alley-section-head" onClick={() => setShowGroups((value) => !value)}>
                <span>
                  <Sparkles size={14} /> Grupos rápidos
                </span>
                <ChevronRight size={15} className={showGroups ? "rotated" : ""} />
              </button>
              {showGroups && (
                <div className="alley-group-list">
                  {filteredGroups.map((group) => (
                    <button type="button" className="alley-group-card" key={group.id} onClick={() => addPreset(group.id)}>
                      <span className="alley-group-icon">{group.icon}</span>
                      <span>
                        <strong>{group.name}</strong>
                        <small>{group.description}</small>
                      </span>
                      <Plus size={15} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {category !== "grupos" && (
            <section className="alley-catalog-section">
              <div className="alley-section-head static">
                <span>
                  <Box size={14} /> {category === "todos" ? "Piezas sueltas" : CATEGORY_LABELS[category]}
                </span>
                <span className="alley-count small">{filteredCatalog.length}</span>
              </div>
              <div className="alley-catalog-list">{filteredCatalog.map(renderCatalogItem)}</div>
              {!filteredCatalog.length && <p className="alley-empty-copy">No hay piezas que coincidan con la búsqueda.</p>}
            </section>
          )}
        </div>

        <div className="alley-rail-foot">
          <p>
            <strong>Diseño del pack:</strong> Jessie Shi (Sandoik / @sandoikstitches). Representaciones originales y
            simplificadas; los STL comprados no se incluyen ni se publican.
          </p>
        </div>
      </aside>

      <main className="alley-stage">
        <div className="alley-toolbar">
          <div className="alley-tool-group">
            <button type="button" className="alley-tool" onClick={() => setSelection(null)} title="Quitar selección">
              <MousePointer2 size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={onUndo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
              <RotateCcw size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={onRedo} disabled={!canRedo} title="Rehacer (Ctrl+Mayús+Z)">
              <RotateCw size={16} />
            </button>
          </div>
          <div className="alley-tool-group">
            <button type="button" className="alley-tool" onClick={() => rotate(-90)} title="Girar -90°">
              <RotateCcw size={16} />
              <span className="alley-tool-mini">-90</span>
            </button>
            <button type="button" className="alley-tool" onClick={() => rotate(90)} title="Girar +90° (R)">
              <RotateCw size={16} />
              <span className="alley-tool-mini">+90</span>
            </button>
            <button type="button" className="alley-tool" onClick={duplicate} title="Duplicar (Ctrl+D)">
              <Copy size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={groupSelected} title="Agrupar (G)">
              <Group size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={ungroupSelected} title="Desagrupar">
              <Ungroup size={16} />
            </button>
            <button type="button" className="alley-tool danger" onClick={removeSelection} title="Eliminar (Supr)">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="alley-tool-group">
            <button type="button" className={`alley-tool${activeView === "iso" ? " active" : ""}`} onClick={() => changeView("iso")} title="Vista isométrica">
              <Box size={16} />
            </button>
            <button type="button" className={`alley-tool${activeView === "front" ? " active" : ""}`} onClick={() => changeView("front")} title="Vista frontal">
              <PanelTop size={16} />
            </button>
            <button type="button" className={`alley-tool${activeView === "top" ? " active" : ""}`} onClick={() => changeView("top")} title="Vista superior">
              <Grid2X2 size={16} />
            </button>
            <button type="button" className={`alley-tool${activeView === "right" ? " active" : ""}`} onClick={() => changeView("right")} title="Vista lateral">
              <Layers size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={() => viewportRef.current?.fit()} title="Encuadrar">
              <Maximize2 size={16} />
            </button>
          </div>
          <div className="alley-tool-group alley-projection-switch" role="group" aria-label="Proyección de cámara">
            <button
              type="button"
              className={`alley-tool text${projection === "isometric" ? " active" : ""}`}
              onClick={() => changeProjection("isometric")}
              title="Isométrico: sin perspectiva, ideal para colocar"
            >
              Iso
            </button>
            <button
              type="button"
              className={`alley-tool text${projection === "perspective" ? " active" : ""}`}
              onClick={() => changeProjection("perspective")}
              title="Perspectiva: vista realista"
            >
              Persp.
            </button>
          </div>
          <div className="alley-tool-group">
            <button
              type="button"
              className={`alley-tool${showPorts ? " active" : ""}`}
              onClick={() => setShowPorts((value) => !value)}
              title="Mostrar u ocultar esferas de conexión"
            >
              {showPorts ? <Eye size={16} /> : <EyeOff size={16} />}
              <span className="alley-tool-mini">Esferas</span>
            </button>
            <button
              type="button"
              className={`alley-tool${showGrid ? " active" : ""}`}
              onClick={() => setShowGrid((value) => !value)}
              title="Mostrar u ocultar rejilla"
            >
              <Grid2X2 size={16} />
              <span className="alley-tool-mini">Rejilla</span>
            </button>
          </div>
          <div className="alley-tool-group push">
            <button type="button" className="alley-tool text" onClick={onOpenBom}>
              <List size={16} /> Lista de materiales
            </button>
          </div>
        </div>

        <div className="alley-viewport-wrap">
          <AlleyViewport
            ref={viewportRef}
            scene={scene}
            selection={selection}
            pendingPort={pendingPort}
            showPorts={showPorts}
            showGrid={showGrid}
            projection={projection}
            onSelect={(next) => {
              setSelection(next);
              if (next?.type === "joint") setPendingPort(null);
            }}
            onPortClick={handlePortClick}
            onMoveItems={handleMoveItems}
            onMoveMount={handleMoveMount}
            onCameraChange={(azimuth, polar) => setCameraAngles({ azimuth, polar })}
          />
          <ViewCube
            view={activeView}
            projection={projection}
            azimuth={cameraAngles.azimuth}
            polar={cameraAngles.polar}
            onView={changeView}
            onProjection={changeProjection}
            onOrbit={(dx, dy) => viewportRef.current?.orbit(dx, dy)}
          />
          {pendingPort && (
            <div className="alley-pending">
              <Link2 size={15} />
              <span>
                Conectando desde <strong>{pendingItem ? itemTypeLabel(pendingItem) : "una pieza"}</strong>. Toca una esfera amarilla.
              </span>
              <button type="button" onClick={() => setPendingPort(null)}>
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div className="alley-status">
          <span>
            <Box size={14} /> {scene.items.length} piezas
          </span>
          <span>
            <Link2 size={14} /> {activeJoints} uniones
          </span>
          <span>
            <Layers size={14} /> {scene.groups.length} grupos
          </span>
          <span>
            <Package size={14} /> {bom.totalParts} en la lista
          </span>
          <span className="alley-status-spacer" />
          <span className="muted">
            {scene.table.width / 10} × {scene.table.depth / 10} cm · {projectName}
          </span>
        </div>
      </main>

      <aside className="alley-rail alley-rail-right">
        <div className="alley-inspector">
          {!selection && (
            <>
              <div className="alley-inspector-head">
                <span className="eyebrow">Inspector</span>
                <h2>Tu puesto</h2>
                <p>Selecciona una pieza, una unión o una esfera del visor.</p>
              </div>

              <div className="alley-summary-grid">
                <div>
                  <span>Piezas</span>
                  <strong>{scene.items.length}</strong>
                </div>
                <div>
                  <span>Uniones</span>
                  <strong>{activeJoints}</strong>
                </div>
                <div>
                  <span>Grupos</span>
                  <strong>{scene.groups.length}</strong>
                </div>
                <div>
                  <span>Materiales</span>
                  <strong>{bom.totalParts}</strong>
                </div>
              </div>

              <section className="alley-panel">
                <h3>Mesa de trabajo</h3>
                <div className="alley-field-grid">
                  <NumberField label="Ancho" value={scene.table.width} min={800} max={5000} step={50} suffix="mm" onChange={(value) => updateTable({ width: value })} />
                  <NumberField label="Fondo" value={scene.table.depth} min={500} max={2500} step={50} suffix="mm" onChange={(value) => updateTable({ depth: value })} />
                  <NumberField label="Alto" value={scene.table.height} min={0} max={1200} step={25} suffix="mm" onChange={(value) => updateTable({ height: value })} />
                  <NumberField label="Rejilla" value={scene.grid} min={10} max={200} step={10} suffix="mm" onChange={(value) => mutate({ ...scene, grid: value })} />
                </div>
                <ColorField label="Color de la mesa" value={scene.table.color} onChange={(value) => updateTable({ color: value })} />
              </section>

              {scene.groups.length > 0 && (
                <section className="alley-panel">
                  <h3>Tus grupos</h3>
                  <div className="alley-group-rows">
                    {scene.groups.map((group) => {
                      const count = countGroupItems(scene, group.id);
                      return (
                        <div className="alley-group-row" key={group.id}>
                          <button
                            type="button"
                            onClick={() => {
                              const items = itemsInGroup(scene, group.id);
                              setSelection({ type: items.length > 1 ? "items" : "item", ids: items.map((item) => item.id) });
                            }}
                          >
                            <Layers size={14} />
                            <span>
                              <strong>{group.name}</strong>
                              <small>{count} pieza{count === 1 ? "" : "s"}</small>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="alley-icon-danger"
                            title="Eliminar grupo"
                            onClick={() => {
                              if (!window.confirm(`¿Eliminar "${group.name}" y sus ${count} piezas?`)) return;
                              mutate(deleteGroup(scene, group.id));
                              setSelection(null);
                              onToast("Grupo eliminado.");
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="alley-panel">
                <h3>Leyenda de conexiones</h3>
                <div className="alley-legend">
                  <span><i className="teal" /> Puerto libre</span>
                  <span><i className="green" /> Ya conectado</span>
                  <span><i className="pink" /> Origen elegido</span>
                  <span><i className="yellow" /> Destino compatible</span>
                </div>
                <p className="alley-note">
                  Las esferas grandes son los puertos de las esquinas y bordes. Toca una y luego otra compatible para
                  acercar las piezas y crear la unión.
                </p>
              </section>

              <section className="alley-panel">
                <h3>Atajos</h3>
                <div className="alley-shortcuts">
                  <span><kbd>R</kbd> girar 90°</span>
                  <span><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicar</span>
                  <span><kbd>G</kbd> agrupar</span>
                  <span><kbd>Supr</kbd> eliminar</span>
                  <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer</span>
                  <span><kbd>Esc</kbd> cancelar</span>
                </div>
              </section>

              <div className="alley-inspector-actions">
                <button type="button" className="secondary-button wide" onClick={loadExample}>
                  <Sparkles size={15} /> Cargar ejemplo
                </button>
                <button type="button" className="secondary-button wide danger-text" onClick={emptyTable}>
                  <Trash2 size={15} /> Vaciar mesa
                </button>
              </div>
            </>
          )}

          {selectedItem && !selectedJoint && (
            <>
              <div className="alley-inspector-head item">
                <span className="alley-inspector-icon" style={{ background: `${itemColor(selectedItem)}44`, color: itemColor(selectedItem) }}>
                  {catalogFor(selectedItem).icon}
                </span>
                <div>
                  <span className="eyebrow">{CATEGORY_LABELS[catalogFor(selectedItem).category]}</span>
                  <h2>{itemTypeLabel(selectedItem)}</h2>
                  <p>{catalogFor(selectedItem).subtitle}</p>
                </div>
              </div>

              {selectedGroup && (
                <div className="alley-group-banner">
                  <Layers size={15} />
                  <div>
                    <strong>{selectedGroup.name}</strong>
                    <small>{selectedGroupItems.length} piezas se mueven y giran juntas</small>
                  </div>
                  <button type="button" onClick={selectWholeGroup}>Seleccionar</button>
                </div>
              )}

              <section className="alley-panel">
                <h3>Transformar</h3>
                <div className="alley-field-grid three">
                  <NumberField label="X" value={Math.round(selectedItem.x)} min={-3000} max={3000} step={10} suffix="mm" onChange={(value) => updateItem(selectedItem.id, { x: value })} />
                  <NumberField label="Y" value={Math.round(selectedItem.y)} min={-3000} max={3000} step={10} suffix="mm" onChange={(value) => updateItem(selectedItem.id, { y: value })} />
                  <NumberField label="Altura" value={Math.round(selectedItem.baseZ)} min={0} max={3000} step={10} suffix="mm" onChange={(value) => updateItem(selectedItem.id, { baseZ: value })} />
                </div>
                <div className="alley-rotation-row">
                  <span className="alley-field-label">Rotación</span>
                  <Segmented
                    small
                    value={String(Math.round(selectedItem.rotation / 90) * 90 % 360)}
                    options={[
                      { value: "0", label: "0°" },
                      { value: "90", label: "90°" },
                      { value: "180", label: "180°" },
                      { value: "270", label: "270°" },
                    ]}
                    onChange={(value) => updateItem(selectedItem.id, { rotation: Number(value) })}
                  />
                </div>
                <NumberField label="Ángulo fino" value={Math.round(selectedItem.rotation)} min={0} max={359} step={5} suffix="°" onChange={(value) => updateItem(selectedItem.id, { rotation: value })} />
                <div className="alley-inline-actions">
                  <button type="button" className="alley-small-button" onClick={() => rotate(-90)}><RotateCcw size={14} /> -90°</button>
                  <button type="button" className="alley-small-button" onClick={() => rotate(90)}><RotateCw size={14} /> +90°</button>
                </div>
              </section>

              <section className="alley-panel">
                <h3>Color</h3>
                <ColorField label="Acabado" value={itemColor(selectedItem)} onChange={(value) => updateItem(selectedItem.id, { color: value })} />
                <div className="alley-swatches">
                  {PALETTE.map((color) => (
                    <button
                      type="button"
                      key={color}
                      style={{ background: color }}
                      className={itemColor(selectedItem) === color ? "active" : ""}
                      onClick={() => updateItem(selectedItem.id, { color })}
                      aria-label={`Color ${color}`}
                    />
                  ))}
                </div>
              </section>

              {catalogFor(selectedItem).mountable && (
                <section className="alley-panel">
                  <h3>Montaje en panel</h3>
                  {selectedItem.mount ? (
                    <>
                      <p className="alley-note">
                        Montado en <strong>{itemTypeLabel(scene.items.find((item) => item.id === selectedItem.mount?.panelId) || selectedItem)}</strong>. Arrastra el accesorio sobre el panel para recolocarlo.
                      </p>
                      <Segmented
                        small
                        value={mountFace}
                        options={[
                          { value: "front", label: "Frente" },
                          { value: "back", label: "Dorso" },
                        ]}
                        onChange={(value) => {
                          if (!selectedItem.mount) return;
                          mutate(mountItem(scene, selectedItem.id, selectedItem.mount.panelId, value as "front" | "back", mountU, mountV));
                        }}
                      />
                      <RangeField label="Horizontal" value={Math.round(mountU * 100)} min={5} max={95} step={1} suffix="%" onChange={(value) => handleMoveMount(selectedItem.id, value / 100, mountV)} />
                      <RangeField label="Vertical" value={Math.round(mountV * 100)} min={5} max={95} step={1} suffix="%" onChange={(value) => handleMoveMount(selectedItem.id, mountU, value / 100)} />
                      <button type="button" className="secondary-button wide" onClick={() => mutate(unmountItem(scene, selectedItem.id))}>
                        <Unlink size={15} /> Desmontar
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="alley-note">Los accesorios se cuelgan de un panel. Elige uno para montarlo.</p>
                      <SelectField
                        label="Panel"
                        value=""
                        options={panelOptions}
                        onChange={(value) => {
                          if (value) mutate(mountItem(scene, selectedItem.id, value, "front", 0.5, 0.5));
                        }}
                      />
                      {!panels.length && <p className="alley-note">Añade primero un panel slatwall, Skadis o rejilla.</p>}
                    </>
                  )}
                </section>
              )}

              {itemBom.length > 0 && (
                <section className="alley-panel">
                  <h3>Piezas necesarias</h3>
                  <ul className="alley-bom-lines">
                    {itemBom.map((line) => (
                      <li key={`${line.category}-${line.name}`}>
                        <span>{line.qty} ×</span>
                        <div>
                          <strong>{line.name}</strong>
                          {line.note && <small>{line.note}</small>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="alley-inspector-actions">
                <button type="button" className="secondary-button wide" onClick={duplicate}><Copy size={15} /> Duplicar</button>
                {selectedGroup && (
                  <>
                    <button type="button" className="secondary-button wide" onClick={selectWholeGroup}><Layers size={15} /> Seleccionar grupo</button>
                    <button type="button" className="secondary-button wide" onClick={ungroupSelected}><Ungroup size={15} /> Desagrupar</button>
                    <button type="button" className="secondary-button wide danger-text" onClick={removeGroup}><Trash2 size={15} /> Eliminar grupo</button>
                  </>
                )}
                <button type="button" className="secondary-button wide danger-text" onClick={removeSelection}><Trash2 size={15} /> Eliminar esta pieza</button>
              </div>
            </>
          )}

          {selectedJoint && (
            <>
              <div className="alley-inspector-head joint">
                <span className="alley-inspector-icon" style={{ background: `${CONNECTORS[selectedJoint.type]?.color || "#e47f9c"}44`, color: CONNECTORS[selectedJoint.type]?.color || "#e47f9c" }}>
                  <Link2 size={20} />
                </span>
                <div>
                  <span className="eyebrow">{CONNECTORS[selectedJoint.type]?.category || "Unión"}</span>
                  <h2>{CONNECTORS[selectedJoint.type]?.name || selectedJoint.type}</h2>
                  <p>{selectedJoint.ports.length} puertos · {selectedJoint.suppressed ? "oculto" : "activo"}</p>
                </div>
              </div>

              <section className="alley-panel">
                <h3>Piezas conectadas</h3>
                <div className="alley-connected-list">
                  {jointItemsList.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelection({ type: "item", ids: [item.id] })}
                    >
                      {dot(itemColor(item))}
                      <span>{itemTypeLabel(item)}</span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </section>

              <section className="alley-panel">
                <h3>Conector</h3>
                <SelectField
                  label="Tipo"
                  value={selectedJoint.type}
                  options={jointTypeOptions}
                  onChange={(value) => mutate(setJointType(scene, selectedJoint.id, value as ConnectorType))}
                  hint="Solo se muestran conectores válidos para el número y ángulo de paneles."
                />
                {CONNECTORS[selectedJoint.type]?.note && (
                  <p className="alley-note">{CONNECTORS[selectedJoint.type].note}</p>
                )}
                <Toggle
                  label="Conector activo"
                  detail={selectedJoint.suppressed ? "Oculto: no cuenta en la lista de materiales." : "Se cuenta en la lista de materiales."}
                  checked={!selectedJoint.suppressed}
                  onChange={() => mutate(toggleJointSuppressed(scene, selectedJoint.id))}
                />
                <div className="alley-readout">
                  <span>Posición</span>
                  <strong>
                    {Math.round(selectedJoint.x)}, {Math.round(selectedJoint.y)}, {Math.round(selectedJoint.z)} mm
                  </strong>
                </div>
                {CONNECTORS[selectedJoint.type]?.bomName && (
                  <div className="alley-readout">
                    <span>Pieza</span>
                    <strong>{CONNECTORS[selectedJoint.type].integrated ? "Integrada en el panel" : CONNECTORS[selectedJoint.type].bomName}</strong>
                  </div>
                )}
              </section>

              <div className="alley-inspector-actions">
                <button type="button" className="secondary-button wide" onClick={() => mutate(toggleJointSuppressed(scene, selectedJoint.id))}>
                  {selectedJoint.suppressed ? <Check size={15} /> : <Unlink size={15} />}
                  {selectedJoint.suppressed ? "Restaurar conector" : "Quitar conector"}
                </button>
                <button type="button" className="secondary-button wide" onClick={onOpenBom}><List size={15} /> Ver lista completa</button>
              </div>
            </>
          )}

          {selectedItems.length > 1 && (
            <>
              <div className="alley-inspector-head">
                <span className="eyebrow">Selección múltiple</span>
                <h2>{selectedItems.length} piezas</h2>
                <p>Muévelas juntas o conviértelas en grupo.</p>
              </div>
              <section className="alley-panel">
                <h3>Piezas seleccionadas</h3>
                <div className="alley-connected-list">
                  {selectedItems.map((item) => (
                    <button type="button" key={item.id} onClick={() => setSelection({ type: "item", ids: [item.id] })}>
                      {dot(itemColor(item))}
                      <span>{itemTypeLabel(item)}</span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="alley-panel">
                <h3>Transformar selección</h3>
                <div className="alley-inline-actions">
                  <button type="button" className="alley-small-button" onClick={() => rotate(-90)}><RotateCcw size={14} /> -90°</button>
                  <button type="button" className="alley-small-button" onClick={() => rotate(90)}><RotateCw size={14} /> +90°</button>
                </div>
                <p className="alley-note">Si las piezas pertenecen a un grupo, se moverá el grupo completo. Usa «Agrupar» para unirlas.</p>
              </section>
              <div className="alley-inspector-actions">
                <button type="button" className="secondary-button wide" onClick={groupSelected}><Group size={15} /> Agrupar</button>
                <button type="button" className="secondary-button wide" onClick={ungroupSelected}><Ungroup size={15} /> Desagrupar</button>
                <button type="button" className="secondary-button wide" onClick={duplicate}><Copy size={15} /> Duplicar</button>
                <button type="button" className="secondary-button wide danger-text" onClick={removeSelection}><Trash2 size={15} /> Eliminar</button>
              </div>
            </>
          )}
        </div>

        <div className="alley-bom-teaser">
          <div>
            <span className="eyebrow">Materiales</span>
            <strong>{bom.totalParts} piezas · {bom.parts.length + bom.integrated.length} líneas</strong>
          </div>
          <button type="button" className="primary-button" onClick={onOpenBom}>
            <List size={15} /> Ver lista
          </button>
        </div>
      </aside>
    </div>
  );
}
