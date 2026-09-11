"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, FileText, Focus, ListTree, LoaderCircle,
  Minimize2, MoreHorizontal, Pencil, Plus, Settings2, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  SuperDocWritingEditor, type WritingDocumentSnapshot,
} from "@/components/studio/superdoc-writing-editor";
import { WritingDocumentControls } from "@/components/studio/writing-document-controls";
import { WritingExportButton } from "@/components/studio/writing-export-button";
import { WritingImportButton } from "@/components/studio/writing-import-button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteMedia } from "@/lib/studio-db";
import { getActiveWritingDocument } from "@/lib/writing-editor-registry";
import { ensureStudioDocxStyles } from "@/lib/writing-docx";
import { loadOrCreateWritingDocument, persistWritingDocument } from "@/lib/writing-document";
import { writingDocumentMediaId } from "@/lib/writing-document-id";
import {
  createEmptyPage, createEmptyVolume, createId, getVolumePages,
  getWritingDocumentStats, stripHtml, type StudioProject, type StudioSettings,
  type StudioVolume, type WritingCounterKey,
} from "@/lib/studio";
import type { ImportedWritingDocument } from "@/lib/writing-import";

type OutlineEntry = { headingIndex: number; level: number; label: string };

const counterLabels: Record<WritingCounterKey, string> = {
  words: "Mots",
  paragraphs: "Paragraphes",
  pages: "Pages",
  characters: "Caractères sans espaces",
  symbols: "Symboles avec espaces",
};

const normalWorkspaceHeight = "calc(var(--studio-viewport-height, 100svh) - 4rem)";

function firstPageId(volume?: StudioVolume | null) {
  return volume ? getVolumePages(volume)[0]?.id ?? null : null;
}

function volumeForPage(project: StudioProject, pageId: string | null) {
  return project.volumes.find((volume) => getVolumePages(volume).some((page) => page.id === pageId)) ?? null;
}

export function WritingWorkspace({
  project, selectedPageId, onSelectPage, updateProject, settings, updateSettings,
  focusMode, onToggleFocus,
}: {
  project: StudioProject;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
  settings: StudioSettings;
  updateSettings: (mutate: (draft: StudioSettings) => void) => void;
  focusMode: boolean;
  onToggleFocus: () => void;
}) {
  const activeVolume = volumeForPage(project, selectedPageId) ?? project.volumes[0] ?? null;
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [documentError, setDocumentError] = useState("");
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set());
  const [navigationTarget, setNavigationTarget] = useState<{ text: string; token: number } | null>(null);
  const [renameVolumeId, setRenameVolumeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteVolumeId, setDeleteVolumeId] = useState<string | null>(null);
  const [deleteVolumeConfirm, setDeleteVolumeConfirm] = useState("");

  useEffect(() => {
    if (!activeVolume) {
      setDocumentBlob(null);
      return;
    }
    let cancelled = false;
    setDocumentBlob(null);
    setDocumentError("");
    loadOrCreateWritingDocument(project, activeVolume.id)
      .then(async (blob) => {
        const styledBlob = await ensureStudioDocxStyles(blob);
        if (styledBlob !== blob) await persistWritingDocument(project.id, activeVolume.id, activeVolume.title, styledBlob);
        return styledBlob;
      })
      .then((blob) => { if (!cancelled) setDocumentBlob(blob); })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Le manuscrit ne peut pas être ouvert.";
        setDocumentError(message);
        toast.error(message);
      });
    return () => { cancelled = true; };
  }, [activeVolume?.id, project.id]);

  const documentStats = useMemo(
    () => activeVolume ? getWritingDocumentStats(activeVolume) : emptyStats(),
    [activeVolume],
  );
  const outlines = useMemo(
    () => new Map(project.volumes.map((volume) => [volume.id, extractOutline(volume)])),
    [project.volumes],
  );

  function selectVolume(volumeId: string) {
    const volume = project.volumes.find((candidate) => candidate.id === volumeId);
    if (!volume) return;
    const pageId = firstPageId(volume);
    if (pageId) onSelectPage(pageId);
    else {
      const page = createEmptyPage();
      updateProject((draft) => {
        const target = draft.volumes.find((candidate) => candidate.id === volumeId);
        if (!target) return;
        if (target.chapters[0]) target.chapters[0].pages.push(page);
        else target.chapters.push({ id: createId("chapter"), title: "Contenu", pages: [page] });
      });
      onSelectPage(page.id);
    }
  }

  function addVolume() {
    const volume = createEmptyVolume(project.volumes.length + 1);
    updateProject((draft) => draft.volumes.push(volume));
    onSelectPage(firstPageId(volume)!);
  }

  async function importWriting(document: ImportedWritingDocument) {
    const volume = createEmptyVolume(project.volumes.length + 1, document.title);
    volume.chapters[0].pages = document.pages.map((content, index) => ({
      ...createEmptyPage(index + 1),
      content,
      formatOverride: document.pageFormat,
    }));
    if (document.nativeDocx) {
      await persistWritingDocument(project.id, volume.id, volume.title, document.nativeDocx);
      volume.documentEngine = "superdoc";
      volume.documentPageCount = Math.max(1, document.pages.length);
    } else {
      volume.documentEngine = "legacy-html";
    }
    updateProject((draft) => draft.volumes.push(volume));
    onSelectPage(firstPageId(volume)!);
  }

  function openRenameVolume(volume: StudioVolume) {
    setRenameVolumeId(volume.id);
    setRenameDraft(volume.title);
  }

  function confirmRenameVolume() {
    const name = renameDraft.trim();
    if (!renameVolumeId || !name) return;
    updateProject((draft) => {
      const volume = draft.volumes.find((candidate) => candidate.id === renameVolumeId);
      if (volume) volume.title = name;
    });
    setRenameVolumeId(null);
  }

  function confirmDeleteVolume() {
    const volume = project.volumes.find((candidate) => candidate.id === deleteVolumeId);
    if (!volume || deleteVolumeConfirm !== volume.title) return;
    const index = project.volumes.findIndex((candidate) => candidate.id === volume.id);
    const nextVolume = project.volumes[index + 1] ?? project.volumes[index - 1];
    void deleteMedia(writingDocumentMediaId(volume.id)).catch(() => undefined);
    updateProject((draft) => { draft.volumes = draft.volumes.filter((candidate) => candidate.id !== volume.id); });
    const nextPageId = firstPageId(nextVolume);
    if (nextPageId) onSelectPage(nextPageId);
    setDeleteVolumeId(null);
    setDeleteVolumeConfirm("");
  }

  function applySnapshot(snapshot: WritingDocumentSnapshot) {
    if (!activeVolume) return;
    updateProject((draft) => {
      const volume = draft.volumes.find((candidate) => candidate.id === activeVolume.id);
      if (!volume) return;
      volume.documentEngine = "superdoc";
      volume.documentText = snapshot.text;
      volume.documentHtml = snapshot.html;
      volume.documentPageCount = snapshot.pageCount;
      volume.documentOutline = snapshot.outline;
    });
  }

  function updateVolumeStatus(status: StudioVolume["status"]) {
    if (!activeVolume) return;
    updateProject((draft) => {
      const volume = draft.volumes.find((candidate) => candidate.id === activeVolume.id);
      if (volume) volume.status = status;
    });
  }

  function insertIntoDocument(text: string) {
    if (!activeVolume) return false;
    return getActiveWritingDocument(activeVolume.id)?.insertText(text) ?? false;
  }

  async function applyVolumeFooter(
    type: StudioVolume["footerType"],
    text: string,
    format: StudioVolume["footerFormat"],
  ) {
    if (!activeVolume) throw new Error("Aucun volume n’est ouvert.");
    const activeDocument = getActiveWritingDocument(activeVolume.id);
    if (!activeDocument) throw new Error("Attendez que le document soit complètement ouvert.");
    await activeDocument.applyFooter(type, text, format);
    updateProject((draft) => {
      const volume = draft.volumes.find((candidate) => candidate.id === activeVolume.id);
      if (!volume) return;
      volume.footerType = type;
      volume.footerText = text;
      volume.footerFormat = format;
    });
  }

  function navigateToHeading(volumeId: string, entry: OutlineEntry) {
    selectVolume(volumeId);
    setNavigationTarget({ text: entry.label, token: Date.now() });
  }

  const renameVolume = project.volumes.find((volume) => volume.id === renameVolumeId);
  const deleteVolume = project.volumes.find((volume) => volume.id === deleteVolumeId);

  return (
    <div
      className={`writing-workspace flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-[#0c0b0f] ${focusMode ? "fixed inset-0 z-50 w-full" : "w-full"}`}
      style={focusMode ? undefined : { height: normalWorkspaceHeight, maxHeight: normalWorkspaceHeight }}
    >
      <header className="shrink-0 border-b border-white/8 bg-[#121117]">
        <div className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{activeVolume?.title ?? "Espace d’écriture 2.1"}</p><p className="text-[11px] text-[#6f6976]">{project.name} · document DOCX natif</p></div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 overflow-x-auto sm:flex">{(Object.keys(counterLabels) as WritingCounterKey[]).filter((key) => settings.writingCounters[key]).map((key) => <Counter key={key} label={counterLabels[key]} value={documentStats[key]} />)}</div>
            <CounterSettings settings={settings} updateSettings={updateSettings} />
            <WritingImportButton onImport={importWriting} />
            <WritingExportButton project={project} initialVolumeId={activeVolume?.id} compact />
            <div className={focusMode ? "" : "lg:hidden"}><Popover><PopoverTrigger asChild><Button size="sm" variant="outline" className="border-white/10"><ListTree /> Plan</Button></PopoverTrigger><PopoverContent align="end" className="max-h-[72svh] w-80 overflow-y-auto border-white/10 bg-[#17151d] p-2 text-[#eeeaf2]"><PopoverHeader className="px-2 py-2"><PopoverTitle>Plan du projet</PopoverTitle></PopoverHeader><OutlinePanel project={project} activeVolumeId={activeVolume?.id ?? null} outlines={outlines} collapsedVolumes={collapsedVolumes} setCollapsedVolumes={setCollapsedVolumes} onSelectVolume={selectVolume} onNavigate={navigateToHeading} /></PopoverContent></Popover></div>
            <Button size="sm" variant="ghost" onClick={onToggleFocus}>{focusMode ? <Minimize2 /> : <Focus />}{focusMode ? "Quitter" : "Focus"}</Button>
          </div>
        </div>

        <Tabs value={activeVolume?.id ?? ""} onValueChange={selectVolume} className="gap-0">
          <div className="flex items-center gap-2 overflow-x-auto border-t border-white/6 px-3 sm:px-5">
            <TabsList variant="line" className="h-10 shrink-0 gap-0 p-0">
              {project.volumes.map((volume) => <div key={volume.id} className="group/tab flex h-10 items-center">
                <TabsTrigger value={volume.id} className="h-10 max-w-52 px-3 text-xs data-[state=active]:text-[#ff8a95]"><BookOpen /><span className="truncate">{volume.title}</span></TabsTrigger>
                <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={`Options de ${volume.title}`} title={`Options de ${volume.title}`} size="icon-xs" variant="ghost" className="-ml-1 opacity-60 group-hover/tab:opacity-100"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => openRenameVolume(volume)}><Pencil /> Renommer</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { setDeleteVolumeId(volume.id); setDeleteVolumeConfirm(""); }}><Trash2 /> Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
              </div>)}
            </TabsList>
            <Button aria-label="Ajouter un volume" title="Ajouter un volume" size="icon-xs" variant="ghost" className="shrink-0" onClick={addVolume}><Plus /></Button>
          </div>
        </Tabs>
        {activeVolume && <WritingDocumentControls
          volume={activeVolume}
          settings={settings}
          onStatusChange={updateVolumeStatus}
          onPaperModeChange={(mode) => updateSettings((draft) => {
            draft.paperColorMode = mode;
            draft.paperBackground = mode === "light" ? "#ffffff" : "#15131a";
          })}
          onInsert={insertIntoDocument}
          onApplyFooter={applyVolumeFooter}
        />}
      </header>

      <div className="flex min-h-0 min-w-0 max-w-full flex-1 overflow-hidden">
        {!focusMode && <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-white/8 bg-[#100f14] p-2 lg:block"><div className="mb-2 flex items-center gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[#77717f]"><ListTree className="size-3.5" /> Plan DOCX</div><OutlinePanel project={project} activeVolumeId={activeVolume?.id ?? null} outlines={outlines} collapsedVolumes={collapsedVolumes} setCollapsedVolumes={setCollapsedVolumes} onSelectVolume={selectVolume} onNavigate={navigateToHeading} /></aside>}
        {!activeVolume ? <EmptyWriting onAdd={addVolume} />
          : documentBlob ? <SuperDocWritingEditor
            key={activeVolume.id}
            projectId={project.id}
            volume={activeVolume}
            settings={settings}
            documentBlob={documentBlob}
            navigationTarget={navigationTarget}
            onSnapshot={applySnapshot}
            onError={(message) => toast.error(message)}
          />
            : <div className="grid flex-1 place-items-center bg-[#28252d] p-8 text-center text-[#8f8996]">{documentError ? <div><FileText className="mx-auto mb-3 size-7" /><p>{documentError}</p><Button className="mt-4" variant="outline" onClick={() => activeVolume && loadOrCreateWritingDocument(project, activeVolume.id).then(setDocumentBlob)}>Réessayer</Button></div> : <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Conversion et ouverture du DOCX…</span>}</div>}
      </div>

      <Dialog open={Boolean(renameVolume)} onOpenChange={(open) => !open && setRenameVolumeId(null)}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Renommer le volume</DialogTitle><DialogDescription className="text-[#9c96a5]">Le nouveau nom sera également utilisé pour le fichier DOCX exporté.</DialogDescription></DialogHeader><Input autoFocus value={renameDraft} className="border-white/10 bg-black/20" onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirmRenameVolume(); }} /><DialogFooter><Button variant="ghost" onClick={() => setRenameVolumeId(null)}>Annuler</Button><Button disabled={!renameDraft.trim()} onClick={confirmRenameVolume}>Renommer</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={Boolean(deleteVolume)} onOpenChange={(open) => { if (!open) { setDeleteVolumeId(null); setDeleteVolumeConfirm(""); } }}><AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><AlertDialogHeader><AlertDialogTitle>Supprimer « {deleteVolume?.title} » ?</AlertDialogTitle><AlertDialogDescription className="text-[#9c96a5]">Le document DOCX local de ce volume sera définitivement supprimé. Saisissez exactement son nom pour confirmer.</AlertDialogDescription></AlertDialogHeader><Input aria-label="Nom du volume à confirmer" value={deleteVolumeConfirm} placeholder={deleteVolume?.title} className="border-white/10 bg-black/20" onChange={(event) => setDeleteVolumeConfirm(event.target.value)} /><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={!deleteVolume || deleteVolumeConfirm !== deleteVolume.title} onClick={confirmDeleteVolume}>Supprimer le volume</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return <span className="shrink-0 rounded-md border border-white/7 bg-white/3 px-2 py-1 text-[11px] text-[#8f8996]"><strong className="font-semibold text-[#d8d3dd]">{value.toLocaleString("fr-FR")}</strong> {label.toLocaleLowerCase("fr")}</span>;
}

function CounterSettings({ settings, updateSettings }: { settings: StudioSettings; updateSettings: (mutate: (draft: StudioSettings) => void) => void }) {
  return <Popover><PopoverTrigger asChild><Button aria-label="Choisir les compteurs" title="Choisir les compteurs" size="icon-xs" variant="ghost"><Settings2 /></Button></PopoverTrigger><PopoverContent align="end" className="w-72 border-white/10 bg-[#1b1821] text-[#eeeaf2]"><PopoverHeader className="mb-4"><PopoverTitle>Compteurs affichés</PopoverTitle></PopoverHeader><div className="grid gap-3">{(Object.keys(counterLabels) as WritingCounterKey[]).map((key) => <label key={key} className="flex cursor-pointer items-center gap-3 text-sm text-[#c8c2cf]"><Checkbox checked={settings.writingCounters[key]} onCheckedChange={(checked) => updateSettings((draft) => { draft.writingCounters[key] = checked === true; })} /><span>{counterLabels[key]}</span></label>)}</div><p className="mt-4 text-[11px] leading-4 text-[#77717f]">Les pages sont comptées par le moteur DOCX, après mise en page.</p></PopoverContent></Popover>;
}

function OutlinePanel({ project, activeVolumeId, outlines, collapsedVolumes, setCollapsedVolumes, onSelectVolume, onNavigate }: {
  project: StudioProject;
  activeVolumeId: string | null;
  outlines: Map<string, OutlineEntry[]>;
  collapsedVolumes: Set<string>;
  setCollapsedVolumes: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSelectVolume: (volumeId: string) => void;
  onNavigate: (volumeId: string, entry: OutlineEntry) => void;
}) {
  return <div className="grid gap-1">{project.volumes.map((volume) => {
    const collapsed = collapsedVolumes.has(volume.id);
    const entries = outlines.get(volume.id) ?? [];
    return <Collapsible key={volume.id} open={!collapsed} onOpenChange={(open) => setCollapsedVolumes((current) => { const next = new Set(current); if (open) next.delete(volume.id); else next.add(volume.id); return next; })}>
      <div className={`flex items-center rounded-lg ${volume.id === activeVolumeId ? "bg-[#ef4f5f]/10 text-[#ff8a95]" : "text-[#aaa4b4] hover:bg-white/5 hover:text-white"}`}>
        <CollapsibleTrigger asChild><button type="button" aria-label={`${collapsed ? "Développer" : "Réduire"} le plan de ${volume.title}`} className="grid size-8 shrink-0 place-items-center rounded-lg">{collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button></CollapsibleTrigger>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2.5 text-left text-xs font-medium" onClick={() => onSelectVolume(volume.id)}><BookOpen className="size-3.5 shrink-0" /><span className="truncate">{volume.title}</span></button>
      </div>
      <CollapsibleContent><div className="ml-4 border-l border-white/7 py-1 pl-2">{entries.length ? entries.map((entry) => <button key={`${entry.headingIndex}-${entry.label}`} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#77717f] hover:bg-white/5 hover:text-[#ddd8e5]" style={{ paddingLeft: `${Math.max(8, (entry.level - 1) * 12 + 8)}px` }} onClick={() => onNavigate(volume.id, entry)}><FileText className="size-3 shrink-0" /><span className="truncate">{entry.label}</span></button>) : <button type="button" className="w-full rounded-md px-2 py-2 text-left text-[11px] italic text-[#5f5a65] hover:text-[#8f8996]" onClick={() => onSelectVolume(volume.id)}>Appliquez les styles Titre 1, 2 ou 3 dans le DOCX.</button>}</div></CollapsibleContent>
    </Collapsible>;
  })}</div>;
}

function extractOutline(volume: StudioVolume): OutlineEntry[] {
  if (volume.documentOutline.length) {
    return volume.documentOutline.map((entry, headingIndex) => ({ ...entry, headingIndex }));
  }
  const html = volume.documentHtml || getVolumePages(volume).map((page) => page.content).join("\n");
  const entries: OutlineEntry[] = [];
  const pattern = /<h([1-4])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const label = stripHtml(match[2]);
    if (label) entries.push({ headingIndex: entries.length, level: Number(match[1]), label });
  }
  return entries;
}

function emptyStats() {
  return { words: 0, paragraphs: 0, pages: 0, characters: 0, symbols: 0 };
}

function EmptyWriting({ onAdd }: { onAdd: () => void }) {
  return <div className="grid flex-1 place-items-center p-8 text-center text-[#8f8996]"><div><BookOpen className="mx-auto mb-3 size-7" /><p>Ajoutez un volume pour commencer à écrire.</p><Button className="mt-4 bg-[#ef4f5f] text-white" onClick={onAdd}><Plus /> Ajouter un volume</Button></div></div>;
}
