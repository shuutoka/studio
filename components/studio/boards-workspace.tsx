"use client";

import {
  useMemo, useRef, useState, type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown, ArrowUp, BoxSelect, Cable, ChevronDown, CirclePlus, Copy, Edit3,
  FileImage, FolderPlus, GitFork, Grip, History, ImagePlus, LayoutGrid,
  ListTree, Moon, MousePointer2, Network, Plus, Redo2, Settings2, Sun, Trash2,
  Undo2, Users, Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { MediaPreview } from "@/components/studio/media-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createEmptyBoard, createId, type BoardNodeKind, type BoardTheme, type BoardType,
  type StudioBoard, type StudioBoardEdge, type StudioBoardNode, type StudioBoardSnapshot,
  type StudioMedia, type StudioProject,
} from "@/lib/studio";

type BoardTool = "select" | "pan" | "connect" | "delete";
type CreateDialogState = { mode: "create" | "duplicate"; type: BoardType } | null;

const canvasWidth = 2400;
const canvasHeight = 1600;

function snapshotBoard(board: StudioBoard): StudioBoardSnapshot {
  return structuredClone({
    name: board.name,
    description: board.description,
    theme: board.theme,
    cardColor: board.cardColor,
    bannerMediaId: board.bannerMediaId,
    folderId: board.folderId,
    nodes: board.nodes,
    edges: board.edges,
  });
}

function applySnapshot(board: StudioBoard, snapshot: StudioBoardSnapshot) {
  board.name = snapshot.name;
  board.description = snapshot.description;
  board.theme = snapshot.theme;
  board.cardColor = snapshot.cardColor;
  board.bannerMediaId = snapshot.bannerMediaId;
  board.folderId = snapshot.folderId;
  board.nodes = structuredClone(snapshot.nodes);
  board.edges = structuredClone(snapshot.edges);
}

function nodeSize(board: StudioBoard, node: StudioBoardNode) {
  if (board.type !== "relationship") return { width: node.width, height: node.height };
  const degree = board.edges.filter((edge) => edge.sourceId === node.id || edge.targetId === node.id).length;
  const size = Math.min(260, 142 + degree * 18);
  return { width: size, height: size };
}

function newNode(kind: BoardNodeKind, index: number): StudioBoardNode {
  const group = kind === "group";
  return {
    id: createId("board-node"),
    kind,
    x: 140 + (index % 4) * 290,
    y: 130 + Math.floor(index / 4) * 230,
    width: group ? 420 : kind === "character" ? 220 : 240,
    height: group ? 280 : kind === "character" ? 150 : 170,
    title: kind === "character" ? "Personnage" : group ? "Groupe d’évènements" : kind === "image" ? "Image" : "Nouvel évènement",
    text: "",
    color: kind === "group" ? "#31283d" : "#26222d",
    imageId: null,
    characterId: null,
    characterIds: [],
  };
}

export function BoardsWorkspace({
  project, updateProject, uploadMedia, onOpenCharacter,
}: {
  project: StudioProject;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
  uploadMedia: (files: File[], kind: StudioMedia["kind"]) => Promise<string[]>;
  onOpenCharacter: (characterId: string) => void;
}) {
  const orderedBoards = useMemo(
    () => [...project.boards].sort((a, b) => a.order - b.order),
    [project.boards],
  );
  const [activeBoardId, setActiveBoardId] = useState<string | null>(orderedBoards[0]?.id ?? null);
  const [tool, setTool] = useState<BoardTool>("select");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<StudioBoardSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<StudioBoardSnapshot[]>([]);
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(null);
  const [createName, setCreateName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [quickOptionsOpen, setQuickOptionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<"new-image" | "banner" | string>("new-image");

  const board = project.boards.find((candidate) => candidate.id === activeBoardId) ?? orderedBoards[0] ?? null;
  const selectedNode = board?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = board?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  function selectBoard(id: string | null) {
    setActiveBoardId(id);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectionSource(null);
    setUndoStack([]);
    setRedoStack([]);
  }

  function commit(label: string, mutate: (draft: StudioBoard) => void, before = board ? snapshotBoard(board) : null) {
    if (!board || !before) return;
    setUndoStack((current) => [...current.slice(-39), before]);
    setRedoStack([]);
    updateProject((draft) => {
      const target = draft.boards.find((candidate) => candidate.id === board.id);
      if (!target) return;
      mutate(target);
      target.history = [...target.history, {
        id: createId("board-history"),
        label,
        createdAt: new Date().toISOString(),
        snapshot: snapshotBoard(target),
      }].slice(-40);
    });
  }

  function undo() {
    if (!board || !undoStack.length) return;
    const previous = undoStack.at(-1)!;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-39), snapshotBoard(board)]);
    updateProject((draft) => {
      const target = draft.boards.find((candidate) => candidate.id === board.id);
      if (target) applySnapshot(target, previous);
    });
  }

  function redo() {
    if (!board || !redoStack.length) return;
    const next = redoStack.at(-1)!;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-39), snapshotBoard(board)]);
    updateProject((draft) => {
      const target = draft.boards.find((candidate) => candidate.id === board.id);
      if (target) applySnapshot(target, next);
    });
  }

  function beginCreate(type: BoardType) {
    setCreateName(type === "tree" ? "Nouvel arbre" : "Nouveau diagramme");
    setCreateDialog({ mode: "create", type });
  }

  function beginDuplicate() {
    if (!board) return;
    setCreateName(`Fork : ${board.name}`);
    setCreateDialog({ mode: "duplicate", type: board.type });
  }

  function confirmCreate() {
    if (!createDialog || !createName.trim()) return;
    const next = createEmptyBoard(createName, createDialog.type, project.boards.length);
    if (createDialog.mode === "duplicate" && board) {
      next.description = board.description;
      next.theme = board.theme;
      next.cardColor = board.cardColor;
      next.bannerMediaId = board.bannerMediaId;
      next.folderId = board.folderId;
      next.nodes = structuredClone(board.nodes);
      next.edges = structuredClone(board.edges);
    }
    updateProject((draft) => {
      draft.boards.push(next);
    });
    selectBoard(next.id);
    setCreateDialog(null);
    toast.success(createDialog.mode === "duplicate" ? "Tableau dupliqué." : "Tableau créé.");
  }

  function confirmDeleteBoard() {
    if (!board || deleteConfirmation !== board.name) return;
    const next = orderedBoards.find((candidate) => candidate.id !== board.id);
    updateProject((draft) => {
      draft.boards = draft.boards.filter((candidate) => candidate.id !== board.id);
      draft.boards.forEach((candidate, index) => { candidate.order = index; });
    });
    selectBoard(next?.id ?? null);
    setDeleteDialogOpen(false);
    setDeleteConfirmation("");
    toast.success("Tableau supprimé.");
  }

  function addNode(kind: BoardNodeKind) {
    if (!board) return;
    if (kind === "image") {
      uploadTargetRef.current = "new-image";
      mediaInputRef.current?.click();
      return;
    }
    const node = newNode(kind, board.nodes.length);
    commit(`Ajout : ${node.title}`, (draft) => draft.nodes.push(node));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  async function handleMediaUpload(file?: File) {
    if (!file || !board) return;
    try {
      const [mediaId] = await uploadMedia([file], "board-image");
      if (!mediaId) return;
      const target = uploadTargetRef.current;
      if (target === "banner") {
        commit("Bannière modifiée", (draft) => { draft.bannerMediaId = mediaId; });
      } else if (target === "new-image") {
        const node = { ...newNode("image", board.nodes.length), imageId: mediaId, title: file.name.replace(/\.[^.]+$/, "") };
        commit("Ajout d’une image", (draft) => draft.nodes.push(node));
        setSelectedNodeId(node.id);
      } else {
        commit("Image de boîte modifiée", (draft) => {
          const node = draft.nodes.find((candidate) => candidate.id === target);
          if (node) node.imageId = mediaId;
        });
      }
    } catch {
      toast.error("L’image n’a pas pu être ajoutée au tableau.");
    }
  }

  function removeNode(nodeId: string) {
    const node = board?.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    commit(`Suppression : ${node.title}`, (draft) => {
      draft.nodes = draft.nodes.filter((candidate) => candidate.id !== nodeId);
      draft.edges = draft.edges.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId);
    });
    setSelectedNodeId(null);
  }

  function handlePort(nodeId: string) {
    if (!board) return;
    if (!connectionSource) {
      setConnectionSource(nodeId);
      setTool("connect");
      toast.message("Cliquez sur un port de la boîte à relier.");
      return;
    }
    if (connectionSource === nodeId) {
      setConnectionSource(null);
      return;
    }
    const duplicate = board.edges.some((edge) =>
      (edge.sourceId === connectionSource && edge.targetId === nodeId) ||
      (edge.sourceId === nodeId && edge.targetId === connectionSource));
    if (!duplicate) commit("Connexion ajoutée", (draft) => draft.edges.push({
      id: createId("board-edge"), sourceId: connectionSource, targetId: nodeId,
      label: board.type === "relationship" ? "Relation" : "", color: "#ef6977",
    }));
    setConnectionSource(null);
    setTool("select");
  }

  function beginNodeDrag(event: ReactPointerEvent<HTMLDivElement>, node: StudioBoardNode) {
    if (tool === "delete") { removeNode(node.id); return; }
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    if (tool !== "select") return;
    const target = event.target as HTMLElement;
    if (target.closest("input,textarea,button,[role='combobox']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { nodeId: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y };
  }

  function moveNode(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setDragPosition({
      nodeId: drag.nodeId,
      x: Math.max(0, drag.originX + event.clientX - drag.startX),
      y: Math.max(0, drag.originY + event.clientY - drag.startY),
    });
  }

  function endNodeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const position = dragPosition;
    dragRef.current = null;
    setDragPosition(null);
    if (!position || (position.x === drag.originX && position.y === drag.originY)) return;
    commit("Boîte déplacée", (draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === drag.nodeId);
      if (node) { node.x = Math.round(position.x); node.y = Math.round(position.y); }
    });
  }

  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool !== "pan" && event.button !== 1) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { startX: event.clientX, startY: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport) return;
    viewport.scrollLeft = pan.left - (event.clientX - pan.startX);
    viewport.scrollTop = pan.top - (event.clientY - pan.startY);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  }

  function restoreHistory(snapshot: StudioBoardSnapshot, label: string) {
    if (!board) return;
    commit(`Restauration : ${label}`, (draft) => applySnapshot(draft, snapshot));
    setHistoryOpen(false);
    toast.success("Version du tableau restaurée.");
  }

  function deleteSelection() {
    if (selectedNodeId) { removeNode(selectedNodeId); return; }
    if (selectedEdgeId && board) {
      commit("Connexion supprimée", (draft) => { draft.edges = draft.edges.filter((edge) => edge.id !== selectedEdgeId); });
      setSelectedEdgeId(null);
    }
  }

  if (!board) return <div className="flex min-h-0 flex-1 flex-col bg-[#0c0b0f]">
    <EmptyBoards onCreate={beginCreate} />
    <CreateBoardDialog state={createDialog} name={createName} onNameChange={setCreateName} onClose={() => setCreateDialog(null)} onConfirm={confirmCreate} />
  </div>;

  const boardBackground = board.theme === "light" ? "#f3f5f8" : "#0b0a0e";
  const gridColor = board.theme === "light" ? "rgba(36,39,49,.11)" : "rgba(255,255,255,.055)";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0b0f]">
      <input ref={mediaInputRef} className="hidden" type="file" accept="image/*" onChange={(event) => { void handleMediaUpload(event.target.files?.[0]); event.target.value = ""; }} />

      <div className="shrink-0 border-b border-white/8 bg-[#121117]">
        {board.bannerMediaId && <div className="relative h-16 overflow-hidden border-b border-white/7"><MediaPreview mediaId={board.bannerMediaId} alt={`Bannière de ${board.name}`} className="h-full w-full opacity-55" /><div className="absolute inset-0 bg-gradient-to-r from-[#121117] via-[#121117]/45 to-[#121117]" /></div>}
        <div className="flex min-h-14 flex-wrap items-center gap-2 px-3 py-2 sm:px-5">
          <Select value={board.id} onValueChange={selectBoard}>
            <SelectTrigger aria-label="Tableau actif" className="w-[min(72vw,260px)] border-white/10 bg-white/4"><SelectValue /></SelectTrigger>
            <SelectContent>{orderedBoards.map((item) => <SelectItem key={item.id} value={item.id}>{item.type === "tree" ? "Arbre" : "Diagramme"} · {item.name}</SelectItem>)}</SelectContent>
          </Select>
          <span className="hidden rounded-full border border-white/8 bg-white/3 px-2.5 py-1 text-[11px] text-[#8f8996] sm:inline">{board.nodes.length} éléments · {board.edges.length} liens</span>

          <div className="ml-auto flex items-center gap-1">
            <ToolbarButton label="Annuler" disabled={!undoStack.length} onClick={undo}><Undo2 /></ToolbarButton>
            <ToolbarButton label="Rétablir" disabled={!redoStack.length} onClick={redo}><Redo2 /></ToolbarButton>
            <ToolbarButton label="Historique" onClick={() => setHistoryOpen(true)}><History /></ToolbarButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]"><Plus /> Ajouter <ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {board.type === "tree" ? <>
                  <DropdownMenuItem onSelect={() => addNode("text")}><BoxSelect /> Boîte texte</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => addNode("image")}><FileImage /> Boîte image</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => addNode("character")}><Users /> Boîte personnage</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => addNode("group")}><LayoutGrid /> Grosse boîte</DropdownMenuItem>
                </> : <DropdownMenuItem onSelect={() => addNode("character")}><Users /> Ajouter un personnage</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => beginCreate("tree")}><ListTree /> Nouvel arbre</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => beginCreate("relationship")}><Network /> Nouveau diagramme</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="border-white/10"><Settings2 /> Options rapides</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>{board.name}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setQuickOptionsOpen(true)}><Wrench /> Apparence et description</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setManageOpen(true)}><LayoutGrid /> Gérer les tableaux</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={beginDuplicate}><Copy /> Dupliquer</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => { setDeleteConfirmation(""); setDeleteDialogOpen(true); }}><Trash2 /> Supprimer ce tableau</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-t border-white/7 px-3 py-1.5 sm:px-5">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[.14em] text-[#69636f]">Outils</span>
          <ToolButton active={tool === "select"} label="Sélection" onClick={() => setTool("select")}><MousePointer2 /></ToolButton>
          <ToolButton active={tool === "pan"} label="Déplacement" onClick={() => setTool("pan")}><Grip /></ToolButton>
          <ToolButton active={tool === "connect"} label="Connexion" onClick={() => { setTool("connect"); setConnectionSource(null); }}><Cable /></ToolButton>
          <ToolButton active={tool === "delete"} label="Suppression" onClick={() => setTool("delete")}><Trash2 /></ToolButton>
          <span className="mx-1 h-5 w-px shrink-0 bg-white/9" />
          <Button size="sm" variant="ghost" disabled={!selectedNode && !selectedEdge} onClick={() => setEditOpen(true)}><Edit3 /> Modifier</Button>
          <Button size="sm" variant="ghost" disabled={!selectedNode && !selectedEdge} className="text-[#d8868e]" onClick={deleteSelection}><Trash2 /> Supprimer</Button>
          {connectionSource && <span className="ml-2 shrink-0 rounded-full bg-[#ef4f5f]/12 px-3 py-1 text-xs text-[#ff8a95]">Connexion en cours…</span>}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`min-h-0 flex-1 overflow-auto ${tool === "pan" ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ backgroundColor: boardBackground }}
      >
        <div
          className="relative select-none"
          style={{
            width: canvasWidth, height: canvasHeight,
            backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onDoubleClick={() => { if (tool === "select" && board.type === "tree") addNode("text"); }}
        >
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {board.edges.map((edge) => {
              const source = board.nodes.find((node) => node.id === edge.sourceId);
              const target = board.nodes.find((node) => node.id === edge.targetId);
              if (!source || !target) return null;
              const sourceSize = nodeSize(board, source);
              const targetSize = nodeSize(board, target);
              const sourcePosition = dragPosition?.nodeId === source.id ? dragPosition : source;
              const targetPosition = dragPosition?.nodeId === target.id ? dragPosition : target;
              const x1 = sourcePosition.x + sourceSize.width;
              const y1 = sourcePosition.y + sourceSize.height / 2;
              const x2 = targetPosition.x;
              const y2 = targetPosition.y + targetSize.height / 2;
              const curve = Math.max(80, Math.abs(x2 - x1) * 0.42);
              const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
              const selected = selectedEdgeId === edge.id;
              return <g key={edge.id} className="pointer-events-auto cursor-pointer" onClick={(event) => { event.stopPropagation(); if (tool === "delete") { commit("Connexion supprimée", (draft) => { draft.edges = draft.edges.filter((item) => item.id !== edge.id); }); } else { setSelectedEdgeId(edge.id); setSelectedNodeId(null); } }}>
                <path d={path} fill="none" stroke="transparent" strokeWidth="18" />
                <path d={path} fill="none" stroke={selected ? "#ffffff" : edge.color} strokeWidth={selected ? 4 : 3} strokeLinecap="round" opacity={selected ? 1 : .82} />
                {edge.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fill={board.theme === "light" ? "#3a3540" : "#c9c2ce"} fontSize="12" stroke={boardBackground} strokeWidth="5" paintOrder="stroke">{edge.label}</text>}
              </g>;
            })}
          </svg>

          {board.nodes.map((node) => {
            const dimensions = nodeSize(board, node);
            const position = dragPosition?.nodeId === node.id ? dragPosition : node;
            const selected = node.id === selectedNodeId;
            return <BoardNodeCard
              key={`${node.id}-${node.title}-${node.text}`}
              board={board}
              node={node}
              width={dimensions.width}
              height={dimensions.height}
              x={position.x}
              y={position.y}
              selected={selected}
              tool={tool}
              characters={project.characters}
              connectionSource={connectionSource}
              onPointerDown={(event) => beginNodeDrag(event, node)}
              onPointerMove={moveNode}
              onPointerUp={endNodeDrag}
              onPort={() => handlePort(node.id)}
              onOpenCharacter={onOpenCharacter}
              onAssignCharacter={(characterId) => commit("Personnage assigné", (draft) => {
                const target = draft.nodes.find((candidate) => candidate.id === node.id);
                if (target) { target.characterId = characterId; target.title = project.characters.find((character) => character.id === characterId)?.name ?? target.title; }
              })}
              onAddGroupCharacter={(characterId) => commit("Personnage ajouté au groupe", (draft) => {
                const target = draft.nodes.find((candidate) => candidate.id === node.id);
                if (target && !target.characterIds.includes(characterId)) target.characterIds.push(characterId);
              })}
              onRemoveGroupCharacter={(characterId) => commit("Personnage retiré du groupe", (draft) => {
                const target = draft.nodes.find((candidate) => candidate.id === node.id);
                if (target) target.characterIds = target.characterIds.filter((id) => id !== characterId);
              })}
              onChangeText={(title, text) => {
                if (title === node.title && text === node.text) return;
                commit("Contenu de boîte modifié", (draft) => {
                  const target = draft.nodes.find((candidate) => candidate.id === node.id);
                  if (target) { target.title = title; target.text = text; }
                });
              }}
              onUploadImage={() => { uploadTargetRef.current = node.id; mediaInputRef.current?.click(); }}
            />;
          })}
        </div>
      </div>

      <CreateBoardDialog state={createDialog} name={createName} onNameChange={setCreateName} onClose={() => setCreateDialog(null)} onConfirm={confirmCreate} />
      <DeleteBoardDialog board={board} open={deleteDialogOpen} confirmation={deleteConfirmation} onConfirmationChange={setDeleteConfirmation} onClose={() => setDeleteDialogOpen(false)} onConfirm={confirmDeleteBoard} />
      {quickOptionsOpen && <QuickOptionsDialog board={board} open onOpenChange={setQuickOptionsOpen} onSave={(values) => commit("Options du tableau modifiées", (draft) => Object.assign(draft, values))} onUploadBanner={() => { uploadTargetRef.current = "banner"; mediaInputRef.current?.click(); }} />}
      <HistoryDialog board={board} open={historyOpen} onOpenChange={setHistoryOpen} onRestore={restoreHistory} />
      <BoardManagerDialog project={project} activeBoardId={board.id} open={manageOpen} onOpenChange={setManageOpen} updateProject={updateProject} onSelectBoard={(id) => selectBoard(id)} onCreateBoard={(type) => { setManageOpen(false); beginCreate(type); }} onCustomize={(id) => { selectBoard(id); setManageOpen(false); setQuickOptionsOpen(true); }} onDeleteBoard={(id) => { selectBoard(id); setManageOpen(false); const target = project.boards.find((item) => item.id === id); if (target) { setDeleteConfirmation(""); setDeleteDialogOpen(true); } }} />
      {editOpen && <ElementEditorDialog node={selectedNode} edge={selectedEdge} open onOpenChange={setEditOpen} onSaveNode={(values) => commit("Boîte modifiée", (draft) => { const target = draft.nodes.find((node) => node.id === selectedNode?.id); if (target) Object.assign(target, values); })} onSaveEdge={(values) => commit("Connexion modifiée", (draft) => { const target = draft.edges.find((edge) => edge.id === selectedEdge?.id); if (target) Object.assign(target, values); })} />}
    </div>
  );
}

function BoardNodeCard({
  board, node, width, height, x, y, selected, tool, characters, connectionSource,
  onPointerDown, onPointerMove, onPointerUp, onPort, onOpenCharacter,
  onAssignCharacter, onAddGroupCharacter, onRemoveGroupCharacter, onChangeText, onUploadImage,
}: {
  board: StudioBoard;
  node: StudioBoardNode;
  width: number;
  height: number;
  x: number;
  y: number;
  selected: boolean;
  tool: BoardTool;
  characters: StudioProject["characters"];
  connectionSource: string | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPort: () => void;
  onOpenCharacter: (characterId: string) => void;
  onAssignCharacter: (characterId: string) => void;
  onAddGroupCharacter: (characterId: string) => void;
  onRemoveGroupCharacter: (characterId: string) => void;
  onChangeText: (title: string, text: string) => void;
  onUploadImage: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [text, setText] = useState(node.text);
  const character = characters.find((candidate) => candidate.id === node.characterId);
  const light = board.theme === "light";
  const relationship = board.type === "relationship";
  return <div
    className={`absolute flex flex-col border shadow-xl transition-shadow ${relationship ? "overflow-hidden rounded-full" : "rounded-xl"} ${selected ? "border-white ring-2 ring-[#ef4f5f]/70" : "border-black/30"} ${tool === "delete" ? "cursor-crosshair" : "cursor-move"}`}
    style={{ left: x, top: y, width, height, backgroundColor: relationship ? node.color : board.cardColor, color: light ? "#242129" : "#eeeaf2" }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onDoubleClick={(event) => { event.stopPropagation(); if (character) onOpenCharacter(character.id); }}
  >
    <button type="button" aria-label="Port gauche" title="Relier cette boîte" className={`absolute left-0 top-1/2 z-20 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#ef4f5f] shadow ${connectionSource === node.id ? "ring-4 ring-[#ef4f5f]/35" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onPort(); }} />
    <button type="button" aria-label="Port droit" title="Relier cette boîte" className={`absolute right-0 top-1/2 z-20 size-4 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#ef4f5f] shadow ${connectionSource === node.id ? "ring-4 ring-[#ef4f5f]/35" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onPort(); }} />

    {node.kind === "character" ? character ? <div className={`flex size-full ${relationship ? "flex-col items-center justify-center p-4 text-center" : "items-center gap-3 p-4"}`}>
      <MediaPreview mediaId={character.imageIds[0]} alt={character.name} className={relationship ? "mb-2 size-[48%] min-h-12 min-w-12 rounded-full" : "size-16 shrink-0 rounded-xl"} />
      <div className="min-w-0"><p className="truncate font-semibold">{character.name}</p>{character.role && <p className="mt-1 line-clamp-2 text-[11px] opacity-65">{character.role}</p>}<p className="mt-1 text-[10px] opacity-50">Double-cliquez pour ouvrir</p></div>
    </div> : <CharacterPicker characters={characters} onSelect={onAssignCharacter} compact={relationship} /> : node.kind === "image" ? <div className="relative flex size-full flex-col overflow-hidden rounded-[inherit]">
      <MediaPreview mediaId={node.imageId} alt={node.title} className="min-h-0 flex-1 w-full" expandable />
      <button type="button" className="shrink-0 bg-black/35 px-3 py-2 text-left text-xs text-white hover:bg-black/50" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onUploadImage(); }}>{node.imageId ? "Remplacer l’image" : "Ajouter une image"}</button>
    </div> : node.kind === "group" ? <div className="flex size-full flex-col gap-2 overflow-hidden p-4">
      <Input value={title} className="h-8 border-white/10 bg-black/15 font-semibold" onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setTitle(event.target.value)} onBlur={() => onChangeText(title, text)} />
      <Textarea value={text} placeholder="Texte, évènements, notes…" className="min-h-16 flex-1 resize-none border-white/10 bg-black/15" onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setText(event.target.value)} onBlur={() => onChangeText(title, text)} />
      <div className="flex min-h-14 items-center gap-2 overflow-x-auto rounded-lg border border-white/8 bg-black/10 p-2">
        {node.imageId && <MediaPreview mediaId={node.imageId} alt={node.title} className="h-12 w-16 shrink-0 rounded-md" expandable />}
        <Button size="icon-xs" variant="ghost" title="Ajouter une image" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onUploadImage(); }}><ImagePlus /></Button>
        {node.characterIds.map((id) => { const item = characters.find((candidate) => candidate.id === id); return item ? <button key={id} type="button" className="group relative shrink-0" title={`Retirer ${item.name}`} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); onOpenCharacter(id); }} onClick={(event) => { if (event.altKey) onRemoveGroupCharacter(id); }}><MediaPreview mediaId={item.imageIds[0]} alt={item.name} className="size-10 rounded-full" /><span className="mt-0.5 block max-w-14 truncate text-[9px]">{item.name}</span></button> : null; })}
        <CharacterPicker characters={characters.filter((character) => !node.characterIds.includes(character.id))} onSelect={onAddGroupCharacter} mini />
      </div>
    </div> : <div className="flex size-full flex-col p-4">
      <Input value={title} className="h-8 border-0 bg-transparent px-0 font-semibold shadow-none focus-visible:ring-0" onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setTitle(event.target.value)} onBlur={() => onChangeText(title, text)} />
      <Textarea value={text} placeholder="Décrivez cet évènement…" className="min-h-0 flex-1 resize-none border-0 bg-transparent px-0 text-sm leading-5 shadow-none focus-visible:ring-0" onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setText(event.target.value)} onBlur={() => onChangeText(title, text)} />
    </div>}
  </div>;
}

function CharacterPicker({ characters, onSelect, compact = false, mini = false }: { characters: StudioProject["characters"]; onSelect: (id: string) => void; compact?: boolean; mini?: boolean }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(!mini);
  const suggestions = characters.filter((character) => character.name.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))).slice(0, mini ? 5 : 8);
  if (mini && !open) return <Button size="icon-xs" variant="ghost" title="Ajouter un personnage" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setOpen(true); }}><CirclePlus /></Button>;
  return <div className={`flex size-full flex-col justify-center ${compact ? "p-5" : mini ? "min-w-40 p-1" : "p-4"}`} onPointerDown={(event) => event.stopPropagation()}>
    <p className="mb-2 text-center text-[11px] font-medium opacity-65">Choisir un personnage</p>
    <Input autoFocus={mini} value={search} placeholder="Rechercher…" className="h-8 border-white/10 bg-black/15 text-xs" onChange={(event) => setSearch(event.target.value)} />
    <div className={`${mini ? "absolute z-30 mt-20 max-h-40 w-48 rounded-lg border border-white/10 bg-[#1b1821] p-1 shadow-2xl" : "mt-2 max-h-24"} overflow-y-auto`}>
      {suggestions.map((character) => <button key={character.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/8" onClick={() => { onSelect(character.id); setOpen(false); }}><MediaPreview mediaId={character.imageIds[0]} alt={character.name} className="size-6 shrink-0 rounded-md" /><span className="truncate">{character.name}</span></button>)}
      {!suggestions.length && <p className="p-2 text-center text-[10px] opacity-50">Aucun personnage</p>}
    </div>
  </div>;
}

function EmptyBoards({ onCreate }: { onCreate: (type: BoardType) => void }) {
  return <div className="studio-page grid min-h-0 flex-1 place-items-center overflow-y-auto p-6"><div className="max-w-2xl text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#ef4f5f]/10 text-[#ef6977]"><GitFork className="size-7" /></span><h1 className="mt-5 text-2xl font-bold text-white">Visualisez votre histoire</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#8f8996]">Créez un arbre pour organiser une temporalité et des évènements, ou un diagramme pour cartographier les relations entre personnages.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><article className="flex flex-col rounded-2xl border border-white/9 bg-[#15131a] p-5 text-left"><ListTree className="mb-3 size-5 text-[#ef6977]" /><span className="block font-semibold text-white">Arbre narratif</span><span className="mt-1 flex-1 text-xs leading-5 text-[#77717f]">Boîtes texte, images, personnages et groupes reliés.</span><Button className="mt-5 w-full bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={() => onCreate("tree")}><Plus /> Créer un arbre</Button></article><article className="flex flex-col rounded-2xl border border-white/9 bg-[#15131a] p-5 text-left"><Network className="mb-3 size-5 text-[#ef6977]" /><span className="block font-semibold text-white">Diagramme de relations</span><span className="mt-1 flex-1 text-xs leading-5 text-[#77717f]">Bulles de personnages dimensionnées par leurs relations.</span><Button className="mt-5 w-full bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={() => onCreate("relationship")}><Plus /> Créer un diagramme</Button></article></div></div></div>;
}

function ToolbarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button aria-label={label} title={label} size="icon-sm" variant="ghost" disabled={disabled} onClick={onClick}>{children}</Button>;
}

function ToolButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return <Button size="sm" variant={active ? "secondary" : "ghost"} className={active ? "bg-[#ef4f5f]/12 text-[#ff8a95]" : ""} onClick={onClick}>{children}{label}</Button>;
}

function CreateBoardDialog({ state, name, onNameChange, onClose, onConfirm }: { state: CreateDialogState; name: string; onNameChange: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>{state?.mode === "duplicate" ? "Dupliquer le tableau" : state?.type === "relationship" ? "Nouveau diagramme" : "Nouvel arbre"}</DialogTitle><DialogDescription className="text-[#9c96a5]">Choisissez le nom qui apparaîtra dans la liste des tableaux.</DialogDescription></DialogHeader><label className="grid gap-2 text-xs text-[#aaa4b4]">Nom<Input autoFocus value={name} className="border-white/10 bg-white/4" onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onConfirm(); }} /></label><DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button disabled={!name.trim()} className="bg-[#ef4f5f] text-white" onClick={onConfirm}>{state?.mode === "duplicate" ? <Copy /> : <Plus />}{state?.mode === "duplicate" ? "Dupliquer" : "Créer"}</Button></DialogFooter></DialogContent></Dialog>;
}

function DeleteBoardDialog({ board, open, confirmation, onConfirmationChange, onClose, onConfirm }: { board: StudioBoard; open: boolean; confirmation: string; onConfirmationChange: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Supprimer « {board.name} » ?</DialogTitle><DialogDescription className="text-[#9c96a5]">Les boîtes et connexions de ce tableau seront perdues. Saisissez exactement son nom pour confirmer.</DialogDescription></DialogHeader><Input autoFocus value={confirmation} placeholder={board.name} className="border-white/10 bg-white/4" onChange={(event) => onConfirmationChange(event.target.value)} /><DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button variant="destructive" disabled={confirmation !== board.name} onClick={onConfirm}><Trash2 /> Supprimer définitivement</Button></DialogFooter></DialogContent></Dialog>;
}

function QuickOptionsDialog({ board, open, onOpenChange, onSave, onUploadBanner }: { board: StudioBoard; open: boolean; onOpenChange: (open: boolean) => void; onSave: (values: Pick<StudioBoard, "name" | "description" | "theme" | "cardColor">) => void; onUploadBanner: () => void }) {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [theme, setTheme] = useState<BoardTheme>(board.theme);
  const [cardColor, setCardColor] = useState(board.cardColor);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Options rapides du tableau</DialogTitle><DialogDescription className="text-[#9c96a5]">Personnalisez la carte, le canevas et les informations du tableau.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-xs text-[#aaa4b4]">Nom<Input value={name} className="border-white/10 bg-white/4" onChange={(event) => setName(event.target.value)} /></label><label className="grid gap-2 text-xs text-[#aaa4b4]">Description<Textarea value={description} className="border-white/10 bg-white/4" onChange={(event) => setDescription(event.target.value)} /></label><div className="grid grid-cols-2 gap-3"><button className={`rounded-xl border p-3 text-left ${theme === "dark" ? "border-[#ef4f5f] bg-[#ef4f5f]/8" : "border-white/8"}`} onClick={() => { setTheme("dark"); if (cardColor === "#ffffff") setCardColor("#17151d"); }}><Moon className="mb-2 size-4" /><span className="text-sm">Mode sombre</span></button><button className={`rounded-xl border p-3 text-left ${theme === "light" ? "border-[#ef4f5f] bg-[#ef4f5f]/8" : "border-white/8"}`} onClick={() => { setTheme("light"); if (cardColor === "#17151d") setCardColor("#ffffff"); }}><Sun className="mb-2 size-4" /><span className="text-sm">Mode clair</span></button></div><label className="flex items-center justify-between rounded-xl border border-white/8 p-3 text-sm"><span>Couleur des cartes</span><input type="color" value={cardColor} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" onChange={(event) => setCardColor(event.target.value)} /></label><Button variant="outline" className="border-white/10" onClick={onUploadBanner}><ImagePlus /> {board.bannerMediaId ? "Remplacer la bannière" : "Choisir une bannière"}</Button></div><DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button className="bg-[#ef4f5f] text-white" disabled={!name.trim()} onClick={() => { onSave({ name: name.trim(), description, theme, cardColor }); onOpenChange(false); }}>Enregistrer</Button></DialogFooter></DialogContent></Dialog>;
}

function HistoryDialog({ board, open, onOpenChange, onRestore }: { board: StudioBoard; open: boolean; onOpenChange: (open: boolean) => void; onRestore: (snapshot: StudioBoardSnapshot, label: string) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[82svh] overflow-hidden border-white/10 bg-[#17151d] text-[#eeeaf2] sm:max-w-xl"><DialogHeader><DialogTitle>Historique des actions</DialogTitle><DialogDescription className="text-[#9c96a5]">Les 40 dernières étapes sont conservées dans la sauvegarde. Restaurer une étape crée une nouvelle action.</DialogDescription></DialogHeader><div className="max-h-[58svh] space-y-2 overflow-y-auto pr-1">{[...board.history].reverse().map((entry) => <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5"><History className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{entry.label}</p><p className="mt-0.5 text-[11px] text-[#77717f]">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))} · {entry.snapshot.nodes.length} éléments</p></div><Button size="sm" variant="outline" className="border-white/10" onClick={() => onRestore(entry.snapshot, entry.label)}>Restaurer</Button></div>)}{!board.history.length && <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-[#77717f]">L’historique apparaîtra après la première action.</div>}</div></DialogContent></Dialog>;
}

function BoardManagerDialog({ project, activeBoardId, open, onOpenChange, updateProject, onSelectBoard, onCreateBoard, onCustomize, onDeleteBoard }: { project: StudioProject; activeBoardId: string; open: boolean; onOpenChange: (open: boolean) => void; updateProject: (mutate: (draft: StudioProject) => void) => void; onSelectBoard: (id: string) => void; onCreateBoard: (type: BoardType) => void; onCustomize: (id: string) => void; onDeleteBoard: (id: string) => void }) {
  function addFolder() {
    updateProject((draft) => draft.boardFolders.push({ id: createId("board-folder"), name: `Nouveau dossier ${draft.boardFolders.length + 1}`, order: draft.boardFolders.length }));
  }
  function moveBoard(id: string, direction: -1 | 1) {
    updateProject((draft) => {
      const ordered = [...draft.boards].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((board) => board.id === id);
      const other = ordered[index + direction];
      if (!other || index < 0) return;
      const current = ordered[index];
      [current.order, other.order] = [other.order, current.order];
    });
  }
  const folders = [...project.boardFolders].sort((a, b) => a.order - b.order);
  const boards = [...project.boards].sort((a, b) => a.order - b.order);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[88svh] overflow-hidden border-white/10 bg-[#17151d] text-[#eeeaf2] sm:max-w-3xl"><DialogHeader><DialogTitle>Gestion des tableaux</DialogTitle><DialogDescription className="text-[#9c96a5]">Renommez, classez et réorganisez les tableaux de ce projet.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><Button size="sm" className="bg-[#ef4f5f] text-white" onClick={() => onCreateBoard("tree")}><ListTree /> Ajouter un arbre</Button><Button size="sm" variant="outline" className="border-white/10" onClick={() => onCreateBoard("relationship")}><Network /> Ajouter un diagramme</Button></div><div className="grid min-h-0 gap-5 md:grid-cols-[220px_1fr]"><section><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wider text-[#8f8996]">Dossiers</h3><Button size="icon-xs" variant="ghost" title="Ajouter un dossier" onClick={addFolder}><FolderPlus /></Button></div><div className="space-y-2"><div className="rounded-lg border border-white/7 px-3 py-2 text-xs text-[#aaa4b4]">Sans dossier</div>{folders.map((folder) => <div key={folder.id} className="flex items-center gap-1 rounded-lg border border-white/7 bg-white/3 p-1"><Input defaultValue={folder.name} className="h-8 flex-1 border-0 bg-transparent text-xs" onBlur={(event) => updateProject((draft) => { const target = draft.boardFolders.find((item) => item.id === folder.id); if (target && event.target.value.trim()) target.name = event.target.value.trim(); })} /><Button size="icon-xs" variant="ghost" className="text-[#a66f76]" title="Supprimer le dossier" onClick={() => updateProject((draft) => { draft.boardFolders = draft.boardFolders.filter((item) => item.id !== folder.id); draft.boards.forEach((board) => { if (board.folderId === folder.id) board.folderId = null; }); })}><Trash2 /></Button></div>)}</div></section><section className="min-h-0"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8f8996]">Ordre et classement</h3><div className="max-h-[55svh] space-y-2 overflow-y-auto pr-1">{boards.map((board, index) => <div key={board.id} className={`grid grid-cols-[1fr_150px_auto] items-center gap-2 rounded-xl border p-2 ${board.id === activeBoardId ? "border-[#ef4f5f]/35 bg-[#ef4f5f]/6" : "border-white/7 bg-white/3"}`}><Input defaultValue={board.name} className="h-8 border-0 bg-transparent text-sm" onFocus={() => onSelectBoard(board.id)} onBlur={(event) => updateProject((draft) => { const target = draft.boards.find((item) => item.id === board.id); if (target && event.target.value.trim()) target.name = event.target.value.trim(); })} /><Select value={board.folderId ?? "none"} onValueChange={(value) => updateProject((draft) => { const target = draft.boards.find((item) => item.id === board.id); if (target) target.folderId = value === "none" ? null : value; })}><SelectTrigger className="h-8 border-white/10 bg-black/15 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sans dossier</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select><div className="flex"><Button size="icon-xs" variant="ghost" title="Personnaliser" onClick={() => onCustomize(board.id)}><Wrench /></Button><Button size="icon-xs" variant="ghost" disabled={index === 0} title="Monter" onClick={() => moveBoard(board.id, -1)}><ArrowUp /></Button><Button size="icon-xs" variant="ghost" disabled={index === boards.length - 1} title="Descendre" onClick={() => moveBoard(board.id, 1)}><ArrowDown /></Button><Button size="icon-xs" variant="ghost" className="text-[#c87882]" title="Supprimer" onClick={() => onDeleteBoard(board.id)}><Trash2 /></Button></div></div>)}</div></section></div></DialogContent></Dialog>;
}

function ElementEditorDialog({ node, edge, open, onOpenChange, onSaveNode, onSaveEdge }: { node: StudioBoardNode | null; edge: StudioBoardEdge | null; open: boolean; onOpenChange: (open: boolean) => void; onSaveNode: (values: Pick<StudioBoardNode, "title" | "text" | "color">) => void; onSaveEdge: (values: Pick<StudioBoardEdge, "label" | "color">) => void }) {
  const [title, setTitle] = useState(node?.title ?? "");
  const [text, setText] = useState(node?.text ?? "");
  const [label, setLabel] = useState(edge?.label ?? "");
  const [color, setColor] = useState(node?.color ?? edge?.color ?? "#ef6977");
  return <Dialog open={open && Boolean(node || edge)} onOpenChange={onOpenChange}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>{node ? "Modifier la boîte" : "Modifier la connexion"}</DialogTitle></DialogHeader>{node ? <div className="grid gap-4"><label className="grid gap-2 text-xs text-[#aaa4b4]">Titre<Input value={title} className="border-white/10 bg-white/4" onChange={(event) => setTitle(event.target.value)} /></label><label className="grid gap-2 text-xs text-[#aaa4b4]">Texte<Textarea value={text} className="border-white/10 bg-white/4" onChange={(event) => setText(event.target.value)} /></label></div> : <label className="grid gap-2 text-xs text-[#aaa4b4]">Nom de la relation<Input value={label} className="border-white/10 bg-white/4" onChange={(event) => setLabel(event.target.value)} /></label>}<label className="flex items-center justify-between rounded-xl border border-white/8 p-3 text-sm"><span>Couleur</span><input type="color" value={color} className="h-8 w-12" onChange={(event) => setColor(event.target.value)} /></label><DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button className="bg-[#ef4f5f] text-white" onClick={() => { if (node) onSaveNode({ title, text, color }); else onSaveEdge({ label, color }); onOpenChange(false); }}>Enregistrer</Button></DialogFooter></DialogContent></Dialog>;
}
