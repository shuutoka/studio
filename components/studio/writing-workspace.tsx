"use client";

import { useState } from "react";
import { BookOpen, Check, FileText, Focus, ListTree, Minimize2, Moon, Plus, RotateCcw, SlidersHorizontal, Sun, Trash2, Type } from "lucide-react";

import { ColorPicker } from "@/components/studio/color-picker";
import { RichTextEditor } from "@/components/studio/rich-text-editor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createEmptyPage, createId, PAGE_FORMATS, PROJECT_TYPE_LABELS, stripHtml,
  type FooterType, type PageFormat, type ProjectType, type StudioChapter,
  type StudioPage, type StudioProject, type StudioSettings, type StudioVolume,
} from "@/lib/studio";

function firstPageId(project: StudioProject) {
  return project.volumes[0]?.chapters[0]?.pages[0]?.id ?? null;
}

function findPage(project: StudioProject, pageId: string | null) {
  for (const volume of project.volumes) for (const chapter of volume.chapters) {
    const page = chapter.pages.find((candidate) => candidate.id === pageId);
    if (page) return { volume, chapter, page };
  }
  return null;
}

const pageStatusLabels = { draft: "Brouillon", review: "À relire", done: "Terminée" };

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
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [focusNavigationOpen, setFocusNavigationOpen] = useState(false);
  const [navigationLanding, setNavigationLanding] = useState<"top" | "bottom">("top");
  const [focusPageId, setFocusPageId] = useState<string | null>(null);
  const allPages = project.volumes.flatMap((volume) => volume.chapters.flatMap((chapter) => chapter.pages));

  function addVolume() {
    const page = createEmptyPage();
    const chapter: StudioChapter = { id: createId("chapter"), title: "Chapitre 1", pages: [page] };
    const volume: StudioVolume = { id: createId("volume"), title: `Volume ${project.volumes.length + 1}`, chapters: [chapter] };
    updateProject((draft) => draft.volumes.push(volume));
    onSelectPage(page.id);
  }

  function addChapter(volumeId: string) {
    const volume = project.volumes.find((candidate) => candidate.id === volumeId);
    const page = createEmptyPage();
    const chapter: StudioChapter = { id: createId("chapter"), title: `Chapitre ${(volume?.chapters.length ?? 0) + 1}`, pages: [page] };
    updateProject((draft) => { draft.volumes.find((candidate) => candidate.id === volumeId)?.chapters.push(chapter); });
    setNavigationLanding("top");
    setFocusPageId(page.id);
    onSelectPage(page.id);
    setFocusNavigationOpen(false);
  }

  function addPage(chapterId: string, afterPageId?: string) {
    const sourceChapter = project.volumes.flatMap((volume) => volume.chapters).find((chapter) => chapter.id === chapterId);
    const page = createEmptyPage((sourceChapter?.pages.length ?? 0) + 1);
    updateProject((draft) => {
      const chapter = draft.volumes.flatMap((volume) => volume.chapters).find((item) => item.id === chapterId);
      if (!chapter) return;
      const index = afterPageId ? chapter.pages.findIndex((item) => item.id === afterPageId) + 1 : chapter.pages.length;
      chapter.pages.splice(Math.max(0, index), 0, page);
    });
    setNavigationLanding("top");
    setFocusPageId(page.id);
    onSelectPage(page.id);
  }

  function selectPage(pageId: string, landing: "top" | "bottom" = "top") {
    setNavigationLanding(landing);
    setFocusPageId(null);
    onSelectPage(pageId);
    setFocusNavigationOpen(false);
  }

  function navigatePage(offset: -1 | 1) {
    if (!selection) return;
    const index = allPages.findIndex((page) => page.id === selection.page.id);
    const target = allPages[index + offset];
    if (target) selectPage(target.id, offset < 0 ? "bottom" : "top");
  }

  function moveOverflowToNextPage(pageId: string, overflowHtml: string) {
    const location = findPage(project, pageId);
    if (!location || !overflowHtml) return;
    const pageIndex = location.chapter.pages.findIndex((page) => page.id === pageId);
    const existingNextPage = location.chapter.pages[pageIndex + 1];
    const nextPage = existingNextPage ?? { ...createEmptyPage(pageIndex + 2), content: overflowHtml };
    updateProject((draft) => {
      const target = findPage(draft, pageId);
      if (!target) return;
      const targetIndex = target.chapter.pages.findIndex((page) => page.id === pageId);
      const followingPage = target.chapter.pages[targetIndex + 1];
      if (followingPage) followingPage.content = `${overflowHtml}${followingPage.content}`;
      else target.chapter.pages.splice(targetIndex + 1, 0, nextPage);
    });
    setNavigationLanding("top");
    setFocusPageId(nextPage.id);
    onSelectPage(nextPage.id);
  }

  function confirmDeletePage() {
    if (!deletePageId) return;
    const allPages = project.volumes.flatMap((volume) => volume.chapters.flatMap((chapter) => chapter.pages));
    const index = allPages.findIndex((page) => page.id === deletePageId);
    const nextPageId = allPages[index + 1]?.id ?? allPages[index - 1]?.id ?? null;
    updateProject((draft) => { draft.volumes.forEach((volume) => volume.chapters.forEach((chapter) => { chapter.pages = chapter.pages.filter((page) => page.id !== deletePageId); })); });
    if (nextPageId) onSelectPage(nextPageId);
    setDeletePageId(null);
  }

  const pageNumber = Math.max(1, allPages.findIndex((page) => page.id === selection?.page.id) + 1);
  const pageFormat = selection?.page.formatOverride ?? project.defaultPageFormat;
  const defaultBackground = pageFormat === "free" ? settings.freeBackground : settings.paperBackground;
  const pageBackground = selection?.page.backgroundOverride ?? defaultBackground;
  const pageColorMode = pageFormat === "free" ? settings.freeColorMode : settings.paperColorMode;
  const enabledFonts = settings.customFonts.filter((font) => font.enabled);

  function updateWritingBackground(color: string) {
    const mode = writingColorModeFor(color);
    updateSettings((draft) => {
      if (pageFormat === "free") {
        draft.freeBackground = color;
        draft.freeColorMode = mode;
      } else {
        draft.paperBackground = color;
        draft.paperColorMode = mode;
      }
    });
    if (selection?.page.backgroundOverride) updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.backgroundOverride = null; });
  }

  function updateWritingColorMode(mode: "light" | "dark") {
    updateSettings((draft) => {
      if (pageFormat === "free") {
        draft.freeColorMode = mode;
        draft.freeBackground = mode === "light" ? "#ffffff" : "#15131a";
      } else {
        draft.paperColorMode = mode;
        draft.paperBackground = mode === "light" ? "#ffffff" : "#15131a";
      }
    });
    if (selection?.page.backgroundOverride) updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.backgroundOverride = null; });
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col bg-[#0c0b0f] lg:flex-row ${focusMode ? "fixed inset-0 z-50" : ""}`}>
      {!focusMode && (
        <aside className="shrink-0 border-b border-white/7 bg-[#100f14] lg:w-72 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between border-b border-white/7 px-4 py-3"><span className="text-xs font-semibold uppercase tracking-[.15em] text-[#8f8996]">Manuscrit</span><Button aria-label="Ajouter un volume" title="Ajouter un volume" size="icon-xs" variant="ghost" onClick={addVolume}><Plus /></Button></div>
          <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[calc(100svh-7.2rem)]">
            {project.volumes.map((volume) => (
              <div key={volume.id} className="mb-3">
                <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-[#c8c2cf]"><BookOpen className="size-3.5 text-[#ef6977]" /><span className="truncate">{volume.title}</span><Button aria-label={`Ajouter un chapitre à ${volume.title}`} title="Ajouter un chapitre" variant="ghost" size="icon-xs" className="ml-auto text-[#77717f]" onClick={() => addChapter(volume.id)}><Plus /></Button></div>
                {volume.chapters.map((chapter) => (
                  <div key={chapter.id} className="ml-3 border-l border-white/7 pl-2">
                    <div className="flex items-center gap-1 px-2 py-1.5 text-xs text-[#8f8996]"><span className="truncate">{chapter.title}</span><Button aria-label={`Ajouter une page à ${chapter.title}`} title="Ajouter une page" variant="ghost" size="icon-xs" className="ml-auto text-[#77717f]" onClick={() => addPage(chapter.id)}><Plus /></Button></div>
                    {chapter.pages.map((page) => <button key={page.id} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${page.id === selection?.page.id ? "bg-[#ef4f5f]/12 text-[#ff8a95]" : "text-[#77717f] hover:bg-white/4 hover:text-[#c8c2cf]"}`} onClick={() => selectPage(page.id)}>{page.status === "done" ? <Check className="size-3.5 text-[#58c68a]" /> : <FileText className="size-3.5" />}<span className="truncate">{page.title}</span></button>)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      )}

      {selection ? (
        <section className={`flex min-h-0 min-w-0 flex-1 flex-col ${focusMode ? "p-3 sm:p-5" : "p-4 sm:p-6 lg:p-8"}`}>
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input aria-label="Titre de la page" value={selection.page.title} className="h-auto flex-1 border-0 bg-transparent px-0 text-xl font-semibold text-white shadow-none focus-visible:ring-0" onChange={(event) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.title = event.target.value; })} />
              <div className="flex items-center gap-2"><span className="text-xs text-[#77717f]">{stripHtml(selection.page.content).split(/\s+/).filter(Boolean).length} mots</span>{focusMode && <Popover open={focusNavigationOpen} onOpenChange={setFocusNavigationOpen}><PopoverTrigger asChild><Button size="sm" variant="outline" className="border-white/10"><ListTree /> Sommaire</Button></PopoverTrigger><PopoverContent align="end" className="max-h-[72svh] w-80 overflow-y-auto border-white/10 bg-[#17151d] p-2 text-[#eeeaf2]">{project.volumes.map((volume) => <div key={volume.id} className="mb-3"><div className="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-[#c8c2cf]"><BookOpen className="size-3.5 text-[#ef6977]" /><span className="min-w-0 flex-1 truncate">{volume.title}</span><Button aria-label={`Ajouter un chapitre à ${volume.title}`} title="Ajouter un chapitre" size="icon-xs" variant="ghost" onClick={() => addChapter(volume.id)}><Plus /></Button></div>{volume.chapters.map((chapter) => <div key={chapter.id} className="ml-3 border-l border-white/8 pl-2"><div className="px-2 py-1 text-[11px] font-medium text-[#8f8996]">{chapter.title}</div>{chapter.pages.map((page) => <button key={page.id} type="button" className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${page.id === selection.page.id ? "bg-[#ef4f5f]/12 text-[#ff8a95]" : "text-[#77717f] hover:bg-white/5 hover:text-white"}`} onClick={() => selectPage(page.id)}><FileText className="size-3" /><span className="truncate">{page.title}</span></button>)}</div>)}</div>)}</PopoverContent></Popover>}<Button variant={focusMode ? "outline" : "ghost"} size="sm" className="border-white/10" onClick={onToggleFocus}>{focusMode ? <Minimize2 /> : <Focus />}{focusMode ? "Quitter le focus" : "Mode focus"}</Button><Button aria-label="Supprimer la page" title="Supprimer la page" variant="ghost" size="icon-sm" className="text-[#77717f] hover:text-[#ff7885]" onClick={() => setDeletePageId(selection.page.id)}><Trash2 /></Button></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/7 bg-white/2 p-2">
              <Select value={selection.page.status} onValueChange={(status: StudioPage["status"]) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.status = status; })}><SelectTrigger size="sm" className="w-[130px] border-white/10 bg-white/3"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(pageStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={selection.page.typeOverride ?? "inherit"} onValueChange={(value) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.typeOverride = value === "inherit" ? null : value as ProjectType; })}><SelectTrigger size="sm" className="w-[168px] border-white/10 bg-white/3"><Type className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Type : {PROJECT_TYPE_LABELS[project.projectType]}</SelectItem>{Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={selection.page.formatOverride ?? "inherit"} onValueChange={(value) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.formatOverride = value === "inherit" ? null : value as PageFormat; })}><SelectTrigger size="sm" className="w-[180px] border-white/10 bg-white/3"><FileText className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Format : {PAGE_FORMATS[project.defaultPageFormat].label}</SelectItem>{Object.entries(PAGE_FORMATS).map(([value, format]) => <SelectItem key={value} value={value}>{format.label} — {format.detail}</SelectItem>)}</SelectContent></Select>
              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/3 px-1.5"><Button aria-label="Mode clair" title="Mode clair" aria-pressed={pageColorMode === "light"} size="icon-xs" variant={pageColorMode === "light" ? "default" : "ghost"} className={pageColorMode === "light" ? "bg-[#ef4f5f] text-white" : ""} onClick={() => updateWritingColorMode("light")}><Sun /></Button><Button aria-label="Mode sombre" title="Mode sombre" aria-pressed={pageColorMode === "dark"} size="icon-xs" variant={pageColorMode === "dark" ? "default" : "ghost"} className={pageColorMode === "dark" ? "bg-[#ef4f5f] text-white" : ""} onClick={() => updateWritingColorMode("dark")}><Moon /></Button><ColorPicker label="Couleur de fond" value={pageBackground} onChange={updateWritingBackground} />{settings.customColors.map((color) => <button key={color} aria-label={`Fond ${color}`} className="size-4 rounded-full border border-white/20" style={{ backgroundColor: color }} onClick={() => updateWritingBackground(color)} />)}<Button aria-label="Fond par défaut" title="Fond par défaut" size="icon-xs" variant="ghost" onClick={() => updateWritingColorMode(pageColorMode)}><RotateCcw /></Button></div>
              <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/3" onClick={() => setPageSettingsOpen(true)}><SlidersHorizontal /> Paramètres rapides</Button>
            </div>
          </div>
          <RichTextEditor documentId={selection.page.id} html={selection.page.content} format={pageFormat} backgroundColor={pageBackground} colorMode={pageColorMode} customFonts={enabledFonts} enabledStandardFonts={settings.enabledStandardFonts} quoteStyle={settings.quoteStyle} shortcuts={settings.shortcuts} characterShortcuts={settings.characterShortcuts} footerType={selection.page.ignoreProjectFooter ? "none" : project.footerType} footerText={project.footerText} pageNumber={pageNumber} navigationLanding={navigationLanding} autoFocus={focusPageId === selection.page.id} onNavigatePrevious={allPages.findIndex((page) => page.id === selection.page.id) > 0 ? () => navigatePage(-1) : undefined} onNavigateNext={allPages.findIndex((page) => page.id === selection.page.id) < allPages.length - 1 ? () => navigatePage(1) : undefined} onOverflow={(overflow) => moveOverflowToNextPage(selection.page.id, overflow)} onPageBreak={() => addPage(selection.chapter.id, selection.page.id)} onChange={(content) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.content = content; })} />
        </section>
      ) : <div className="grid flex-1 place-items-center p-8 text-center text-[#8f8996]"><div><BookOpen className="mx-auto mb-3 size-7" /><p>Ajoutez un volume pour commencer à écrire.</p></div></div>}

      <Dialog open={pageSettingsOpen} onOpenChange={setPageSettingsOpen}>
        <DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Paramètres rapides</DialogTitle><DialogDescription className="text-[#9c96a5]">Le pied de page s’applique à toutes les pages du projet, sauf celles que vous choisissez d’ignorer.</DialogDescription></DialogHeader>{selection && <div className="grid gap-4"><label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Pied de page du projet<Select value={project.footerType} onValueChange={(value: FooterType) => updateProject((draft) => { draft.footerType = value; })}><SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Aucun</SelectItem><SelectItem value="page">Numéro de page</SelectItem><SelectItem value="date">Date actuelle</SelectItem><SelectItem value="custom">Texte personnalisé</SelectItem></SelectContent></Select></label>{project.footerType === "custom" && <label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Texte personnalisé<Input value={project.footerText} className="border-white/10 bg-white/4" onChange={(event) => updateProject((draft) => { draft.footerText = event.target.value; })} /></label>}<div className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/15 p-4"><div><p className="text-sm font-medium text-white">Ignorer la page actuelle</p><p className="mt-1 text-xs text-[#77717f]">Masque le pied de page uniquement sur « {selection.page.title} ».</p></div><Switch checked={selection.page.ignoreProjectFooter} onCheckedChange={(checked) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.ignoreProjectFooter = checked; })} /></div><label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Guillemets par défaut<Select value={settings.quoteStyle} onValueChange={(value: "straight" | "french") => updateSettings((draft) => { draft.quoteStyle = value; })}><SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="french">« Guillemets français »</SelectItem><SelectItem value="straight">&quot;Guillemets droits&quot;</SelectItem></SelectContent></Select></label></div>}<DialogFooter><Button onClick={() => setPageSettingsOpen(false)}>Terminer</Button></DialogFooter></DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletePageId)} onOpenChange={(open) => !open && setDeletePageId(null)}><AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><AlertDialogHeader><AlertDialogTitle>Supprimer cette page ?</AlertDialogTitle><AlertDialogDescription className="text-[#9c96a5]">Son texte sera supprimé de la copie locale du projet.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDeletePage}>Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function writingColorModeFor(color: string): "light" | "dark" {
  const hex = color.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return "light";
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 145 ? "dark" : "light";
}
