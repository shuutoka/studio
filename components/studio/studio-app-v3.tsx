"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight, FileArchive, FileText, HardDrive, Home, Images, Import, Library,
  Plus, Save, Settings,
} from "lucide-react";
import { toast } from "sonner";

import { GlobalLibrary } from "@/components/studio/global-library";
import { MediaGallery } from "@/components/studio/media-gallery";
import { SettingsView } from "@/components/studio/settings-view";
import {
  HomeView, LoadingView, ProjectWorkspace, sectionItems, type Section,
} from "@/components/studio/studio-app";
import { useProjectFonts } from "@/components/studio/use-project-fonts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { playInterfaceSound } from "@/lib/interface-sound";
import { optimizeImage } from "@/lib/image-optimization";
import {
  authorizeGoogleDrive, downloadGoogleDriveBackup, listGoogleDriveBackups,
  saveBackupToGoogleDrive, type GoogleDriveBackupFile,
} from "@/lib/google-drive";
import { createStudioBackup, downloadStudioBackup, readStudioBackup } from "@/lib/project-file";
import { isShortcutRecorderTarget, matchesShortcut } from "@/lib/shortcuts";
import {
  deleteMedia, deleteStoredProject, loadProjects, loadSettings, persistMedia,
  persistProjects, persistSettings, replaceLocalStudio,
} from "@/lib/studio-db";
import {
  createBlankProject, createDefaultSettings, createId, PROJECT_TYPE_LABELS,
  type ProjectType, type StudioCharacter, type StudioMedia, type StudioProject,
  type StudioSettings,
} from "@/lib/studio";

type GlobalView = "home" | "library" | "media" | "settings";

function firstPageId(project: StudioProject) {
  return project.volumes[0]?.chapters[0]?.pages[0]?.id ?? null;
}

export function StudioAppV3() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [settings, setSettings] = useState<StudioSettings>(createDefaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [startupOpen, setStartupOpen] = useState(true);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [globalView, setGlobalView] = useState<GlobalView>("home");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<ProjectType>("manga");
  const [deleteTarget, setDeleteTarget] = useState<StudioProject | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveBackupFile[] | null>(null);
  const recoveryProjects = useRef<StudioProject[]>([]);
  const recoverySettings = useRef<StudioSettings>(createDefaultSettings());
  const driveTokenRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );
  const hasUnsavedChanges = settings.revision !== settings.savedRevision ||
    projects.some((project) => project.revision !== project.savedRevision);
  const enabledFonts = settings.customFonts.filter((font) => font.enabled);
  useProjectFonts(enabledFonts);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProjects(), loadSettings()])
      .then(([storedProjects, storedSettings]) => {
        if (cancelled) return;
        recoveryProjects.current = storedProjects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        recoverySettings.current = migrateLegacyFonts(storedProjects, storedSettings);
        setBackupAvailable(storedProjects.length > 0 || storedSettings.revision > 1);
      })
      .catch(() => { if (!cancelled) toast.error("La copie locale de secours n’est pas disponible."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      Promise.all([persistProjects(projects), persistSettings(settings)]).catch(() =>
        toast.error("La copie locale de secours n’a pas pu être actualisée."),
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [projects, settings, loaded]);

  useEffect(() => {
    document.documentElement.dataset.studioTheme = settings.theme;
    const scale = settings.zoom / 100;
    document.documentElement.style.setProperty("--studio-zoom", `${scale}`);
    document.documentElement.style.setProperty("--studio-viewport-height", `${100 / scale}svh`);
    return () => {
      delete document.documentElement.dataset.studioTheme;
      document.documentElement.style.removeProperty("--studio-zoom");
      document.documentElement.style.removeProperty("--studio-viewport-height");
    };
  }, [settings.theme, settings.zoom]);

  useEffect(() => {
    if (settings.interfaceSound === "none") return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("button,[role='menuitem'],[role='option']")) playInterfaceSound(settings.interfaceSound);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [settings.interfaceSound]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  }, []);

  const updateActiveProject = useCallback((mutate: (draft: StudioProject) => void) => {
    if (!activeProjectId) return;
    setProjects((current) => current.map((project) => {
      if (project.id !== activeProjectId) return project;
      const next = structuredClone(project);
      mutate(next);
      next.revision = project.revision + 1;
      next.updatedAt = new Date().toISOString();
      return next;
    }));
  }, [activeProjectId]);

  const updateSettings = useCallback((mutate: (draft: StudioSettings) => void) => {
    setSettings((current) => {
      const next = structuredClone(current);
      mutate(next);
      next.revision = current.revision + 1;
      return next;
    });
  }, []);

  const saveAll = useCallback(async () => {
    const projectRevisions = new Map(projects.map((project) => [project.id, project.revision]));
    const settingsRevision = settings.revision;
    try {
      await downloadStudioBackup(projects, settings);
      setProjects((current) => current.map((project) => ({
        ...project,
        savedRevision: Math.max(project.savedRevision, projectRevisions.get(project.id) ?? 0),
      })));
      setSettings((current) => ({
        ...current,
        savedRevision: Math.max(current.savedRevision, settingsRevision),
      }));
      toast.success(`${projects.length} projet${projects.length > 1 ? "s" : ""} sauvegardé${projects.length > 1 ? "s" : ""} dans un seul fichier.`);
    } catch {
      toast.error("La sauvegarde globale n’a pas pu être créée.");
    }
  }, [projects, settings]);

  async function saveAllToDrive() {
    setDriveBusy(true);
    try {
      const token = await authorizeGoogleDrive(settings.googleDriveClientId);
      driveTokenRef.current = token;
      const firstArchive = await createStudioBackup(projects, settings, "efs");
      let driveFile = await saveBackupToGoogleDrive(token, firstArchive.blob, firstArchive.filename, settings.googleDriveFileId || undefined);
      const revision = settings.googleDriveFileId === driveFile.id ? settings.revision : settings.revision + 1;
      const finalSettings = { ...settings, googleDriveFileId: driveFile.id, revision };
      if (settings.googleDriveFileId !== driveFile.id) {
        const finalArchive = await createStudioBackup(projects, finalSettings, "efs");
        driveFile = await saveBackupToGoogleDrive(token, finalArchive.blob, finalArchive.filename, driveFile.id);
      }
      setProjects((current) => current.map((project) => ({ ...project, savedRevision: project.revision })));
      setSettings({ ...finalSettings, savedRevision: finalSettings.revision });
      toast.success(`Sauvegarde .efs enregistrée sur Google Drive : ${driveFile.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La sauvegarde Google Drive a échoué.");
    } finally {
      setDriveBusy(false);
    }
  }

  async function openDriveBackups() {
    setDriveBusy(true);
    try {
      const token = await authorizeGoogleDrive(settings.googleDriveClientId);
      driveTokenRef.current = token;
      const files = await listGoogleDriveBackups(token);
      if (!files.length) toast.message("Aucune sauvegarde .efs accessible n’a été trouvée sur Google Drive.");
      else setDriveFiles(files);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google Drive n’est pas accessible.");
    } finally {
      setDriveBusy(false);
    }
  }

  async function loadDriveBackup(file: GoogleDriveBackupFile) {
    setDriveBusy(true);
    try {
      const token = driveTokenRef.current ?? await authorizeGoogleDrive(settings.googleDriveClientId);
      driveTokenRef.current = token;
      const downloaded = await downloadGoogleDriveBackup(token, file);
      await importBackup(downloaded);
      setSettings((current) => ({ ...current, googleDriveFileId: file.id }));
      setDriveFiles(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cette sauvegarde Drive n’a pas pu être chargée.");
    } finally {
      setDriveBusy(false);
    }
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isShortcutRecorderTarget(event.target)) return;
      if (matchesShortcut(event, settings.shortcuts.save)) {
        event.preventDefault();
        void saveAll();
      } else if (matchesShortcut(event, settings.shortcuts.focus) && activeProject && section === "writing") {
        event.preventDefault();
        setFocusMode((current) => !current);
      } else if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeProject, focusMode, saveAll, section, settings.shortcuts.focus, settings.shortcuts.save]);

  function startEmpty() {
    setProjects([]);
    setSettings(createDefaultSettings());
    setLoaded(true);
    setStartupOpen(false);
  }

  function restoreRecovery() {
    setProjects(recoveryProjects.current);
    setSettings(recoverySettings.current);
    setLoaded(true);
    setStartupOpen(false);
    toast.success("La copie locale de secours a été chargée.");
  }

  const importBackup = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = await readStudioBackup(file);
      const restoredProjects = backup.projects.map((project) => ({ ...project, savedRevision: project.revision }));
      const restoredSettings = { ...backup.settings, savedRevision: backup.settings.revision };
      await replaceLocalStudio(restoredProjects, restoredSettings, backup.media);
      setProjects(restoredProjects);
      setSettings(restoredSettings);
      setActiveProjectId(null);
      setGlobalView("home");
      setLoaded(true);
      setStartupOpen(false);
      setBackupAvailable(true);
      toast.success(`Sauvegarde chargée : ${restoredProjects.length} projet${restoredProjects.length > 1 ? "s" : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    const launchQueue = (window as typeof window & {
      launchQueue?: { setConsumer: (consumer: (params: { files: Array<{ getFile: () => Promise<File> }> }) => void) => void };
    }).launchQueue;
    launchQueue?.setConsumer((params) => {
      const handle = params.files[0];
      if (handle) void handle.getFile().then(importBackup);
    });
  }, [importBackup]);

  function openProject(project: StudioProject, destination: Section = "dashboard") {
    setActiveProjectId(project.id);
    setSection(destination);
    setSelectedPageId(firstPageId(project));
    setSelectedCharacterId(project.characters[0]?.id ?? null);
    setSelectedNoteId(project.notes[0]?.id ?? null);
  }

  function showGlobal(view: GlobalView) {
    setActiveProjectId(null);
    setFocusMode(false);
    setGlobalView(view);
  }

  function createProject() {
    const project = createBlankProject(newProjectName, newProjectType);
    setProjects((current) => [project, ...current]);
    setNewProjectName("");
    setNewProjectType("manga");
    setCreateDialogOpen(false);
    openProject(project, "writing");
    toast.success("Nouveau projet créé.");
  }

  async function uploadMedia(files: File[], kind: StudioMedia["kind"]) {
    if (!activeProjectId || !files.length) return [];
    const optimizedFiles = kind === "font" ? files : await Promise.all(files.map(optimizeImage));
    const media = optimizedFiles.map((file) => ({
      id: createId("media"), projectId: activeProjectId, kind, name: file.name,
      mimeType: file.type || "application/octet-stream", createdAt: new Date().toISOString(), blob: file,
    }) satisfies StudioMedia);
    await persistMedia(media);
    return media.map((item) => item.id);
  }

  async function customizeProjectCard(project: StudioProject, cardColor: string, bannerFile: File | null, removeBanner: boolean) {
    let bannerMediaId = removeBanner ? null : project.bannerMediaId;
    if (bannerFile) {
      const optimized = await optimizeImage(bannerFile);
      const mediaId = createId("media");
      await persistMedia({
        id: mediaId, projectId: project.id, kind: "project-banner", name: optimized.name,
        mimeType: optimized.type || "image/webp", createdAt: new Date().toISOString(), blob: optimized,
      });
      bannerMediaId = mediaId;
    }
    if ((removeBanner || bannerFile) && project.bannerMediaId) await deleteMedia(project.bannerMediaId).catch(() => undefined);
    setProjects((current) => current.map((item) => item.id === project.id ? {
      ...item, cardColor, bannerMediaId, revision: item.revision + 1, updatedAt: new Date().toISOString(),
    } : item));
    toast.success("Carte du projet personnalisée.");
  }

  async function uploadFont(file: File) {
    const mediaId = createId("media");
    await persistMedia({
      id: mediaId, projectId: "__studio__", kind: "font", name: file.name,
      mimeType: file.type || "application/octet-stream", createdAt: new Date().toISOString(), blob: file,
    });
    updateSettings((draft) => { draft.customFonts.push({
      id: createId("font"), name: file.name.replace(/\.(ttf|otf|woff2?|eot)$/i, ""),
      family: `EFCustom-${mediaId.replace(/[^a-zA-Z0-9]/g, "")}`, mediaId, enabled: true,
    }); });
    toast.success("Police ajoutée au Studio.");
  }

  async function removeFont(fontId: string) {
    const font = settings.customFonts.find((item) => item.id === fontId);
    if (!font) return;
    await deleteMedia(font.mediaId).catch(() => undefined);
    updateSettings((draft) => { draft.customFonts = draft.customFonts.filter((item) => item.id !== fontId); });
    toast.success("Police supprimée.");
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    await deleteStoredProject(deleteTarget.id).catch(() => undefined);
    setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
    updateSettings(() => undefined);
    if (activeProjectId === deleteTarget.id) showGlobal("home");
    toast.success(`${deleteTarget.name} a été supprimé de cet appareil.`);
    setDeleteTarget(null);
  }

  function openGlobalCharacter(project: StudioProject, character: StudioCharacter) {
    openProject(project, "characters");
    setSelectedCharacterId(character.id);
  }

  return (
    <SidebarProvider defaultOpen>
      <div className={`studio-shell theme-${settings.theme} flex min-h-svh w-full bg-[#0c0b0f] text-[#eeeaf2]`}>
        <StudioSidebarV3
          activeProject={activeProject} globalView={globalView} section={section}
          recentProjects={projects.slice(0, 4)} dirty={hasUnsavedChanges}
          onGlobal={showGlobal} onOpenProject={openProject} onSectionChange={setSection}
          onCreate={() => setCreateDialogOpen(true)} onSave={() => void saveAll()}
        />
        <SidebarInset className="min-w-0 bg-transparent">
          <StudioTopbarV3 activeProject={activeProject} globalView={globalView} section={section} dirty={hasUnsavedChanges} extension={settings.backupExtension} onHome={() => showGlobal("home")} onSave={() => void saveAll()} />
          {!loaded ? <LoadingView /> : activeProject ? (
            <ProjectWorkspace
              project={activeProject} section={section} selectedPageId={selectedPageId}
              selectedCharacterId={selectedCharacterId} selectedNoteId={selectedNoteId}
              onSelectPage={setSelectedPageId} onSelectCharacter={setSelectedCharacterId}
              onOpenCharacter={(id) => { setSelectedCharacterId(id); setSection("characters"); }}
              onSelectNote={setSelectedNoteId} updateProject={updateActiveProject}
              uploadMedia={uploadMedia} removeMedia={deleteMedia}
              onDeleteProject={() => setDeleteTarget(activeProject)} settings={settings}
              updateSettings={updateSettings} focusMode={focusMode}
              onToggleFocus={() => setFocusMode((current) => !current)}
            />
          ) : globalView === "library" ? (
            <GlobalLibrary projects={projects} onOpenCharacter={openGlobalCharacter} />
          ) : globalView === "media" ? (
            <MediaGallery projects={projects} onOpenProject={(project) => openProject(project)} onOpenCharacter={(project, characterId) => { openProject(project, "characters"); setSelectedCharacterId(characterId); }} />
          ) : globalView === "settings" ? (
            <SettingsView settings={settings} updateSettings={updateSettings} onUploadFont={uploadFont} onRemoveFont={removeFont} onSaveDrive={saveAllToDrive} onLoadDrive={openDriveBackups} driveBusy={driveBusy} />
          ) : (
            <HomeView projects={projects} onCreate={() => setCreateDialogOpen(true)} onImport={() => importInputRef.current?.click()} onOpen={openProject} onDelete={setDeleteTarget} onLibrary={() => showGlobal("library")} onCustomize={customizeProjectCard} />
          )}
        </SidebarInset>
      </div>

      <input ref={importInputRef} className="hidden" type="file" accept=".efs,.zip,.efstudio.zip,application/zip,application/vnd.enfer-fatal-studio" onChange={(event) => void importBackup(event.target.files?.[0])} />

      <Dialog open={startupOpen}>
        <DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]" onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader><div className="mb-2 grid size-12 place-items-center rounded-2xl bg-[#ef4f5f]/12 text-[#ef6977]"><FileArchive className="size-6" /></div><DialogTitle>Ouvrir Enfer Fatal Studio</DialogTitle><DialogDescription className="text-[#9c96a5]">Choisissez les données à charger pour cette session.</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2">
            <Button className="h-auto justify-start gap-4 bg-[#ef4f5f] p-4 text-left text-white hover:bg-[#ff6675]" onClick={() => importInputRef.current?.click()}><Import className="size-5" /><span><span className="block font-semibold">Charger une sauvegarde du PC</span><span className="mt-1 block text-xs font-normal text-white/75">Fichier .efs, .zip ou ancienne archive .efstudio.zip</span></span></Button>
            <Button variant="outline" className="h-auto justify-start gap-4 border-white/10 bg-white/3 p-4 text-left" disabled={!backupAvailable} onClick={restoreRecovery}><HardDrive className="size-5" /><span><span className="block font-semibold">Charger la sauvegarde de secours</span><span className="mt-1 block text-xs font-normal text-[#8f8996]">{backupAvailable ? "Récupérer la dernière copie locale automatique" : "Aucune copie locale disponible"}</span></span></Button>
            <Button variant="ghost" className="h-auto justify-start gap-4 p-4 text-left" onClick={startEmpty}><Plus className="size-5" /><span><span className="block font-semibold">Ne charger aucune donnée</span><span className="mt-1 block text-xs font-normal text-[#77717f]">Commencer cette session avec un espace vide</span></span></Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Nouveau projet</DialogTitle><DialogDescription className="text-[#9c96a5]">Choisissez un type par défaut. Chaque page pourra ensuite utiliser un autre type.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Nom du projet<Input autoFocus value={newProjectName} placeholder="Mon nouveau projet" className="border-white/10 bg-white/4" onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createProject(); }} /></label><label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Type de projet<Select value={newProjectType} onValueChange={(value: ProjectType) => setNewProjectType(value)}><SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label></div><DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button className="bg-[#ef4f5f] text-white" onClick={createProject}><Plus /> Créer le projet</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(driveFiles)} onOpenChange={(open) => !open && setDriveFiles(null)}><DialogContent className="max-h-[82svh] overflow-hidden border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Charger depuis Google Drive</DialogTitle><DialogDescription className="text-[#9c96a5]">Choisissez la sauvegarde .efs qui remplacera les données actuellement ouvertes.</DialogDescription></DialogHeader><div className="max-h-[56svh] space-y-2 overflow-y-auto">{driveFiles?.map((file) => <button key={file.id} type="button" className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-3 text-left hover:border-[#ef4f5f]/35 hover:bg-[#ef4f5f]/6" disabled={driveBusy} onClick={() => void loadDriveBackup(file)}><FileArchive className="size-5 shrink-0 text-[#ef6977]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.name}</span><span className="mt-1 block text-[11px] text-[#77717f]">Modifié {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(file.modifiedTime))}</span></span></button>)}</div><DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><AlertDialogHeader><AlertDialogTitle>Supprimer ce projet de l’appareil ?</AlertDialogTitle><AlertDialogDescription className="text-[#9c96a5]">« {deleteTarget?.name} », ses images et sa copie locale seront supprimés. Un fichier de sauvegarde déjà téléchargé restera intact.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void confirmDeleteProject()}>Supprimer définitivement</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Toaster theme={settings.theme === "light" ? "light" : "dark"} position="bottom-right" richColors />
    </SidebarProvider>
  );
}

function StudioSidebarV3({
  activeProject, globalView, section, recentProjects, dirty, onGlobal, onOpenProject,
  onSectionChange, onCreate, onSave,
}: {
  activeProject: StudioProject | null;
  globalView: GlobalView;
  section: Section;
  recentProjects: StudioProject[];
  dirty: boolean;
  onGlobal: (view: GlobalView) => void;
  onOpenProject: (project: StudioProject) => void;
  onSectionChange: (section: Section) => void;
  onCreate: () => void;
  onSave: () => void;
}) {
  const globalItems = [
    { id: "home" as const, label: "Accueil", icon: Home },
    { id: "library" as const, label: "Personnages", icon: Library },
    { id: "media" as const, label: "Visionneuse", icon: Images },
    { id: "settings" as const, label: "Paramètres", icon: Settings },
  ];
  return <Sidebar collapsible="icon" className="border-r border-white/7 bg-[#111015]"><SidebarHeader className="px-3 py-4"><button className="flex items-center gap-3 rounded-xl p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ef4f5f]" onClick={() => onGlobal("home")}><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ef4f5f] font-black text-white">EF</span><span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block truncate text-sm font-bold">Enfer Fatal Studio</span><span className="block text-[11px] text-[#77717f]">Studio local</span></span></button></SidebarHeader><SidebarSeparator className="bg-white/7" /><SidebarContent><SidebarGroup><SidebarMenu>{globalItems.map((item) => { const Icon = item.icon; return <SidebarMenuItem key={item.id}><SidebarMenuButton tooltip={item.label} isActive={!activeProject && globalView === item.id} onClick={() => onGlobal(item.id)}><Icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>; })}<SidebarMenuItem><SidebarMenuButton tooltip="Nouveau projet" onClick={onCreate}><Plus /><span>Nouveau projet</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>{activeProject ? <SidebarGroup><SidebarGroupLabel className="uppercase tracking-[.12em]">{activeProject.name}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{sectionItems.map((item) => { const Icon = item.icon; return <SidebarMenuItem key={item.id}><SidebarMenuButton tooltip={item.label} isActive={section === item.id} onClick={() => onSectionChange(item.id)}><Icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu></SidebarGroupContent></SidebarGroup> : <SidebarGroup><SidebarGroupLabel className="uppercase tracking-[.12em]">Récents</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{recentProjects.map((project) => <SidebarMenuItem key={project.id}><SidebarMenuButton tooltip={project.name} onClick={() => onOpenProject(project)}><FileText /><span>{project.name}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>}</SidebarContent><SidebarFooter><button className={`flex items-center gap-2 rounded-lg p-2 text-xs group-data-[collapsible=icon]:justify-center ${dirty ? "bg-[#e6b35f]/8 text-[#e6b35f]" : "bg-[#58c68a]/8 text-[#7fc99c]"}`} onClick={onSave}><Save className="size-4" /><span className="group-data-[collapsible=icon]:hidden">{dirty ? "Sauvegarder les projets" : "Tout est enregistré"}</span></button></SidebarFooter><SidebarRail /></Sidebar>;
}

function StudioTopbarV3({ activeProject, globalView, section, dirty, extension, onHome, onSave }: { activeProject: StudioProject | null; globalView: GlobalView; section: Section; dirty: boolean; extension: "efs" | "zip"; onHome: () => void; onSave: () => void }) {
  const sectionName = sectionItems.find((item) => item.id === section)?.label;
  const globalLabel = { home: "Accueil", library: "Personnages", media: "Visionneuse", settings: "Paramètres" }[globalView];
  return <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/7 bg-[#0c0b0f]/92 px-4 backdrop-blur-xl sm:px-6"><SidebarTrigger className="text-[#aaa4b4]" /><div className="flex min-w-0 items-center gap-2 text-sm"><button className="text-[#77717f] hover:text-white" onClick={onHome}>Studio</button><ChevronRight className="size-4 text-[#4e4953]" />{activeProject ? <><span className="max-w-40 truncate font-medium text-[#dcd7e3]">{activeProject.name}</span><ChevronRight className="hidden size-4 text-[#4e4953] sm:block" /><span className="hidden text-[#77717f] sm:block">{sectionName}</span></> : <span className="text-[#dcd7e3]">{globalLabel}</span>}</div><div className="ml-auto flex items-center gap-3"><span className={`hidden items-center gap-2 text-xs sm:flex ${dirty ? "text-[#e6b35f]" : "text-[#7fc99c]"}`}><span className={`size-1.5 rounded-full ${dirty ? "bg-[#e6b35f]" : "bg-[#58c68a]"}`} />{dirty ? "Modifications non sauvegardées" : "Tout est enregistré"}</span><Button size="sm" className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={onSave}><Save /><span className="hidden sm:inline">Sauvegarder .{extension}</span></Button></div></header>;
}

function migrateLegacyFonts(projects: StudioProject[], settings: StudioSettings) {
  const known = new Set(settings.customFonts.map((font) => font.mediaId));
  const fonts = projects.flatMap((project) => project.customFonts).filter((font) => {
    if (known.has(font.mediaId)) return false;
    known.add(font.mediaId);
    return true;
  });
  return fonts.length ? { ...settings, customFonts: [...settings.customFonts, ...fonts] } : settings;
}
