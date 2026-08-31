"use client";

import { useMemo, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, FileText, Focus, ListTree, Minimize2,
  MoreHorizontal, Pencil, Plus, Settings2, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  RichTextEditor, type RichTextEditorPage, type WritingNavigationTarget,
} from "@/components/studio/rich-text-editor";
import { WritingExportButton } from "@/components/studio/writing-export-button";
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
import {
  createEmptyPage, createEmptyVolume, createId, getVolumePages,
  getWritingDocumentStats, stripHtml, type FooterType,
  type StudioPage, type StudioProject, type StudioSettings, type StudioVolume,
  type WritingColorMode, type WritingCounterKey,
} from "@/lib/studio";

type PageLocation = { volume: StudioVolume; chapterId: string; page: StudioPage };
type OutlineEntry = { pageId: string; headingIndex: number; level: number; label: string };

const counterLabels: Record<WritingCounterKey, string> = {
  words: "Mots",
  paragraphs: "Paragraphes",
  pages: "Pages",
  characters: "Caractères sans espaces",
  symbols: "Symboles avec espaces",
};

const normalWorkspaceHeight = "calc(var(--studio-viewport-height, 100svh) - 4rem)";

function firstPageId(project: StudioProject) {
  return project.volumes.flatMap(getVolumePages)[0]?.id ?? null;
}

function findPage(project: StudioProject, pageId: string | null): PageLocation | null {
  for (const volume of project.volumes) for (const chapter of volume.chapters) {
    const page = chapter.pages.find((candidate) => candidate.id === pageId);
    if (page) return { volume, chapterId: chapter.id, page };
  }
  return null;
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
  const selection = findPage(project, selectedPageId) ?? findPage(project, firstPageId(project));
  const activeVolume = selection?.volume ?? project.volumes[0] ?? null;
  const pages = activeVolume ? getVolumePages(activeVolume) : [];
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set());
  const [navigationTarget, setNavigationTarget] = useState<WritingNavigationTarget | null>(null);
  const [renameVolumeId, setRenameVolumeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteVolumeId, setDeleteVolumeId] = useState<string | null>(null);
  const [deleteVolumeConfirm, setDeleteVolumeConfirm] = useState("");
  const [deletePageId, setDeletePageId] = useState<string | null>(null);

  const documentStats = useMemo(
    () => activeVolume ? getWritingDocumentStats(activeVolume) : { words: 0, paragraphs: 0, pages: 0, characters: 0, symbols: 0 },
    [activeVolume],
  );
  const outlines = useMemo(() => new Map(project.volumes.map((volume) => [volume.id, extractOutline(volume)])), [project.volumes]);
  const activePage = selection?.page ?? pages[0] ?? null;
  const editorPages: RichTextEditorPage[] = pages.map((page, index) => {
    const countedFooterPages = pages.slice(0, index + 1).filter((candidate) => !candidate.ignoreProjectFooter).length;
    const format = page.formatOverride ?? project.defaultPageFormat;
    const isFree = format === "free";
    return {
      id: page.id,
      html: page.content,
      status: page.status,
      typeOverride: page.typeOverride,
      format,
      formatOverride: page.formatOverride,
      backgroundColor: page.backgroundOverride ?? (isFree ? settings.freeBackground : settings.paperBackground),
      colorMode: isFree ? settings.freeColorMode : settings.paperColorMode,
      ignoreFooter: page.ignoreProjectFooter,
      pageNumber: countedFooterPages,
      position: index + 1,
    };
  });

  function goToPage(pageId: string, headingIndex?: number) {
    onSelectPage(pageId);
    setNavigationTarget({ pageId, headingIndex, token: Date.now() });
  }

  function selectVolume(volumeId: string) {
    const volume = project.volumes.find((candidate) => candidate.id === volumeId);
    if (!volume) return;
    const first = getVolumePages(volume)[0];
    if (first) goToPage(first.id);
    else {
      const page = createEmptyPage();
      updateProject((draft) => {
        const target = draft.volumes.find((candidate) => candidate.id === volumeId);
        if (!target) return;
        if (target.chapters[0]) target.chapters[0].pages.push(page);
        else target.chapters.push({ id: createId("chapter"), title: "Contenu", pages: [page] });
      });
      goToPage(page.id);
    }
  }

  function addVolume() {
    const volume = createEmptyVolume(project.volumes.length + 1);
    updateProject((draft) => draft.volumes.push(volume));
    goToPage(getVolumePages(volume)[0].id);
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
    updateProject((draft) => { draft.volumes = draft.volumes.filter((candidate) => candidate.id !== volume.id); });
    const nextPage = nextVolume ? getVolumePages(nextVolume)[0] : undefined;
    if (nextPage) goToPage(nextPage.id);
    setDeleteVolumeId(null);
    setDeleteVolumeConfirm("");
  }

  function addPageAfter(pageId: string, content = "") {
    const source = findPage(project, pageId);
    if (!source) return null;
    const newPage = { ...createEmptyPage(pages.length + 1), content };
    updateProject((draft) => {
      const target = findPage(draft, pageId);
      if (!target) return;
      const chapter = target.volume.chapters.find((candidate) => candidate.id === target.chapterId);
      if (!chapter) return;
      const index = chapter.pages.findIndex((candidate) => candidate.id === pageId);
      chapter.pages.splice(index + 1, 0, newPage);
    });
    goToPage(newPage.id);
    return newPage;
  }

  function moveOverflow(pageId: string, overflowHtml: string) {
    if (!overflowHtml) return;
    const index = pages.findIndex((page) => page.id === pageId);
    const nextPage = pages[index + 1];
    if (!nextPage) { addPageAfter(pageId, overflowHtml); return; }
    updateProject((draft) => {
      const target = findPage(draft, nextPage.id);
      if (target) target.page.content = `${overflowHtml}${target.page.content}`;
    });
    goToPage(nextPage.id);
  }

  function pullPageBackward(previousPageId: string, currentPageId: string, previousHtml: string, currentHtml: string) {
    const removeCurrentPage = !hasMeaningfulEditorHtml(currentHtml);
    updateProject((draft) => {
      const previous = findPage(draft, previousPageId);
      const current = findPage(draft, currentPageId);
      if (!previous || !current) return;
      previous.page.content = previousHtml;
      current.page.content = currentHtml;
      if (removeCurrentPage) {
        const chapter = current.volume.chapters.find((candidate) => candidate.id === current.chapterId);
        if (chapter) chapter.pages = chapter.pages.filter((page) => page.id !== currentPageId);
      }
    });
    onSelectPage(previousPageId);
  }

  function confirmDeletePage() {
    if (!deletePageId || !activeVolume) return;
    const index = pages.findIndex((page) => page.id === deletePageId);
    const adjacent = pages[index + 1] ?? pages[index - 1];
    const replacement = createEmptyPage(1);
    updateProject((draft) => {
      const volume = draft.volumes.find((candidate) => candidate.id === activeVolume.id);
      if (!volume) return;
      volume.chapters.forEach((chapter) => { chapter.pages = chapter.pages.filter((page) => page.id !== deletePageId); });
      if (!getVolumePages(volume).length) {
        if (volume.chapters[0]) volume.chapters[0].pages.push(replacement);
        else volume.chapters.push({ id: createId("chapter"), title: "Contenu", pages: [replacement] });
      }
    });
    goToPage(adjacent?.id ?? replacement.id);
    setDeletePageId(null);
  }

  function updateWritingBackground(color: string) {
    if (!activePage) return;
    const format = activePage.formatOverride ?? project.defaultPageFormat;
    const mode = colorModeFor(color);
    updateSettings((draft) => {
      if (format === "free") { draft.freeBackground = color; draft.freeColorMode = mode; }
      else { draft.paperBackground = color; draft.paperColorMode = mode; }
    });
    updateProject((draft) => {
      draft.volumes.forEach((volume) => volume.chapters.forEach((chapter) => chapter.pages.forEach((page) => {
        const pageFormat = page.formatOverride ?? draft.defaultPageFormat;
        if ((pageFormat === "free") === (format === "free")) page.backgroundOverride = null;
      })));
    });
  }

  function updateWritingColorMode(mode: WritingColorMode) {
    if (!activePage) return;
    const format = activePage.formatOverride ?? project.defaultPageFormat;
    updateSettings((draft) => {
      if (format === "free") { draft.freeColorMode = mode; draft.freeBackground = mode === "light" ? "#ffffff" : "#15131a"; }
      else { draft.paperColorMode = mode; draft.paperBackground = mode === "light" ? "#ffffff" : "#15131a"; }
    });
  }

  const renameVolume = project.volumes.find((volume) => volume.id === renameVolumeId);
  const deleteVolume = project.volumes.find((volume) => volume.id === deleteVolumeId);

  return (
    <div
      className={`writing-workspace flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0b0f] ${focusMode ? "fixed inset-0 z-50" : ""}`}
      style={focusMode ? undefined : { height: normalWorkspaceHeight, maxHeight: normalWorkspaceHeight }}
    >
      <header className="shrink-0 border-b border-white/8 bg-[#121117]">
        <div className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{activeVolume?.title ?? "Espace d’écriture"}</p><p className="text-[11px] text-[#6f6976]">{project.name}</p></div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 overflow-x-auto sm:flex">{(Object.keys(counterLabels) as WritingCounterKey[]).filter((key) => settings.writingCounters[key]).map((key) => <Counter key={key} label={counterLabels[key]} value={documentStats[key]} />)}</div>
            <CounterSettings settings={settings} updateSettings={updateSettings} />
            <WritingExportButton project={project} initialVolumeId={activeVolume?.id} compact />
            <div className={focusMode ? "" : "lg:hidden"}><Popover><PopoverTrigger asChild><Button size="sm" variant="outline" className="border-white/10"><ListTree /> Plan</Button></PopoverTrigger><PopoverContent align="end" className="max-h-[72svh] w-80 overflow-y-auto border-white/10 bg-[#17151d] p-2 text-[#eeeaf2]"><PopoverHeader className="px-2 py-2"><PopoverTitle>Plan du projet</PopoverTitle></PopoverHeader><OutlinePanel project={project} activeVolumeId={activeVolume?.id ?? null} outlines={outlines} collapsedVolumes={collapsedVolumes} setCollapsedVolumes={setCollapsedVolumes} onSelectVolume={selectVolume} onNavigate={goToPage} /></PopoverContent></Popover></div>
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
      </header>

      <div className="flex min-h-0 flex-1">
        {!focusMode && <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-white/8 bg-[#100f14] p-2 lg:block"><div className="mb-2 flex items-center gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[#77717f]"><ListTree className="size-3.5" /> Plan automatique</div><OutlinePanel project={project} activeVolumeId={activeVolume?.id ?? null} outlines={outlines} collapsedVolumes={collapsedVolumes} setCollapsedVolumes={setCollapsedVolumes} onSelectVolume={selectVolume} onNavigate={goToPage} /></aside>}
        {activeVolume && editorPages.length ? <RichTextEditor
          pages={editorPages}
          selectedPageId={activePage?.id ?? null}
          defaultFormat={project.defaultPageFormat}
          defaultProjectType={project.projectType}
          customFonts={settings.customFonts.filter((font) => font.enabled)}
          systemFonts={settings.systemFonts}
          enabledStandardFonts={settings.enabledStandardFonts}
          quoteStyle={settings.quoteStyle}
          shortcuts={settings.shortcuts}
          characterShortcuts={settings.characterShortcuts}
          footerType={project.footerType}
          footerText={project.footerText}
          navigationTarget={navigationTarget}
          onSelectPage={onSelectPage}
          onChange={(pageId, content) => updateProject((draft) => { const target = findPage(draft, pageId); if (target) target.page.content = content; })}
          onPageBreak={(pageId) => { addPageAfter(pageId); }}
          onOverflow={moveOverflow}
          onPullBackward={pullPageBackward}
          onFormatChange={(pageId, format) => updateProject((draft) => { const target = findPage(draft, pageId); if (target) target.page.formatOverride = format; })}
          onTypeChange={(pageId, type) => updateProject((draft) => { const target = findPage(draft, pageId); if (target) target.page.typeOverride = type; })}
          onStatusChange={(pageId, status) => updateProject((draft) => { const target = findPage(draft, pageId); if (target) target.page.status = status; })}
          onBackgroundChange={updateWritingBackground}
          onColorModeChange={updateWritingColorMode}
          onFooterChange={(type: FooterType, text) => updateProject((draft) => { draft.footerType = type; draft.footerText = text; })}
          onToggleIgnoreFooter={(pageId) => updateProject((draft) => { const target = findPage(draft, pageId); if (target) target.page.ignoreProjectFooter = !target.page.ignoreProjectFooter; })}
          onDeletePage={setDeletePageId}
          onError={(message) => toast.error(message)}
        /> : <div className="grid flex-1 place-items-center p-8 text-center text-[#8f8996]"><div><BookOpen className="mx-auto mb-3 size-7" /><p>Ajoutez un volume pour commencer à écrire.</p><Button className="mt-4 bg-[#ef4f5f] text-white" onClick={addVolume}><Plus /> Ajouter un volume</Button></div></div>}
      </div>

      <Dialog open={Boolean(renameVolume)} onOpenChange={(open) => !open && setRenameVolumeId(null)}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Renommer le volume</DialogTitle><DialogDescription className="text-[#9c96a5]">Le nouveau nom sera également utilisé dans les exports.</DialogDescription></DialogHeader><Input autoFocus value={renameDraft} className="border-white/10 bg-black/20" onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirmRenameVolume(); }} /><DialogFooter><Button variant="ghost" onClick={() => setRenameVolumeId(null)}>Annuler</Button><Button disabled={!renameDraft.trim()} onClick={confirmRenameVolume}>Renommer</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={Boolean(deleteVolume)} onOpenChange={(open) => { if (!open) { setDeleteVolumeId(null); setDeleteVolumeConfirm(""); } }}><AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><AlertDialogHeader><AlertDialogTitle>Supprimer « {deleteVolume?.title} » ?</AlertDialogTitle><AlertDialogDescription className="text-[#9c96a5]">Toutes les pages de ce volume seront définitivement retirées de la copie locale. Saisissez exactement son nom pour confirmer.</AlertDialogDescription></AlertDialogHeader><Input aria-label="Nom du volume à confirmer" value={deleteVolumeConfirm} placeholder={deleteVolume?.title} className="border-white/10 bg-black/20" onChange={(event) => setDeleteVolumeConfirm(event.target.value)} /><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={!deleteVolume || deleteVolumeConfirm !== deleteVolume.title} onClick={confirmDeleteVolume}>Supprimer le volume</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AlertDialog open={Boolean(deletePageId)} onOpenChange={(open) => !open && setDeletePageId(null)}><AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><AlertDialogHeader><AlertDialogTitle>Supprimer cette page ?</AlertDialogTitle><AlertDialogDescription className="text-[#9c96a5]">Son texte et ses images seront retirés du volume.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDeletePage}>Supprimer la page</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return <span className="shrink-0 rounded-md border border-white/7 bg-white/3 px-2 py-1 text-[11px] text-[#8f8996]"><strong className="font-semibold text-[#d8d3dd]">{value.toLocaleString("fr-FR")}</strong> {label.toLocaleLowerCase("fr")}</span>;
}

function CounterSettings({ settings, updateSettings }: { settings: StudioSettings; updateSettings: (mutate: (draft: StudioSettings) => void) => void }) {
  return <Popover><PopoverTrigger asChild><Button aria-label="Choisir les compteurs" title="Choisir les compteurs" size="icon-xs" variant="ghost"><Settings2 /></Button></PopoverTrigger><PopoverContent align="end" className="w-72 border-white/10 bg-[#1b1821] text-[#eeeaf2]"><PopoverHeader className="mb-4"><PopoverTitle>Compteurs affichés</PopoverTitle></PopoverHeader><div className="grid gap-3">{(Object.keys(counterLabels) as WritingCounterKey[]).map((key) => <label key={key} className="flex cursor-pointer items-center gap-3 text-sm text-[#c8c2cf]"><Checkbox checked={settings.writingCounters[key]} onCheckedChange={(checked) => updateSettings((draft) => { draft.writingCounters[key] = checked === true; })} /><span>{counterLabels[key]}</span></label>)}</div><p className="mt-4 text-[11px] leading-4 text-[#77717f]">« Symboles » inclut les espaces ; « caractères » les exclut.</p></PopoverContent></Popover>;
}

function OutlinePanel({ project, activeVolumeId, outlines, collapsedVolumes, setCollapsedVolumes, onSelectVolume, onNavigate }: {
  project: StudioProject;
  activeVolumeId: string | null;
  outlines: Map<string, OutlineEntry[]>;
  collapsedVolumes: Set<string>;
  setCollapsedVolumes: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSelectVolume: (volumeId: string) => void;
  onNavigate: (pageId: string, headingIndex?: number) => void;
}) {
  return <div className="grid gap-1">{project.volumes.map((volume) => {
    const collapsed = collapsedVolumes.has(volume.id);
    const entries = outlines.get(volume.id) ?? [];
    return <Collapsible key={volume.id} open={!collapsed} onOpenChange={(open) => setCollapsedVolumes((current) => { const next = new Set(current); if (open) next.delete(volume.id); else next.add(volume.id); return next; })}>
      <div className={`flex items-center rounded-lg ${volume.id === activeVolumeId ? "bg-[#ef4f5f]/10 text-[#ff8a95]" : "text-[#aaa4b4] hover:bg-white/5 hover:text-white"}`}>
        <CollapsibleTrigger asChild><button type="button" aria-label={`${collapsed ? "Développer" : "Réduire"} le plan de ${volume.title}`} className="grid size-8 shrink-0 place-items-center rounded-lg">{collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button></CollapsibleTrigger>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2.5 text-left text-xs font-medium" onClick={() => onSelectVolume(volume.id)}><BookOpen className="size-3.5 shrink-0" /><span className="truncate">{volume.title}</span></button>
      </div>
      <CollapsibleContent><div className="ml-4 border-l border-white/7 py-1 pl-2">{entries.length ? entries.map((entry) => <button key={`${entry.pageId}-${entry.headingIndex}`} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#77717f] hover:bg-white/5 hover:text-[#ddd8e5]" style={{ paddingLeft: `${Math.max(8, (entry.level - 1) * 12 + 8)}px` }} onClick={() => onNavigate(entry.pageId, entry.headingIndex)}><FileText className="size-3 shrink-0" /><span className="truncate">{entry.label}</span></button>) : <button type="button" className="w-full rounded-md px-2 py-2 text-left text-[11px] italic text-[#5f5a65] hover:text-[#8f8996]" onClick={() => onSelectVolume(volume.id)}>Appliquez un style de titre pour créer le plan.</button>}</div></CollapsibleContent>
    </Collapsible>;
  })}</div>;
}

function extractOutline(volume: StudioVolume): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  getVolumePages(volume).forEach((page) => {
    let headingIndex = 0;
    const pattern = /<h([1-4])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(page.content))) {
      const label = stripHtml(match[2]);
      if (label) entries.push({ pageId: page.id, headingIndex, level: Number(match[1]), label });
      headingIndex += 1;
    }
  });
  return entries;
}

function colorModeFor(color: string): WritingColorMode {
  const hex = color.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return "light";
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 145 ? "dark" : "light";
}

function hasMeaningfulEditorHtml(html: string) {
  return Boolean(stripHtml(html) || /<(?:img|hr)\b/i.test(html));
}
