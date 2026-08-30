"use client";

import { useState } from "react";
import { BookOpen, Check, FileText, Focus, Minimize2, Palette, Plus, RotateCcw, SlidersHorizontal, Trash2, Type } from "lucide-react";

import { RichTextEditor } from "@/components/studio/rich-text-editor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    onSelectPage(page.id);
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
    onSelectPage(page.id);
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

  const allPages = project.volumes.flatMap((volume) => volume.chapters.flatMap((chapter) => chapter.pages));
  const pageNumber = Math.max(1, allPages.findIndex((page) => page.id === selection?.page.id) + 1);
  const pageFormat = selection?.page.formatOverride ?? project.defaultPageFormat;
  const defaultBackground = pageFormat === "free" ? settings.freeBackground : settings.paperBackground;
  const pageBackground = selection?.page.backgroundOverride ?? defaultBackground;
  const enabledFonts = settings.customFonts.filter((font) => font.enabled);

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
                    {chapter.pages.map((page) => <button key={page.id} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${page.id === selection?.page.id ? "bg-[#ef4f5f]/12 text-[#ff8a95]" : "text-[#77717f] hover:bg-white/4 hover:text-[#c8c2cf]"}`} onClick={() => onSelectPage(page.id)}>{page.status === "done" ? <Check className="size-3.5 text-[#58c68a]" /> : <FileText className="size-3.5" />}<span className="truncate">{page.title}</span></button>)}
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
              <div className="flex items-center gap-2"><span className="text-xs text-[#77717f]">{stripHtml(selection.page.content).split(/\s+/).filter(Boolean).length} mots</span><Button variant={focusMode ? "outline" : "ghost"} size="sm" className="border-white/10" onClick={onToggleFocus}>{focusMode ? <Minimize2 /> : <Focus />}{focusMode ? "Quitter le focus" : "Mode focus"}</Button><Button aria-label="Supprimer la page" title="Supprimer la page" variant="ghost" size="icon-sm" className="text-[#77717f] hover:text-[#ff7885]" onClick={() => setDeletePageId(selection.page.id)}><Trash2 /></Button></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/7 bg-white/2 p-2">
              <Select value={selection.page.status} onValueChange={(status: StudioPage["status"]) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.status = status; })}><SelectTrigger size="sm" className="w-[130px] border-white/10 bg-white/3"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(pageStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={selection.page.typeOverride ?? "inherit"} onValueChange={(value) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.typeOverride = value === "inherit" ? null : value as ProjectType; })}><SelectTrigger size="sm" className="w-[168px] border-white/10 bg-white/3"><Type className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Type : {PROJECT_TYPE_LABELS[project.projectType]}</SelectItem>{Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={selection.page.formatOverride ?? "inherit"} onValueChange={(value) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.formatOverride = value === "inherit" ? null : value as PageFormat; })}><SelectTrigger size="sm" className="w-[180px] border-white/10 bg-white/3"><FileText className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Format : {PAGE_FORMATS[project.defaultPageFormat].label}</SelectItem>{Object.entries(PAGE_FORMATS).map(([value, format]) => <SelectItem key={value} value={value}>{format.label} — {format.detail}</SelectItem>)}</SelectContent></Select>
              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/3 px-2"><Palette className="size-3.5 text-[#8f8996]" /><input aria-label="Couleur de fond" type="color" value={pageBackground} className="size-7 cursor-pointer border-0 bg-transparent" onChange={(event) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.backgroundOverride = event.target.value; })} />{settings.customColors.map((color) => <button key={color} aria-label={`Fond ${color}`} className="size-4 rounded-full border border-white/20" style={{ backgroundColor: color }} onClick={() => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.backgroundOverride = color; })} />)}<Button aria-label="Fond par défaut" title="Fond par défaut" size="icon-xs" variant="ghost" onClick={() => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.backgroundOverride = null; })}><RotateCcw /></Button></div>
              <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/3" onClick={() => setPageSettingsOpen(true)}><SlidersHorizontal /> Pied de page</Button>
            </div>
          </div>
          <RichTextEditor documentId={selection.page.id} html={selection.page.content} format={pageFormat} backgroundColor={pageBackground} customFonts={enabledFonts} enabledStandardFonts={settings.enabledStandardFonts} quoteStyle={settings.quoteStyle} shortcuts={settings.shortcuts} characterShortcuts={settings.characterShortcuts} footerType={selection.page.footerType} footerText={selection.page.footerText} pageNumber={pageNumber} onPageBreak={() => addPage(selection.chapter.id, selection.page.id)} onChange={(content) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.content = content; })} />
        </section>
      ) : <div className="grid flex-1 place-items-center p-8 text-center text-[#8f8996]"><div><BookOpen className="mx-auto mb-3 size-7" /><p>Ajoutez un volume pour commencer à écrire.</p></div></div>}

      <Dialog open={pageSettingsOpen} onOpenChange={setPageSettingsOpen}>
        <DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Options de la page</DialogTitle><DialogDescription className="text-[#9c96a5]">Configurez le pied de page et les conventions typographiques.</DialogDescription></DialogHeader>{selection && <div className="grid gap-4"><label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Pied de page<Select value={selection.page.footerType} onValueChange={(value: FooterType) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.footerType = value; })}><SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Aucun</SelectItem><SelectItem value="page">Numéro de page</SelectItem><SelectItem value="date">Date actuelle</SelectItem><SelectItem value="custom">Texte personnalisé</SelectItem></SelectContent></Select></label>{selection.page.footerType === "custom" && <label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Texte personnalisé<Input value={selection.page.footerText} className="border-white/10 bg-white/4" onChange={(event) => updateProject((draft) => { const target = findPage(draft, selection.page.id); if (target) target.page.footerText = event.target.value; })} /></label>}<label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Guillemets par défaut<Select value={settings.quoteStyle} onValueChange={(value: "straight" | "french") => updateSettings((draft) => { draft.quoteStyle = value; })}><SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="french">« Guillemets français »</SelectItem><SelectItem value="straight">&quot;Guillemets droits&quot;</SelectItem></SelectContent></Select></label></div>}<DialogFooter><Button onClick={() => setPageSettingsOpen(false)}>Terminer</Button></DialogFooter></DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletePageId)} onOpenChange={(open) => !open && setDeletePageId(null)}><AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><AlertDialogHeader><AlertDialogTitle>Supprimer cette page ?</AlertDialogTitle><AlertDialogDescription className="text-[#9c96a5]">Son texte sera supprimé de la copie locale du projet.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDeletePage}>Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
