import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Box,
  BoxSelect,
  Check,
  ChevronRight,
  Clipboard,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Grid2X2,
  Group,
  Hand,
  Layers,
  Link2,
  List,
  Lock,
  Maximize2,
  MousePointer2,
  Package,
  PanelTop,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Search,
  Sparkles,
  Table2,
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
  sceneTables,
} from "./geometry";
import {
  addCatalogItem,
  addGroup,
  addTable,
  clearScene,
  copySelection,
  countGroupItems,
  deleteGroup,
  deleteItems,
  duplicateSelection,
  childGroups,
  expandSelectionWithGroups,
  groupDepth,
  groupFor,
  groupSelection,
  orderedGroups,
  itemsInGroup,
  moveItems,
  moveMountedItem,
  moveTable,
  mountItem,
  pasteSelection,
  recolorItems,
  removeTable,
  resetJointType,
  rotateItems,
  sceneBom,
  selectedPanelForMount,
  setJointType,
  starterScene,
  toggleJointSuppressed,
  ungroupGroup,
  ungroupSelection,
  unmountItem,
  updateTable as updateTableInScene,
  type AlleyClipboard,
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
import AlleyViewport, { type AlleyDragPreview, type AlleyViewportHandle } from "./AlleyViewport";
import ViewCube from "./ViewCube";
import { ColorField, NumberField, RangeField, Segmented, SelectField, Toggle } from "../components/UI";
import { clamp } from "../lib/utils";

type CategoryFilter = AlleyCategory | "todos";
type AlleyTool = "select" | "marquee" | "measure" | "orbit";

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

const QUICK_ADD = [
  { kind: "item", id: "slatwall30", label: "Panel 30", icon: "▤" },
  { kind: "item", id: "wire30", label: "Rejilla 30", icon: "▥" },
  { kind: "item", id: "wireshelf30", label: "Balda 30", icon: "▤" },
  { kind: "preset", id: "organizer-shelf", label: "Estantería", icon: "🗄️" },
  { kind: "item", id: "awning30", label: "Toldo 30", icon: "⛱️" },
] as const;

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
  const clipboardRef = useRef<AlleyClipboard | null>(null);
  const pasteCountRef = useRef(0);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selection, setSelection] = useState<AlleySelection | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<AlleyDragPreview | null>(null);
  const [tool, setTool] = useState<AlleyTool>("select");
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
  const explicitGroup = groupFor(scene, selectedGroupId || undefined);
  const explicitGroupItems = explicitGroup ? itemsInGroup(scene, explicitGroup.id) : [];
  const explicitGroupSelected =
    Boolean(explicitGroup) &&
    selectedItems.length === explicitGroupItems.length &&
    explicitGroupItems.every((item) => selectedItems.some((selected) => selected.id === item.id));
  const selectedGroup =
    (explicitGroupSelected ? explicitGroup : undefined) ||
    (selectedItems.length === 1 && selectedItem?.groupId ? groupFor(scene, selectedItem.groupId) : undefined);
  const selectedGroupItems = selectedGroup ? itemsInGroup(scene, selectedGroup.id) : [];
  const selectionColor = selectedItems.length ? itemColor(selectedItems[0]) : "#f3c7d4";
  const selectionHasMixedColor = selectedItems.some((item) => itemColor(item) !== selectionColor);
  const selectedPanel = selectedPanelForMount(scene, selection);
  const bom = useMemo(() => sceneBom(scene), [scene]);
  const activeJoints = scene.joints.filter((joint) => !joint.suppressed).length;
  const panels = scene.items.filter((item) => catalogFor(item).category === "paneles");
  const tables = sceneTables(scene);
  const selectedTable = tables.find((table) => table.id === selectedTableId) || tables[0];
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
    const visible = GROUPS.filter((group) => !group.hidden);
    const needle = query.trim().toLowerCase();
    if (!needle) return visible;
    return visible.filter((group) => [group.name, group.description].join(" ").toLowerCase().includes(needle));
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

  useEffect(() => {
    if (!tables.some((table) => table.id === selectedTableId)) setSelectedTableId(tables[0]?.id || null);
  }, [selectedTableId, tables]);

  /** Position fields move the whole group; mounted accessories stay on their panel. */
  const moveSelectedTo = useCallback(
    (axis: "x" | "y" | "z", value: number) => {
      if (!selectedItem) return;
      const ids = selectedItem.groupId ? expandSelectionWithGroups(scene, [selectedItem.id]) : [selectedItem.id];
      const dx = axis === "x" ? value - selectedItem.x : 0;
      const dy = axis === "y" ? value - selectedItem.y : 0;
      const dz = axis === "z" ? value - selectedItem.baseZ : 0;
      if (!dx && !dy && !dz) return;
      mutate(moveItems(scene, ids, dx, dy, dz));
    },
    [mutate, scene, selectedItem],
  );

  /** Rotation fields rotate around the group pivot, matching the R/E shortcuts. */
  const rotateSelectedTo = useCallback(
    (value: number) => {
      if (!selectedItem) return;
      const delta = value - selectedItem.rotation;
      if (!delta) return;
      mutate(rotateItems(scene, [selectedItem.id], delta));
    },
    [mutate, scene, selectedItem],
  );

  const recolorSelected = useCallback(
    (value: string) => {
      if (!selection || selection.type === "joint") return;
      mutate(recolorItems(scene, selection.ids, value));
    },
    [mutate, scene, selection],
  );

  const patchTable = useCallback(
    (tableId: string, patch: Partial<AlleyScene["table"]>) => {
      mutate(updateTableInScene(scene, tableId, patch));
    },
    [mutate, scene],
  );

  const addTableToScene = useCallback(
    (layout: "straight" | "l") => {
      const result = addTable(scene, layout);
      mutate(result.scene);
      setSelectedTableId(result.tableId);
      onToast(layout === "l" ? "Mesa en L añadida. Las dos mesas comparten altura." : "Mesa añadida en línea.");
      window.setTimeout(() => viewportRef.current?.fit(), 60);
    },
    [mutate, onToast, scene],
  );

  const removeTableFromScene = useCallback(
    (tableId: string) => {
      if (tables.length <= 1) {
        onToast("Necesitas al menos una mesa de trabajo.");
        return;
      }
      const next = removeTable(scene, tableId);
      mutate(next);
      setSelectedTableId(sceneTables(next)[0]?.id || null);
      onToast("Mesa quitada. Las piezas se mantienen en la escena.");
    },
    [mutate, onToast, scene, tables.length],
  );

  const addItem = useCallback(
    (type: string) => {
      const catalog = CATALOG_BY_TYPE[type];
      if (!catalog) return;
      const isAwning = type.startsWith("awning");
      const hostPanel = isAwning ? selectedPanel : undefined;
      const result = addCatalogItem(scene, type, { panelId: selectedPanel?.id });
      mutate(result.scene);
      setSelectedGroupId(null);
      setSelection({ type: "item", ids: [result.itemId] });
      setPendingPort(null);
      if (!result.created) {
        onToast(`${catalog.name}: ya había una pieza igual, se ha reutilizado.`);
        return;
      }
      const added = result.scene.items.find((item) => item.id === result.itemId);
      const awningAnchored =
        Boolean(added) &&
        result.scene.joints.some(
          (joint) => joint.type === "awning-foot" && joint.ports.some((port) => port.itemId === added!.id),
        );
      if (added?.mount) {
        const panel = result.scene.items.find((item) => item.id === added.mount?.panelId);
        onToast(`${catalog.name} montado en ${panel ? itemTypeLabel(panel) : "el panel"}.`);
      } else if (isAwning && hostPanel && awningAnchored) {
        onToast(`${catalog.name} anclado en la parte superior de ${itemTypeLabel(hostPanel)}.`);
      } else if (isAwning && hostPanel) {
        onToast(
          `${catalog.name} colocado sobre ${itemTypeLabel(hostPanel)}, pero sus anclajes no coinciden. Usa un panel del mismo ancho.`,
        );
      } else if (isAwning) {
        onToast(`${catalog.name} añadido. Selecciona un panel y vuelve a añadirlo para anclarlo.`);
      } else if (catalog.mountable) {
        onToast(`${catalog.name} colocado en la mesa. Añade un panel para montarlo.`);
      } else {
        onToast(`${catalog.name} añadido. Arrástralo o conéctalo por las esferas.`);
      }
    },
    [mutate, onToast, scene, selectedPanel],
  );

  const addPreset = useCallback(
    (presetId: string) => {
      const preset = GROUPS.find((group) => group.id === presetId);
      const result = addGroup(scene, presetId);
      if (!result.created) {
        onToast("Ese grupo ya está completo en la escena; no se ha duplicado.");
        return;
      }
      mutate(result.scene);
      setSelectedGroupId(null);
      const first = result.scene.items.find((item) => item.groupId === result.groupId);
      if (preset?.tables?.length) {
        setSelection(null);
        setSelectedTableId(result.scene.tables?.[0]?.id || null);
      } else if (first) {
        setSelection({ type: "item", ids: [first.id] });
      }
      setPendingPort(null);
      const tableNote = preset?.tables?.length ? ` y ${preset.tables.length} mesas en L` : "";
      onToast(`Grupo añadido: ${result.created} pieza${result.created === 1 ? "" : "s"}${tableNote}.`);
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
    setSelectedGroupId(null);
    setSelection({ type: result.ids.length > 1 ? "items" : "item", ids: result.ids });
    onToast(`Copia creada (${result.ids.length} pieza${result.ids.length === 1 ? "" : "s"}).`);
  }, [mutate, onToast, scene, selection]);

  const copy = useCallback(() => {
    if (!selection || selection.type === "joint") {
      onToast("Selecciona una o varias piezas para copiarlas.");
      return;
    }
    const clipboard = copySelection(scene, selection.ids);
    if (!clipboard) {
      onToast("No hay piezas que copiar.");
      return;
    }
    clipboardRef.current = clipboard;
    pasteCountRef.current = 0;
    onToast(`${clipboard.items.length} pieza${clipboard.items.length === 1 ? "" : "s"} copiada${clipboard.items.length === 1 ? "" : "s"}. Pega con Ctrl+V.`);
  }, [onToast, scene, selection]);

  const paste = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard) {
      onToast("El portapapeles está vacío. Copia una pieza con Ctrl+C.");
      return;
    }
    pasteCountRef.current += 1;
    const result = pasteSelection(scene, clipboard, 60 * pasteCountRef.current);
    if (!result.ids.length) {
      onToast("La copia caía sobre una pieza existente; no se ha pegado.");
      return;
    }
    mutate(result.scene);
    setSelectedGroupId(null);
    setSelection({ type: result.ids.length > 1 ? "items" : "item", ids: result.ids });
    onToast(`${result.ids.length} pieza${result.ids.length === 1 ? "" : "s"} pegada${result.ids.length === 1 ? "" : "s"}.`);
  }, [mutate, onToast, scene]);

  const selectAll = useCallback(() => {
    if (!scene.items.length) {
      onToast("La mesa está vacía.");
      return;
    }
    setSelectedGroupId(null);
    setSelection({ type: "items", ids: scene.items.map((item) => item.id) });
    onToast(`${scene.items.length} piezas seleccionadas. Arrastra una para moverlas juntas.`);
  }, [onToast, scene.items]);

  const nudge = useCallback(
    (dx: number, dy: number, dz = 0) => {
      if (!selection || selection.type === "joint") return;
      const ids = expandSelectionWithGroups(scene, selection.ids);
      mutate(moveItems(scene, ids, dx, dy, dz));
    },
    [mutate, scene, selection],
  );

  const fitView = useCallback(() => {
    viewportRef.current?.fit();
  }, []);

  const removeSelection = useCallback(() => {
    if (!selection) return;
    if (selection.type === "joint") {
      mutate(toggleJointSuppressed(scene, selection.ids[0]));
      onToast("Conector oculto. La pieza sigue en su sitio y puedes restaurarlo.");
      return;
    }
    const removed = selection.ids.length;
    mutate(deleteItems(scene, selection.ids));
    setSelectedGroupId(null);
    setSelection(null);
    setPendingPort(null);
    onToast(`${removed === 1 ? "Pieza eliminada" : `${removed} piezas eliminadas`}. El resto del puesto sigue en pie.`);
  }, [mutate, onToast, scene, selection]);

  const removeGroup = useCallback(() => {
    if (!selectedGroup) return;
    const count = countGroupItems(scene, selectedGroup.id);
    mutate(deleteGroup(scene, selectedGroup.id));
    setSelectedGroupId(null);
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
    if (!result.groupId) {
      onToast("No hay piezas o grupos completos que agrupar.");
      return;
    }
    mutate(result.scene);
    setSelectedGroupId(result.groupId);
    setSelection({ type: "items", ids });
    const group = result.scene.groups.find((entry) => entry.id === result.groupId);
    onToast(`Grupo "${group?.name || "nuevo"}" creado. Puede contener piezas y subgrupos.`);
  }, [mutate, onToast, scene, selectedItems]);

  const ungroupSelected = useCallback(() => {
    if (selectedGroup) {
      const childCount = childGroups(scene, selectedGroup.id).length;
      mutate(ungroupGroup(scene, selectedGroup.id));
      setSelectedGroupId(null);
      setSelection(null);
      onToast(
        `Grupo "${selectedGroup.name}" desagrupado un nivel${childCount ? `; sus ${childCount} subgrupos se mantienen` : ""}.`,
      );
      return;
    }
    if (!selectedItems.length) return;
    mutate(ungroupSelection(scene, selectedItems.map((item) => item.id)));
    onToast("Piezas desagrupadas. Ahora puedes moverlas por separado.");
  }, [mutate, onToast, scene, selectedGroup, selectedItems]);

  const selectWholeGroup = useCallback(() => {
    if (!selectedGroup) return;
    setSelectedGroupId(selectedGroup.id);
    setSelection({ type: "items", ids: selectedGroupItems.map((item) => item.id) });
    onToast(`Grupo "${selectedGroup.name}" seleccionado (${selectedGroupItems.length} piezas).`);
  }, [onToast, selectedGroup, selectedGroupItems]);

  const handlePortClick = useCallback(
    (port: PortRef) => {
      const item = scene.items.find((candidate) => candidate.id === port.itemId);
      if (!item) return;
      if (!pendingPort) {
        setPendingPort(port);
        setSelectedGroupId(null);
        setSelection({ type: "item", ids: [item.id] });
        onToast("Origen elegido. Toca una esfera rosa compatible para conectar, o Esc para cancelar.");
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
        onToast("Esas esferas no comparten sistema: prueba una esfera rosa compatible.");
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
        setSelectedGroupId(null);
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

  const handleTableSelect = useCallback(
    (tableId: string) => {
      setSelectedTableId(tableId);
      setSelectedGroupId(null);
      setSelection(null);
      setPendingPort(null);
      const table = sceneTables(scene).find((candidate) => candidate.id === tableId);
      onToast(
        table?.locked
          ? `Mesa "${table.name}" seleccionada. Está bloqueada.`
          : `Mesa "${table?.name || "principal"}" seleccionada. Arrastra desde el tablero para moverla.`,
      );
    },
    [onToast, scene],
  );

  const handleMoveTable = useCallback(
    (tableId: string, dx: number, dy: number) => {
      mutate(moveTable(scene, tableId, dx, dy));
    },
    [mutate, scene],
  );

  const loadExample = useCallback(() => {
    mutate(starterScene());
    setSelectedGroupId(null);
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
    setSelectedGroupId(null);
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
      const key = event.key.toLowerCase();
      if (mod && key === "c") {
        if (window.getSelection()?.toString().trim()) return;
        event.preventDefault();
        copy();
        return;
      }
      if (mod && key === "v") {
        event.preventDefault();
        paste();
        return;
      }
      if (mod && key === "a") {
        event.preventDefault();
        selectAll();
        return;
      }
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
      if (mod && key === "d") {
        event.preventDefault();
        duplicate();
        return;
      }
      if (mod && key === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelection();
        return;
      }
      if (key === "r") {
        event.preventDefault();
        rotate(event.shiftKey ? -90 : 90);
        return;
      }
      if (key === "q") {
        event.preventDefault();
        rotate(-90);
        return;
      }
      if (key === "e") {
        event.preventDefault();
        rotate(90);
        return;
      }
      if (key === "g" && !mod) {
        event.preventDefault();
        groupSelected();
        return;
      }
      if (key === "f") {
        event.preventDefault();
        fitView();
        return;
      }
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        const step = event.shiftKey ? 100 : 50;
        nudge(0, 0, event.key === "PageUp" ? step : -step);
        return;
      }
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 50 : 10;
        if (event.ctrlKey || event.metaKey) {
          if (event.key === "ArrowUp") nudge(0, 0, step);
          else if (event.key === "ArrowDown") nudge(0, 0, -step);
          return;
        }
        if (event.key === "ArrowLeft") nudge(-step, 0);
        else if (event.key === "ArrowRight") nudge(step, 0);
        else if (event.key === "ArrowUp") nudge(0, step);
        else if (event.key === "ArrowDown") nudge(0, -step);
        return;
      }
      if (!mod && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        setTool(event.key === "1" ? "select" : event.key === "2" ? "marquee" : event.key === "3" ? "measure" : "orbit");
        return;
      }
      if (event.key === "Escape") {
        setSelectedGroupId(null);
        setSelection(null);
        setPendingPort(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    copy,
    duplicate,
    fitView,
    groupSelected,
    nudge,
    onRedo,
    onUndo,
    paste,
    removeSelection,
    rotate,
    selectAll,
    ungroupSelected,
  ]);

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

        {category !== "grupos" && (
          <div className="alley-quick-add">
            <span className="alley-field-label">Añadir rápido</span>
            <div className="alley-quick-add-row">
              {QUICK_ADD.map((entry) => {
                const item = entry.kind === "item" ? CATALOG_BY_TYPE[entry.id] : undefined;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => (entry.kind === "item" ? addItem(entry.id) : addPreset(entry.id))}
                    title={
                      entry.kind === "item"
                        ? item?.name
                        : "Dos organizadores laterales, uno a cada lado, y cuatro baldas"
                    }
                  >
                    <span>{entry.icon}</span>
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
            <button
              type="button"
              className="alley-tool"
              onClick={() => {
                setSelectedGroupId(null);
                setSelection(null);
              }}
              title="Quitar selección"
            >
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
            <button
              type="button"
              className={`alley-tool ${tool === "select" ? "active" : ""}`}
              onClick={() => setTool("select")}
              title="Seleccionar y mover piezas"
            >
              <MousePointer2 size={16} />
            </button>
            <button
              type="button"
              className={`alley-tool ${tool === "marquee" ? "active" : ""}`}
              onClick={() => setTool("marquee")}
              title="Selección por rectángulo"
            >
              <BoxSelect size={16} />
            </button>
            <button
              type="button"
              className={`alley-tool ${tool === "measure" ? "active" : ""}`}
              onClick={() => setTool("measure")}
              title="Medir distancias sobre la mesa"
            >
              <Ruler size={16} />
            </button>
            <button
              type="button"
              className={`alley-tool ${tool === "orbit" ? "active" : ""}`}
              onClick={() => setTool("orbit")}
              title="Orbitar sin seleccionar"
            >
              <Hand size={16} />
            </button>
          </div>
          <div className="alley-tool-group">
            <button type="button" className="alley-tool" onClick={() => rotate(-90)} title="Girar -90° (Q o Mayús+R)">
              <RotateCcw size={16} />
              <span className="alley-tool-mini">-90</span>
            </button>
            <button type="button" className="alley-tool" onClick={() => rotate(90)} title="Girar +90° (E o R)">
              <RotateCw size={16} />
              <span className="alley-tool-mini">+90</span>
            </button>
            <button type="button" className="alley-tool" onClick={copy} title="Copiar (Ctrl+C)">
              <Clipboard size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={paste} title="Pegar (Ctrl+V)">
              <ClipboardPaste size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={duplicate} title="Duplicar (Ctrl+D)">
              <Copy size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={groupSelected} title="Agrupar (G o Ctrl+G)">
              <Group size={16} />
            </button>
            <button type="button" className="alley-tool" onClick={ungroupSelected} title="Desagrupar (Ctrl+Mayús+G)">
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
            <button type="button" className="alley-tool" onClick={fitView} title="Encuadrar todo (F)">
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
              title="Mostrar esferas al seleccionar una pieza"
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
            tool={tool}
            onSelect={(next) => {
              setSelectedGroupId(null);
              setSelection(next);
              if (next?.type === "joint") setPendingPort(null);
            }}
            onPortClick={handlePortClick}
            onMoveItems={handleMoveItems}
            onMoveMount={handleMoveMount}
            onTableSelect={handleTableSelect}
            onMoveTable={handleMoveTable}
            onDragPreview={setDragPreview}
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
          {selectedItems.length > 0 && (
            <div className="alley-selection-dock">
              <strong>
                {selectedItems.length} pieza{selectedItems.length === 1 ? "" : "s"}
              </strong>
              <div className="alley-dock-actions">
                <button type="button" onClick={() => rotate(-90)} title="Girar -90° (Q)">
                  <RotateCcw size={15} />
                </button>
                <button type="button" onClick={() => rotate(90)} title="Girar +90° (E)">
                  <RotateCw size={15} />
                </button>
                <button type="button" onClick={() => nudge(0, 0, 50)} title="Subir 5 cm (PageUp)">
                  <ArrowUp size={15} />
                </button>
                <button type="button" onClick={() => nudge(0, 0, -50)} title="Bajar 5 cm (PageDown)">
                  <ArrowDown size={15} />
                </button>
                <button type="button" onClick={copy} title="Copiar (Ctrl+C)">
                  <Clipboard size={15} />
                </button>
                <button type="button" onClick={paste} title="Pegar (Ctrl+V)">
                  <ClipboardPaste size={15} />
                </button>
                <button type="button" onClick={duplicate} title="Duplicar (Ctrl+D)">
                  <Copy size={15} />
                </button>
                <button type="button" onClick={groupSelected} disabled={selectedItems.length < 2} title="Agrupar (Ctrl+G)">
                  <Group size={15} />
                </button>
                <button type="button" className="danger" onClick={removeSelection} title="Eliminar (Supr)">
                  <Trash2 size={15} />
                </button>
              </div>
              <span className="alley-dock-hint">Arrastra para mover todo · flechas para ajustar</span>
            </div>
          )}
          {dragPreview && (
            <div className="alley-drag-preview">
              <Link2 size={15} />
              <span>
                Se unirá a <strong>{dragPreview.targetName}</strong>
                {dragPreview.panelCount > 2 ? ` y ${dragPreview.panelCount - 1} pieza${dragPreview.panelCount === 3 ? "" : "s"} más` : ""}
              </span>
              <span className="muted">· {dragPreview.connectorName}</span>
            </div>
          )}
          {pendingPort && (
            <div className="alley-pending">
              <Link2 size={15} />
              <span>
                Conectando desde <strong>{pendingItem ? itemTypeLabel(pendingItem) : "una pieza"}</strong>. Toca una esfera rosa compatible.
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
            {tables.length} mesa{tables.length === 1 ? "" : "s"} · {selectedTable.width / 10} × {selectedTable.depth / 10} cm · {projectName}
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
                <h3>Mesas de trabajo <span className="alley-count small">{tables.length}</span></h3>
                <div className="alley-table-tabs">
                  {tables.map((table, index) => (
                    <button
                      type="button"
                      key={table.id}
                      className={selectedTable.id === table.id ? "active" : ""}
                      onClick={() => setSelectedTableId(table.id)}
                      title={table.locked ? "Mesa bloqueada" : "Mesa desbloqueada; arrástrala en el visor"}
                    >
                      <Table2 size={13} />
                      {table.locked && <Lock size={12} />}
                      <span>{table.name || `Mesa ${index + 1}`}</span>
                      <small>{table.width / 10} × {table.depth / 10}</small>
                    </button>
                  ))}
                </div>
                <div className="alley-inline-actions">
                  <button type="button" className="alley-small-button" onClick={() => addTableToScene("straight")}>
                    <Plus size={14} /> Mesa recta
                  </button>
                  <button type="button" className="alley-small-button" onClick={() => addTableToScene("l")}>
                    <Table2 size={14} /> Mesa en L
                  </button>
                  {tables.length > 1 && (
                    <button
                      type="button"
                      className="alley-small-button danger-text"
                      onClick={() => removeTableFromScene(selectedTable.id)}
                    >
                      <Trash2 size={14} /> Quitar
                    </button>
                  )}
                </div>
                <div className="alley-field-grid">
                  <NumberField label="Ancho" value={selectedTable.width} min={600} max={5000} step={50} suffix="mm" onChange={(value) => patchTable(selectedTable.id, { width: value })} />
                  <NumberField label="Fondo" value={selectedTable.depth} min={400} max={2500} step={50} suffix="mm" onChange={(value) => patchTable(selectedTable.id, { depth: value })} />
                  <NumberField label="Alto común" value={selectedTable.height} min={0} max={1200} step={25} suffix="mm" onChange={(value) => patchTable(selectedTable.id, { height: value })} />
                  <NumberField label="Rejilla" value={scene.grid} min={10} max={200} step={10} suffix="mm" onChange={(value) => mutate({ ...scene, grid: value })} />
                </div>
                <ColorField label="Color de la mesa" value={selectedTable.color} onChange={(value) => patchTable(selectedTable.id, { color: value })} />
                <Toggle
                  label="Bloquear mesa"
                  detail={
                    selectedTable.locked
                      ? "La mesa y su posición quedan fijas; las piezas se pueden seguir editando."
                      : "Puedes arrastrar la mesa con el cursor para colocarla donde quieras."
                  }
                  checked={Boolean(selectedTable.locked)}
                  onChange={(value) => patchTable(selectedTable.id, { locked: value })}
                />
                <p className="alley-note">
                  Arrastra la mesa desde una zona libre del tablero para moverla con todo lo que tiene encima. Usa el
                  bloqueo cuando ya esté en su sitio. Las mesas comparten altura para que las piezas apoyen bien.
                </p>
              </section>

              <section className="alley-panel">
                <h3>Leyenda de conexiones</h3>
                <div className="alley-legend">
                  <span><i className="pink-free" /> Puerto libre</span>
                  <span><i className="pink-connected" /> Ya conectado</span>
                  <span><i className="pink-origin" /> Origen elegido</span>
                  <span><i className="pink-target" /> Destino compatible</span>
                </div>
                <p className="alley-note">
                  Las esferas aparecen al seleccionar una pieza. Toca una y luego otra compatible para acercar las piezas
                  y crear la unión.
                </p>
              </section>

              <section className="alley-panel">
                <h3>Atajos</h3>
                <div className="alley-shortcuts">
                  <span><kbd>R</kbd>/<kbd>E</kbd> girar +90°</span>
                  <span><kbd>Q</kbd> girar -90°</span>
                  <span><kbd>Mayús</kbd>+<kbd>clic</kbd> multiselección</span>
                  <span><kbd>1</kbd>-<kbd>4</kbd> herramientas</span>
                  <span><kbd>2</kbd> rectángulo</span>
                  <span><kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copiar y pegar</span>
                  <span><kbd>Ctrl</kbd>+<kbd>A</kbd> seleccionar todo</span>
                  <span><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicar</span>
                  <span><kbd>G</kbd>/<kbd>Ctrl</kbd>+<kbd>G</kbd> agrupar</span>
                  <span><kbd>↑↓←→</kbd> mover 1 cm</span>
                  <span><kbd>Ctrl</kbd>+<kbd>↑↓</kbd> subir/bajar 1 cm</span>
                  <span><kbd>PgUp</kbd>/<kbd>PgDn</kbd> subir/bajar 5 cm</span>
                  <span>Arrastra la mesa para moverla</span>
                  <span><kbd>F</kbd> encuadrar</span>
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
              <p className="alley-note">{catalogFor(selectedItem).description}</p>

              {selectedGroup && (
                <div className="alley-group-banner">
                  <Layers size={15} />
                  <div>
                    <strong>{selectedGroup.name}</strong>
                    <small>
                      {selectedGroupItems.length} piezas se mueven y giran juntas
                      {childGroups(scene, selectedGroup.id).length
                        ? ` · ${childGroups(scene, selectedGroup.id).length} subgrupos`
                        : ""}
                    </small>
                  </div>
                  <button type="button" onClick={selectWholeGroup}>Seleccionar</button>
                </div>
              )}

              <section className="alley-panel">
                <h3>Transformar</h3>
                {selectedItem.mount ? (
                  <p className="alley-note">
                    Está montado en un panel. Usa los controles de <strong>Montaje en panel</strong> para moverlo; el panel
                    y el grupo se mueven juntos.
                  </p>
                ) : (
                  <div className="alley-field-grid three">
                    <NumberField label="X" value={Math.round(selectedItem.x)} min={-3000} max={3000} step={10} suffix="mm" onChange={(value) => moveSelectedTo("x", value)} />
                    <NumberField label="Y" value={Math.round(selectedItem.y)} min={-3000} max={3000} step={10} suffix="mm" onChange={(value) => moveSelectedTo("y", value)} />
                    <NumberField label="Altura" value={Math.round(selectedItem.baseZ)} min={0} max={3000} step={10} suffix="mm" onChange={(value) => moveSelectedTo("z", value)} />
                  </div>
                )}
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
                    onChange={(value) => rotateSelectedTo(Number(value))}
                  />
                </div>
                <NumberField label="Ángulo fino" value={Math.round(selectedItem.rotation)} min={0} max={359} step={5} suffix="°" onChange={(value) => rotateSelectedTo(value)} />
                <div className="alley-inline-actions alley-rotation-actions">
                  <button type="button" className="alley-small-button" onClick={() => rotate(-90)}><RotateCcw size={14} /> Girar -90°</button>
                  <button type="button" className="alley-small-button" onClick={() => rotate(90)}><RotateCw size={14} /> Girar +90°</button>
                </div>
                <p className="alley-note">
                  Atajos: R o E para girar +90°, Q para -90°, PageUp/PageDown para subir o bajar 5 cm. Si la pieza
                  pertenece a un grupo, estos campos mueven o giran el grupo completo.
                </p>
              </section>

              <section className="alley-panel">
                <h3>Color</h3>
                <ColorField label="Acabado" value={itemColor(selectedItem)} onChange={(value) => recolorSelected(value)} />
                <div className="alley-swatches">
                  {PALETTE.map((color) => (
                    <button
                      type="button"
                      key={color}
                      style={{ background: color }}
                      className={itemColor(selectedItem) === color ? "active" : ""}
                      onClick={() => recolorSelected(color)}
                      aria-label={`Color ${color}`}
                    />
                  ))}
                </div>
                <p className="alley-note">
                  {selectedGroup
                    ? `El color se aplica a todo el grupo: ${selectedGroupItems.length} piezas.`
                    : "El color se aplica a esta pieza."}
                </p>
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
                <button type="button" className="secondary-button wide" onClick={copy}><Clipboard size={15} /> Copiar</button>
                <button type="button" className="secondary-button wide" onClick={paste}><ClipboardPaste size={15} /> Pegar</button>
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
                      onClick={() => {
                        setSelectedGroupId(null);
                        setSelection({ type: "item", ids: [item.id] });
                      }}
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
                  hint="Solo aparecen los conectores reales que encajan con esta unión."
                />
                <p className="alley-note">
                  {selectedJoint.manual
                    ? "Conector elegido manualmente. Se mantiene al mover las piezas mientras siga siendo válido."
                    : "Conector automático: se adapta a la geometría de la unión."}
                </p>
                {selectedJoint.manual && (
                  <button
                    type="button"
                    className="secondary-button wide"
                    onClick={() => mutate(resetJointType(scene, selectedJoint.id))}
                  >
                    <Sparkles size={15} /> Volver a automático
                  </button>
                )}
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
              {selectedGroup && (
                <div className="alley-group-banner">
                  <Layers size={15} />
                  <div>
                    <strong>{selectedGroup.name}</strong>
                    <small>
                      Grupo seleccionado · {selectedGroupItems.length} piezas
                      {childGroups(scene, selectedGroup.id).length
                        ? ` · ${childGroups(scene, selectedGroup.id).length} subgrupos`
                        : ""}
                    </small>
                  </div>
                  <button type="button" onClick={ungroupSelected}>Desagrupar</button>
                </div>
              )}
              <section className="alley-panel">
                <h3>Piezas seleccionadas</h3>
                <div className="alley-connected-list">
                  {selectedItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setSelectedGroupId(null);
                        setSelection({ type: "item", ids: [item.id] });
                      }}
                    >
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
                  <button type="button" className="alley-small-button" onClick={() => rotate(-90)}><RotateCcw size={14} /> Girar -90°</button>
                  <button type="button" className="alley-small-button" onClick={() => rotate(90)}><RotateCw size={14} /> Girar +90°</button>
                </div>
                <div className="alley-inline-actions">
                  <button type="button" className="alley-small-button" onClick={() => nudge(0, 0, 50)}><ArrowUp size={14} /> Subir 5 cm</button>
                  <button type="button" className="alley-small-button" onClick={() => nudge(0, 0, -50)}><ArrowDown size={14} /> Bajar 5 cm</button>
                </div>
                <div className="alley-inline-actions">
                  <button type="button" className="alley-small-button" onClick={copy}><Clipboard size={14} /> Copiar</button>
                  <button type="button" className="alley-small-button" onClick={paste}><ClipboardPaste size={14} /> Pegar</button>
                </div>
                <p className="alley-note">
                  Arrastra cualquier pieza seleccionada para mover todo el conjunto. Las flechas ajustan 1 cm; con
                  Mayús, 5 cm. Si las piezas pertenecen a un grupo, se moverá el grupo completo.
                </p>
              </section>
              <section className="alley-panel">
                <h3>Color de la selección</h3>
                <ColorField label="Acabado" value={selectionColor} onChange={(value) => recolorSelected(value)} />
                <div className="alley-swatches">
                  {PALETTE.map((color) => (
                    <button
                      type="button"
                      key={color}
                      style={{ background: color }}
                      className={!selectionHasMixedColor && selectionColor === color ? "active" : ""}
                      onClick={() => recolorSelected(color)}
                      aria-label={`Color ${color}`}
                    />
                  ))}
                </div>
                <p className="alley-note">
                  {selectionHasMixedColor
                    ? "La selección tiene varios colores. Elige uno para aplicarlo a todas las piezas y a sus grupos completos."
                    : "El color se aplica a todas las piezas seleccionadas y a sus grupos completos."}
                </p>
              </section>
              <div className="alley-inspector-actions">
                <button type="button" className="secondary-button wide" onClick={groupSelected}><Group size={15} /> Agrupar</button>
                <button type="button" className="secondary-button wide" onClick={ungroupSelected}><Ungroup size={15} /> Desagrupar</button>
                <button type="button" className="secondary-button wide" onClick={duplicate}><Copy size={15} /> Duplicar</button>
                <button type="button" className="secondary-button wide danger-text" onClick={removeSelection}><Trash2 size={15} /> Eliminar</button>
              </div>
            </>
          )}

          {scene.groups.length > 0 && (
            <section className="alley-panel">
              <h3>Tus grupos</h3>
              <div className="alley-group-rows">
                {orderedGroups(scene).map((group) => {
                  const count = countGroupItems(scene, group.id);
                  const children = childGroups(scene, group.id).length;
                  const depth = groupDepth(scene, group.id);
                  return (
                    <div
                      className="alley-group-row"
                      key={group.id}
                      style={{ paddingLeft: `${Math.min(depth, 5) * 14}px` }}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          const items = itemsInGroup(scene, group.id);
                          const ids = items.map((item) => item.id);
                          if (event.shiftKey && selection && selection.type !== "joint") {
                            setSelectedGroupId(null);
                            const merged = Array.from(new Set([...selection.ids, ...ids]));
                            setSelection({ type: merged.length > 1 ? "items" : "item", ids: merged });
                            return;
                          }
                          setSelectedGroupId(group.id);
                          setSelection({ type: items.length > 1 ? "items" : "item", ids });
                        }}
                      >
                        <Layers size={14} />
                        <span>
                          <strong>
                            {depth ? "↳ " : ""}
                            {group.name}
                          </strong>
                          <small>
                            {count} pieza{count === 1 ? "" : "s"}
                            {children ? ` · ${children} subgrupo${children === 1 ? "" : "s"}` : ""}
                          </small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="alley-icon-danger"
                        title="Eliminar grupo"
                        onClick={() => {
                          if (!window.confirm(`¿Eliminar "${group.name}" y sus ${count} piezas?`)) return;
                          mutate(deleteGroup(scene, group.id));
                          setSelectedGroupId(null);
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
              {scene.groups.length > 1 && (
                <p className="alley-note">
                  Mayús + clic en varios grupos para seleccionarlos juntos y crear un grupo padre. Al desagrupar solo se
                  separa un nivel.
                </p>
              )}
            </section>
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
