"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileText,
  FolderOpen,
  Home,
  Import,
  LayoutDashboard,
  Library,
  Network,
  NotebookPen,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { CharacterManager } from "@/components/studio/character-manager";
import { BoardsWorkspace } from "@/components/studio/boards-workspace";
import { MediaPreview } from "@/components/studio/media-preview";
import { GlobalLibrary } from "@/components/studio/global-library";
import { GoalsBoard } from "@/components/studio/goals-board";
import { useProjectFonts } from "@/components/studio/use-project-fonts";
import { WritingExportButton } from "@/components/studio/writing-export-button";
import { WritingWorkspace } from "@/components/studio/writing-workspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import {
  deleteMedia,
  deleteStoredProject,
  loadProjects,
  persistMedia,
  persistProjects,
} from "@/lib/studio-db";
import { downloadProject, readProjectFile } from "@/lib/project-file";
import { optimizeImage } from "@/lib/image-optimization";
import {
  createBlankProject,
  createDefaultSettings,
  createDemoProject,
  createId,
  getProjectStats,
  PAGE_FORMATS,
  PROJECT_TYPE_LABELS,
  type PageFormat,
  type ProjectType,
  type StudioCharacter,
  type StudioMedia,
  type StudioProject,
  type StudioSettings,
} from "@/lib/studio";

export type Section = "dashboard" | "writing" | "characters" | "boards" | "notes";
type GlobalView = "home" | "library" | "media" | "settings";

export const sectionItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "writing", label: "Écriture", icon: BookOpen },
  { id: "characters", label: "Personnages", icon: Users },
  { id: "boards", label: "Tableaux", icon: Network },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

const projectStatusLabels = {
  idea: "Idée",
  draft: "Brouillon",
  revision: "Révision",
  done: "Terminé",
};

function firstPageId(project: StudioProject) {
  return project.volumes[0]?.chapters[0]?.pages[0]?.id ?? null;
}

function formatDate(value: string) {
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

export function StudioApp() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [globalView, setGlobalView] = useState<GlobalView>("home");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<ProjectType>("manga");
  const [deleteTarget, setDeleteTarget] = useState<StudioProject | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );
  const hasUnsavedProjects = projects.some(
    (project) => project.revision !== project.savedRevision,
  );

  useProjectFonts(activeProject?.customFonts ?? []);

  useEffect(() => {
    let cancelled = false;
    loadProjects()
      .then(async (storedProjects) => {
        if (cancelled) return;
        if (storedProjects.length) {
          setProjects(storedProjects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        } else {
          const demo = createDemoProject();
          setProjects([demo]);
          await persistProjects([demo]);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([createDemoProject()]);
          setLoaded(true);
          toast.error("Le stockage local n’est pas disponible dans ce navigateur.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      persistProjects(projects).catch(() =>
        toast.error("La copie de récupération locale n’a pas pu être actualisée."),
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [projects, loaded]);

  useEffect(() => {
    if (!hasUnsavedProjects) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedProjects]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    }
  }, []);

  const updateActiveProject = useCallback(
    (mutate: (draft: StudioProject) => void) => {
      if (!activeProjectId) return;
      setProjects((current) =>
        current.map((project) => {
          if (project.id !== activeProjectId) return project;
          const next = structuredClone(project);
          mutate(next);
          next.revision = project.revision + 1;
          next.updatedAt = new Date().toISOString();
          return next;
        }),
      );
    },
    [activeProjectId],
  );

  const saveProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) return;
      try {
        const savedProject = { ...project, savedRevision: project.revision };
        await downloadProject(savedProject);
        setProjects((current) =>
          current.map((candidate) =>
            candidate.id === project.id
              ? {
                  ...candidate,
                  savedRevision: Math.max(candidate.savedRevision, project.revision),
                }
              : candidate,
          ),
        );
        toast.success(`${project.name} a été sauvegardé.`);
      } catch {
        toast.error("La sauvegarde n’a pas pu être créée.");
      }
    },
    [projects],
  );

  useEffect(() => {
    const saveWithShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (activeProjectId) void saveProject(activeProjectId);
      }
    };
    window.addEventListener("keydown", saveWithShortcut);
    return () => window.removeEventListener("keydown", saveWithShortcut);
  }, [activeProjectId, saveProject]);

  function openProject(project: StudioProject, destination: Section = "dashboard") {
    setActiveProjectId(project.id);
    setSection(destination);
    setSelectedPageId(firstPageId(project));
    setSelectedCharacterId(project.characters[0]?.id ?? null);
    setSelectedNoteId(project.notes[0]?.id ?? null);
  }

  function showHome() {
    setActiveProjectId(null);
    setGlobalView("home");
  }

  function showLibrary() {
    setActiveProjectId(null);
    setGlobalView("library");
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

  async function importProject(file: File | undefined) {
    if (!file) return;
    try {
      const { project, media } = await readProjectFile(file);
      if (media.length) await persistMedia(media);
      setProjects((current) => {
        const exists = current.some((candidate) => candidate.id === project.id);
        return exists
          ? current.map((candidate) => (candidate.id === project.id ? project : candidate))
          : [project, ...current];
      });
      openProject(project);
      toast.success(`${project.name} a été importé.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function uploadMedia(files: File[], kind: StudioMedia["kind"]) {
    if (!activeProjectId || !files.length) return [];
    const optimizedFiles = kind === "font" ? files : await Promise.all(files.map(optimizeImage));
    const media = optimizedFiles.map((file) => ({
      id: createId("media"),
      projectId: activeProjectId,
      kind,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      createdAt: new Date().toISOString(),
      blob: file,
    }) satisfies StudioMedia);
    await persistMedia(media);
    return media.map((item) => item.id);
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    await deleteStoredProject(deleteTarget.id).catch(() => undefined);
    setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
    if (activeProjectId === deleteTarget.id) showHome();
    toast.success(`${deleteTarget.name} a été supprimé de cet appareil.`);
    setDeleteTarget(null);
  }

  function openGlobalCharacter(project: StudioProject, character: StudioCharacter) {
    openProject(project, "characters");
    setSelectedCharacterId(character.id);
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="studio-shell flex min-h-svh w-full bg-[#0c0b0f] text-[#eeeaf2]">
        <StudioSidebar
          activeProject={activeProject}
          globalView={globalView}
          section={section}
          recentProjects={projects.slice(0, 4)}
          onHome={showHome}
          onLibrary={showLibrary}
          onOpenProject={openProject}
          onSectionChange={setSection}
          onCreate={() => setCreateDialogOpen(true)}
        />

        <SidebarInset className="min-w-0 bg-transparent">
          <StudioTopbar
            activeProject={activeProject}
            globalView={globalView}
            section={section}
            onHome={showHome}
            onSave={() => activeProject && void saveProject(activeProject.id)}
          />

          {!loaded ? (
            <LoadingView />
          ) : activeProject ? (
            <ProjectWorkspace
              project={activeProject}
              section={section}
              selectedPageId={selectedPageId}
              selectedCharacterId={selectedCharacterId}
              selectedNoteId={selectedNoteId}
              onSelectPage={setSelectedPageId}
              onSelectCharacter={setSelectedCharacterId}
              onSelectNote={setSelectedNoteId}
              updateProject={updateActiveProject}
              uploadMedia={uploadMedia}
              removeMedia={deleteMedia}
              onDeleteProject={() => setDeleteTarget(activeProject)}
            />
          ) : globalView === "library" ? (
            <GlobalLibrary projects={projects} onOpenCharacter={openGlobalCharacter} />
          ) : (
            <HomeView
              projects={projects}
              onCreate={() => setCreateDialogOpen(true)}
              onImport={() => importInputRef.current?.click()}
              onOpen={openProject}
              onDelete={setDeleteTarget}
              onLibrary={showLibrary}
            />
          )}
        </SidebarInset>
      </div>

      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".zip,.efstudio.zip,application/zip"
        onChange={(event) => void importProject(event.target.files?.[0])}
      />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
            <DialogDescription className="text-[#9c96a5]">
              Choisissez un type par défaut. Chaque page pourra ensuite utiliser un autre type.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Nom du projet">
              <Input
                autoFocus
                value={newProjectName}
                placeholder="Mon nouveau projet"
                className="border-white/10 bg-white/4"
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createProject();
                }}
              />
            </Field>
            <Field label="Type de projet">
              <Select value={newProjectType} onValueChange={(value: ProjectType) => setNewProjectType(value)}>
                <SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose>
            <Button className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={createProject}>
              <Plus /> Créer le projet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce projet de l’appareil ?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#9c96a5]">
              « {deleteTarget?.name} », ses images, polices et sa copie de récupération locale seront supprimés. Une archive déjà téléchargée restera intacte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDeleteProject()}>Supprimer définitivement</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster theme="dark" position="bottom-right" richColors />
    </SidebarProvider>
  );
}

function StudioSidebar({
  activeProject,
  globalView,
  section,
  recentProjects,
  onHome,
  onLibrary,
  onOpenProject,
  onSectionChange,
  onCreate,
}: {
  activeProject: StudioProject | null;
  globalView: GlobalView;
  section: Section;
  recentProjects: StudioProject[];
  onHome: () => void;
  onLibrary: () => void;
  onOpenProject: (project: StudioProject) => void;
  onSectionChange: (section: Section) => void;
  onCreate: () => void;
}) {
  return (
    <Sidebar collapsible="icon" className="border-r border-white/7 bg-[#111015]">
      <SidebarHeader className="px-3 py-4">
        <button className="flex items-center gap-3 rounded-xl p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ef4f5f]" onClick={onHome}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ef4f5f] font-black text-white shadow-[0_8px_24px_rgba(239,79,95,.22)]">EF</span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-bold">Enfer Fatal Studio</span>
            <span className="block text-[11px] text-[#77717f]">Studio local</span>
          </span>
        </button>
      </SidebarHeader>
      <SidebarSeparator className="bg-white/7" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Accueil" isActive={!activeProject && globalView === "home"} onClick={onHome}><Home /><span>Accueil</span></SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Bibliothèque générale" isActive={!activeProject && globalView === "library"} onClick={onLibrary}><Library /><span>Bibliothèque</span></SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Nouveau projet" onClick={onCreate}><Plus /><span>Nouveau projet</span></SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {activeProject ? (
          <SidebarGroup>
            <SidebarGroupLabel className="uppercase tracking-[.12em]">{activeProject.name}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sectionItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton tooltip={item.label} isActive={section === item.id} onClick={() => onSectionChange(item.id)}><Icon /><span>{item.label}</span></SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel className="uppercase tracking-[.12em]">Récents</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentProjects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton tooltip={project.name} onClick={() => onOpenProject(project)}><FileText /><span>{project.name}</span></SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg bg-white/3 p-2 text-xs text-[#77717f] group-data-[collapsible=icon]:justify-center">
          <span className="size-2 shrink-0 rounded-full bg-[#58c68a]" /><span className="group-data-[collapsible=icon]:hidden">Copie locale active</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function StudioTopbar({
  activeProject,
  globalView,
  section,
  onHome,
  onSave,
}: {
  activeProject: StudioProject | null;
  globalView: GlobalView;
  section: Section;
  onHome: () => void;
  onSave: () => void;
}) {
  const isDirty = activeProject ? activeProject.revision !== activeProject.savedRevision : false;
  const sectionName = sectionItems.find((item) => item.id === section)?.label;
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/7 bg-[#0c0b0f]/92 px-4 backdrop-blur-xl sm:px-6">
      <SidebarTrigger className="text-[#aaa4b4]" />
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button className="text-[#77717f] hover:text-white" onClick={onHome}>Projets</button>
        {activeProject ? (
          <>
            <ChevronRight className="size-4 text-[#4e4953]" />
            <span className="max-w-40 truncate font-medium text-[#dcd7e3] sm:max-w-none">{activeProject.name}</span>
            <ChevronRight className="hidden size-4 text-[#4e4953] sm:block" />
            <span className="hidden text-[#77717f] sm:block">{sectionName}</span>
          </>
        ) : globalView === "library" ? (
          <><ChevronRight className="size-4 text-[#4e4953]" /><span className="text-[#dcd7e3]">Bibliothèque</span></>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {activeProject && (
          <>
            <span className={`hidden items-center gap-2 text-xs sm:flex ${isDirty ? "text-[#e6b35f]" : "text-[#7fc99c]"}`}>
              <span className={`size-1.5 rounded-full ${isDirty ? "bg-[#e6b35f]" : "bg-[#58c68a]"}`} />
              {isDirty ? "Non enregistré" : "Enregistré"}
            </span>
            <Button size="sm" className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={onSave}><Save /><span className="hidden sm:inline">Sauvegarder</span></Button>
          </>
        )}
      </div>
    </header>
  );
}

export function LoadingView() {
  return <div className="grid flex-1 place-items-center p-8"><div className="text-center"><div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-white/10 border-t-[#ef4f5f]" /><p className="text-sm text-[#8f8996]">Ouverture de votre espace…</p></div></div>;
}

export function HomeView({
  projects,
  onCreate,
  onImport,
  onOpen,
  onDelete,
  onLibrary,
  onCustomize,
}: {
  projects: StudioProject[];
  onCreate: () => void;
  onImport: () => void;
  onOpen: (project: StudioProject) => void;
  onDelete: (project: StudioProject) => void;
  onLibrary: () => void;
  onCustomize?: (project: StudioProject, cardColor: string, bannerFile: File | null, removeBanner: boolean) => Promise<void> | void;
}) {
  const [customizing, setCustomizing] = useState<StudioProject | null>(null);
  const [customColor, setCustomColor] = useState("#4d1824");
  const [customBanner, setCustomBanner] = useState<File | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const totals = projects.reduce((result, project) => {
    const stats = getProjectStats(project);
    result.pages += stats.pages;
    result.words += stats.words;
    result.characters += stats.characters;
    return result;
  }, { pages: 0, words: 0, characters: 0 });

  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
      <div className="mx-auto max-w-7xl">
        <section className="mb-9 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]"><Sparkles className="size-3.5" /> Atelier narratif</div>
            <h1 className="text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">Bienvenue dans votre espace de création.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#96909e] sm:text-base">Reprenez un manuscrit, développez vos personnages ou ouvrez une sauvegarde. Tout reste sur cet appareil.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="border-white/10 bg-white/3 text-[#ddd8e5] hover:bg-white/7 hover:text-white" onClick={onLibrary}><Library /> Bibliothèque</Button>
            <Button variant="outline" className="border-white/10 bg-white/3 text-[#ddd8e5] hover:bg-white/7 hover:text-white" onClick={onImport}><Import /> Ouvrir une sauvegarde</Button>
            <Button className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={onCreate}><Plus /> Nouveau projet</Button>
          </div>
        </section>

        <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={FolderOpen} label="Projets" value={projects.length.toLocaleString("fr-FR")} />
          <StatTile icon={FileText} label="Pages" value={totals.pages.toLocaleString("fr-FR")} />
          <StatTile icon={NotebookPen} label="Mots" value={totals.words.toLocaleString("fr-FR")} />
          <StatTile icon={CircleUserRound} label="Personnages" value={totals.characters.toLocaleString("fr-FR")} />
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Vos projets</h2><span className="text-xs text-[#77717f]">{projects.length} au total</span></div>
          {projects.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const stats = getProjectStats(project);
                const dirty = project.revision !== project.savedRevision;
                return (
                  <article key={project.id} className="group overflow-hidden rounded-2xl border border-white/8 bg-[#131218] transition-all hover:-translate-y-0.5 hover:border-white/14 hover:bg-[#17151d]">
                    <button className="w-full text-left" onClick={() => onOpen(project)}>
                      <div className="relative h-28 overflow-hidden" style={{ background: `linear-gradient(135deg, ${project.cardColor}, #111218)` }}>
                        {project.bannerMediaId && <MediaPreview mediaId={project.bannerMediaId} alt={`Bannière de ${project.name}`} className="absolute inset-0 size-full opacity-75" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                        <div className="absolute -right-4 -bottom-11 size-32 rounded-full border border-white/8" /><div className="absolute right-7 -bottom-14 size-32 rounded-full border border-white/5" /><BookOpen className="absolute bottom-4 left-5 size-7 text-white/72" />
                        <span className="absolute top-4 right-4 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-white/70 backdrop-blur">{PROJECT_TYPE_LABELS[project.projectType]}</span>
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="truncate font-semibold text-white">{project.name}</h3><p className="mt-1 flex items-center gap-1.5 text-xs text-[#77717f]"><Clock3 className="size-3" /> Modifié {formatDate(project.updatedAt)}</p></div>{dirty && <span className="mt-1 size-2 shrink-0 rounded-full bg-[#e6b35f]" title="Non enregistré" />}</div>
                        <div className="mt-5"><div className="mb-2 flex justify-between text-xs"><span className="text-[#8f8996]">Progression</span><span className="font-medium text-[#dcd7e3]">{stats.progress}%</span></div><Progress value={stats.progress} className="h-1.5 bg-white/7 [&>div]:bg-[#ef4f5f]" /></div>
                        <div className="mt-4 flex gap-4 text-xs text-[#77717f]"><span>{stats.pages} pages</span><span>{stats.words.toLocaleString("fr-FR")} mots</span><span>{stats.characters} pers.</span></div>
                      </div>
                    </button>
                    <div className="flex justify-between border-t border-white/7 px-3 py-2">
                      <Button variant="ghost" size="sm" className="text-[#aaa4b4] hover:bg-white/6 hover:text-white" onClick={() => onOpen(project)}>Ouvrir <ChevronRight /></Button>
                      <div className="flex"><Button variant="ghost" size="sm" className="text-[#aaa4b4] hover:bg-white/6 hover:text-white" onClick={() => { setCustomizing(project); setCustomColor(project.cardColor); setCustomBanner(null); setRemoveBanner(false); }}><Settings2 /> Personnaliser</Button><Button variant="ghost" size="sm" className="text-[#8c6670] hover:bg-[#ef4f5f]/10 hover:text-[#ff7c89]" onClick={() => onDelete(project)}><Trash2 /> Supprimer</Button></div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <button className="grid min-h-64 w-full place-items-center rounded-2xl border border-dashed border-white/12 bg-white/2 p-8 text-center hover:bg-white/3" onClick={onCreate}>
              <span><Plus className="mx-auto mb-4 size-8 text-[#ef6977]" /><span className="block font-medium text-white">Créer votre premier projet</span><span className="mt-2 block text-sm text-[#8f8996]">Un volume et une page vierge seront préparés.</span></span>
            </button>
          )}
        </section>
      </div>
      <Dialog open={Boolean(customizing)} onOpenChange={(open) => !open && setCustomizing(null)}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Personnaliser la carte projet</DialogTitle><DialogDescription className="text-[#9c96a5]">Choisissez sa couleur et, si vous le souhaitez, une bannière.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="flex items-center justify-between rounded-xl border border-white/8 p-3 text-sm"><span>Couleur de la carte</span><input type="color" value={customColor} className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent" onChange={(event) => setCustomColor(event.target.value)} /></label><label className="grid gap-2 text-xs text-[#aaa4b4]">Bannière<input type="file" accept="image/*" className="block w-full rounded-xl border border-white/8 bg-black/20 p-3 text-sm" onChange={(event) => { setCustomBanner(event.target.files?.[0] ?? null); setRemoveBanner(false); }} /></label>{customizing?.bannerMediaId && <Button variant="ghost" className={removeBanner ? "text-[#ff8a95]" : ""} onClick={() => { setRemoveBanner((value) => !value); setCustomBanner(null); }}>{removeBanner ? "La bannière sera retirée" : "Retirer la bannière actuelle"}</Button>}</div><DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button className="bg-[#ef4f5f] text-white" onClick={() => { if (customizing) void onCustomize?.(customizing, customColor, customBanner, removeBanner); setCustomizing(null); }}>Enregistrer</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return <div className="rounded-2xl border border-white/7 bg-white/[.025] p-4 sm:p-5"><div className="mb-4 flex size-8 items-center justify-center rounded-lg bg-white/5 text-[#ef6977]"><Icon className="size-4" /></div><div className="text-2xl font-bold tracking-tight text-white">{value}</div><div className="mt-1 text-xs text-[#77717f]">{label}</div></div>;
}

export function ProjectWorkspace({
  project,
  section,
  selectedPageId,
  selectedCharacterId,
  selectedNoteId,
  onSelectPage,
  onSelectCharacter,
  onOpenCharacter,
  onSelectNote,
  updateProject,
  uploadMedia,
  removeMedia,
  onDeleteProject,
  settings,
  updateSettings,
  focusMode = false,
  onToggleFocus = () => undefined,
}: {
  project: StudioProject;
  section: Section;
  selectedPageId: string | null;
  selectedCharacterId: string | null;
  selectedNoteId: string | null;
  onSelectPage: (id: string) => void;
  onSelectCharacter: (id: string) => void;
  onOpenCharacter?: (id: string) => void;
  onSelectNote: (id: string) => void;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
  uploadMedia: (files: File[], kind: StudioMedia["kind"]) => Promise<string[]>;
  removeMedia: (mediaId: string) => Promise<void>;
  onDeleteProject: () => void;
  settings?: StudioSettings;
  updateSettings?: (mutate: (draft: StudioSettings) => void) => void;
  focusMode?: boolean;
  onToggleFocus?: () => void;
}) {
  const effectiveSettings = settings ?? createDefaultSettings();
  const effectiveUpdateSettings = updateSettings ?? (() => undefined);
  if (section === "writing") return <WritingWorkspace project={project} selectedPageId={selectedPageId} onSelectPage={onSelectPage} updateProject={updateProject} settings={effectiveSettings} updateSettings={effectiveUpdateSettings} focusMode={focusMode} onToggleFocus={onToggleFocus} />;
  if (section === "characters") return <CharacterManager project={project} selectedCharacterId={selectedCharacterId} onSelectCharacter={onSelectCharacter} updateProject={updateProject} uploadMedia={uploadMedia} removeMedia={removeMedia} />;
  if (section === "boards") return <BoardsWorkspace project={project} updateProject={updateProject} uploadMedia={uploadMedia} onOpenCharacter={onOpenCharacter ?? onSelectCharacter} />;
  if (section === "notes") return <NotesView project={project} selectedNoteId={selectedNoteId} onSelectNote={onSelectNote} updateProject={updateProject} />;
  return <DashboardView project={project} updateProject={updateProject} onDeleteProject={onDeleteProject} />;
}

function DashboardView({
  project,
  updateProject,
  onDeleteProject,
}: {
  project: StudioProject;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
  onDeleteProject: () => void;
}) {
  const stats = getProjectStats(project);
  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">Vue d’ensemble</div><h1 className="text-3xl font-bold tracking-[-.03em] text-white">{project.name}</h1><p className="mt-2 text-sm text-[#8f8996]">Dernière modification {formatDate(project.updatedAt)}</p></div><WritingExportButton project={project} /></div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Progression" value={`${stats.progress}%`} icon={BarChart3} />
          <Metric label="Pages" value={`${stats.completedPages} / ${project.targetPages || stats.pages}`} icon={FileText} />
          <Metric label="Mots" value={stats.words.toLocaleString("fr-FR")} icon={NotebookPen} />
          <Metric label="Objectifs terminés" value={`${stats.completedGoals} / ${project.goals.length}`} icon={Check} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.25fr_.9fr]">
          <section className="rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-6">
            <h2 className="font-semibold text-white">Progression du manuscrit</h2><p className="mt-1 text-sm text-[#8f8996]">Calculée à partir des pages marquées comme terminées.</p>
            <div className="mt-6 rounded-xl bg-black/20 p-5"><div className="mb-3 flex justify-between text-sm"><span className="text-[#aaa4b4]">Pages terminées</span><span className="font-semibold text-white">{stats.completedPages} sur {project.targetPages || stats.pages}</span></div><Progress value={stats.progress} className="h-2 bg-white/7 [&>div]:bg-[#ef4f5f]" /><div className="mt-5 grid grid-cols-3 gap-3 text-center"><SmallCount label="Volumes" value={stats.volumes} /><SmallCount label="Pages" value={stats.pages} /><SmallCount label="Personnages" value={stats.characters} /></div></div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2"><Settings2 className="size-4 text-[#ef6977]" /><h2 className="font-semibold text-white">Paramètres du projet</h2></div>
            <div className="grid gap-4">
              <Field label="Statut"><Select value={project.status} onValueChange={(status: StudioProject["status"]) => updateProject((draft) => { draft.status = status; })}><SelectTrigger className="w-full border-white/10 bg-white/3"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(projectStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Type par défaut"><Select value={project.projectType} onValueChange={(value: ProjectType) => updateProject((draft) => { draft.projectType = value; })}><SelectTrigger className="w-full border-white/10 bg-white/3"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Format de page par défaut"><Select value={project.defaultPageFormat} onValueChange={(value: PageFormat) => updateProject((draft) => { draft.defaultPageFormat = value; })}><SelectTrigger className="w-full border-white/10 bg-white/3"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAGE_FORMATS).map(([value, format]) => <SelectItem key={value} value={value}>{format.label} — {format.detail}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Objectif de pages"><Input min={0} type="number" value={project.targetPages} className="border-white/10 bg-white/3" onChange={(event) => updateProject((draft) => { draft.targetPages = Math.max(0, Number(event.target.value)); })} /></Field>
            </div>
          </section>
        </div>

        <GoalsBoard project={project} updateProject={updateProject} />

        <section className="mt-5 rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-6">
          <Field label="Résumé du projet"><textarea className="min-h-28 resize-y rounded-xl border border-white/9 bg-black/20 p-4 text-sm leading-6 text-[#ddd8e5] outline-none transition focus:border-[#ef4f5f]/60 focus:ring-2 focus:ring-[#ef4f5f]/10" value={project.description} placeholder="Pitch, intention ou résumé général…" onChange={(event) => updateProject((draft) => { draft.description = event.target.value; })} /></Field>
        </section>

        <section className="mt-5 flex flex-col justify-between gap-4 rounded-2xl border border-[#ef4f5f]/18 bg-[#ef4f5f]/5 p-5 sm:flex-row sm:items-center">
          <div><h2 className="font-semibold text-white">Supprimer le projet</h2><p className="mt-1 text-sm text-[#9c8490]">Supprime les données locales, images et polices de ce projet.</p></div>
          <Button variant="destructive" onClick={onDeleteProject}><Trash2 /> Supprimer le projet</Button>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FileText }) {
  return <div className="rounded-2xl border border-white/8 bg-[#131218] p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-[#77717f]">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div><span className="grid size-9 place-items-center rounded-xl bg-[#ef4f5f]/10 text-[#ef6977]"><Icon className="size-4" /></span></div></div>;
}

function SmallCount({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-white/6 bg-white/3 px-3 py-3"><div className="font-semibold text-white">{value}</div><div className="mt-0.5 text-[11px] text-[#77717f]">{label}</div></div>;
}

function NotesView({
  project,
  selectedNoteId,
  onSelectNote,
  updateProject,
}: {
  project: StudioProject;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
}) {
  const selected = project.notes.find((note) => note.id === selectedNoteId) ?? project.notes[0];
  function addNote() {
    const note = { id: createId("note"), title: "Nouvelle note", content: "" };
    updateProject((draft) => draft.notes.push(note));
    onSelectNote(note.id);
  }
  return (
    <div className="studio-page flex min-h-0 flex-1 flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
        <div className="mb-7 flex items-end justify-between gap-4"><div><div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">Carnet</div><h1 className="text-3xl font-bold tracking-[-.03em] text-white">Notes</h1></div><Button className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={addNote}><Plus /> Ajouter</Button></div>
        {project.notes.length ? (
          <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[280px_1fr]">
            <div className="grid content-start gap-2 overflow-y-auto">{project.notes.map((note) => <button key={note.id} className={`rounded-xl border p-4 text-left transition ${note.id === selected?.id ? "border-[#ef4f5f]/35 bg-[#ef4f5f]/8" : "border-white/7 bg-[#131218] hover:border-white/13"}`} onClick={() => onSelectNote(note.id)}><span className="block truncate text-sm font-medium text-white">{note.title}</span><span className="mt-2 line-clamp-2 block text-xs leading-5 text-[#77717f]">{note.content || "Note vide"}</span></button>)}</div>
            {selected && <section className="flex min-h-[430px] flex-col rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-7"><div className="flex items-center gap-2"><Input aria-label="Titre de la note" value={selected.title} className="h-auto flex-1 border-0 bg-transparent px-0 text-xl font-semibold text-white shadow-none focus-visible:ring-0" onChange={(event) => updateProject((draft) => { const target = draft.notes.find((note) => note.id === selected.id); if (target) target.title = event.target.value; })} /><Button aria-label="Supprimer la note" title="Supprimer la note" variant="ghost" size="icon-sm" className="text-[#77717f] hover:text-[#ff7885]" onClick={() => { updateProject((draft) => { draft.notes = draft.notes.filter((note) => note.id !== selected.id); }); const next = project.notes.find((note) => note.id !== selected.id); if (next) onSelectNote(next.id); }}><Trash2 /></Button></div><div className="my-5 h-px bg-white/7" /><textarea aria-label="Contenu de la note" value={selected.content} className="min-h-80 flex-1 resize-none bg-transparent text-sm leading-7 text-[#ddd8e5] outline-none" placeholder="Écrivez votre note…" onChange={(event) => updateProject((draft) => { const target = draft.notes.find((note) => note.id === selected.id); if (target) target.content = event.target.value; })} /></section>}
          </div>
        ) : (
          <EmptyModule icon={NotebookPen} title="Aucune note" description="Gardez ici vos idées, recherches et rappels de continuité." onAdd={addNote} />
        )}
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-2 text-xs font-medium text-[#aaa4b4] ${className}`}>{label}{children}</label>;
}

function EmptyModule({ icon: Icon, title, description, onAdd }: { icon: typeof Users; title: string; description: string; onAdd: () => void }) {
  return <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-white/12 bg-white/2 p-8 text-center"><div><span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-white/5 text-[#ef6977]"><Icon className="size-5" /></span><h2 className="font-semibold text-white">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#8f8996]">{description}</p><Button className="mt-5 bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={onAdd}><Plus /> Ajouter</Button></div></div>;
}
