"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  NotebookPen,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/studio/rich-text-editor";
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
import { deleteStoredProject, loadProjects, persistProjects } from "@/lib/studio-db";
import { downloadProject, readProjectFile } from "@/lib/project-file";
import {
  createBlankProject,
  createDemoProject,
  createId,
  getProjectStats,
  stripHtml,
  type StudioChapter,
  type StudioPage,
  type StudioProject,
  type StudioVolume,
} from "@/lib/studio";

type Section = "dashboard" | "writing" | "characters" | "notes";

const sectionItems: Array<{
  id: Section;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "writing", label: "Écriture", icon: BookOpen },
  { id: "characters", label: "Personnages", icon: Users },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

const projectStatusLabels = {
  idea: "Idée",
  draft: "Brouillon",
  revision: "Révision",
  done: "Terminé",
};

const pageStatusLabels = {
  draft: "Brouillon",
  review: "À relire",
  done: "Terminée",
};

function firstPageId(project: StudioProject) {
  return project.volumes[0]?.chapters[0]?.pages[0]?.id ?? null;
}

function findPage(project: StudioProject, pageId: string | null) {
  for (const volume of project.volumes) {
    for (const chapter of volume.chapters) {
      const page = chapter.pages.find((candidate) => candidate.id === pageId);
      if (page) return { volume, chapter, page };
    }
  }
  return null;
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
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StudioProject | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );
  const hasUnsavedProjects = projects.some(
    (project) => project.revision !== project.savedRevision,
  );

  useEffect(() => {
    let cancelled = false;
    loadProjects()
      .then(async (storedProjects) => {
        if (cancelled) return;
        if (storedProjects.length) {
          setProjects(
            storedProjects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
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
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
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
    (projectId: string) => {
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) return;
      try {
        const savedProject = { ...project, savedRevision: project.revision };
        downloadProject(savedProject);
        setProjects((current) =>
          current.map((candidate) =>
            candidate.id === project.id
              ? { ...candidate, savedRevision: candidate.revision }
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
        if (activeProjectId) saveProject(activeProjectId);
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

  function createProject() {
    const project = createBlankProject(newProjectName);
    setProjects((current) => [project, ...current]);
    setNewProjectName("");
    setCreateDialogOpen(false);
    openProject(project, "writing");
    toast.success("Nouveau projet créé.");
  }

  async function importProject(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await readProjectFile(file);
      setProjects((current) => {
        const exists = current.some((project) => project.id === imported.id);
        return exists
          ? current.map((project) => (project.id === imported.id ? imported : project))
          : [imported, ...current];
      });
      openProject(imported);
      toast.success(`${imported.name} a été importé.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    await deleteStoredProject(deleteTarget.id).catch(() => undefined);
    setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
    if (activeProjectId === deleteTarget.id) setActiveProjectId(null);
    toast.success(`${deleteTarget.name} a été supprimé de cet appareil.`);
    setDeleteTarget(null);
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="studio-shell flex min-h-svh w-full bg-[#0c0b0f] text-[#eeeaf2]">
        <StudioSidebar
          activeProject={activeProject}
          section={section}
          recentProjects={projects.slice(0, 4)}
          onHome={() => setActiveProjectId(null)}
          onOpenProject={openProject}
          onSectionChange={setSection}
          onCreate={() => setCreateDialogOpen(true)}
        />

        <SidebarInset className="min-w-0 bg-transparent">
          <StudioTopbar
            activeProject={activeProject}
            section={section}
            onHome={() => setActiveProjectId(null)}
            onSave={() => activeProject && saveProject(activeProject.id)}
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
            />
          ) : (
            <HomeView
              projects={projects}
              onCreate={() => setCreateDialogOpen(true)}
              onImport={() => importInputRef.current?.click()}
              onOpen={openProject}
              onDelete={setDeleteTarget}
            />
          )}
        </SidebarInset>
      </div>

      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".zip,.efstudio.zip,application/zip"
        onChange={(event) => importProject(event.target.files?.[0])}
      />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
            <DialogDescription className="text-[#9c96a5]">
              Le projet sera conservé dans la copie de récupération de cet appareil.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm font-medium">
            Nom du projet
            <Input
              autoFocus
              value={newProjectName}
              placeholder="Mon nouveau manga"
              className="border-white/10 bg-white/4"
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createProject();
              }}
            />
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
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
              Cette action supprimera « {deleteTarget?.name} » et sa copie de récupération
              locale. Une archive déjà téléchargée restera intacte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteProject}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster theme="dark" position="bottom-right" richColors />
    </SidebarProvider>
  );
}

function StudioSidebar({
  activeProject,
  section,
  recentProjects,
  onHome,
  onOpenProject,
  onSectionChange,
  onCreate,
}: {
  activeProject: StudioProject | null;
  section: Section;
  recentProjects: StudioProject[];
  onHome: () => void;
  onOpenProject: (project: StudioProject) => void;
  onSectionChange: (section: Section) => void;
  onCreate: () => void;
}) {
  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/7 bg-[#111015]"
    >
      <SidebarHeader className="px-3 py-4">
        <button
          className="flex items-center gap-3 rounded-xl p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ef4f5f]"
          onClick={onHome}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ef4f5f] font-black text-white shadow-[0_8px_24px_rgba(239,79,95,.22)]">
            EF
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-bold">Enfer Fatal Studio</span>
            <span className="block text-[11px] text-[#77717f]">Espace local</span>
          </span>
        </button>
      </SidebarHeader>
      <SidebarSeparator className="bg-white/7" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Accueil" isActive={!activeProject} onClick={onHome}>
                <Home /> <span>Accueil</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Nouveau projet" onClick={onCreate}>
                <Plus /> <span>Nouveau projet</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {activeProject ? (
          <SidebarGroup>
            <SidebarGroupLabel className="uppercase tracking-[.12em]">
              {activeProject.name}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sectionItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        tooltip={item.label}
                        isActive={section === item.id}
                        onClick={() => onSectionChange(item.id)}
                      >
                        <Icon /> <span>{item.label}</span>
                      </SidebarMenuButton>
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
                    <SidebarMenuButton
                      tooltip={project.name}
                      onClick={() => onOpenProject(project)}
                    >
                      <FileText /> <span>{project.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg bg-white/3 p-2 text-xs text-[#77717f] group-data-[collapsible=icon]:justify-center">
          <span className="size-2 shrink-0 rounded-full bg-[#58c68a]" />
          <span className="group-data-[collapsible=icon]:hidden">Copie locale active</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function StudioTopbar({
  activeProject,
  section,
  onHome,
  onSave,
}: {
  activeProject: StudioProject | null;
  section: Section;
  onHome: () => void;
  onSave: () => void;
}) {
  const isDirty = activeProject
    ? activeProject.revision !== activeProject.savedRevision
    : false;
  const sectionName = sectionItems.find((item) => item.id === section)?.label;

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/7 bg-[#0c0b0f]/92 px-4 backdrop-blur-xl sm:px-6">
      <SidebarTrigger className="text-[#aaa4b4]" />
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button className="text-[#77717f] hover:text-white" onClick={onHome}>
          Projets
        </button>
        {activeProject && (
          <>
            <ChevronRight className="size-4 text-[#4e4953]" />
            <span className="max-w-40 truncate font-medium text-[#dcd7e3] sm:max-w-none">
              {activeProject.name}
            </span>
            <ChevronRight className="hidden size-4 text-[#4e4953] sm:block" />
            <span className="hidden text-[#77717f] sm:block">{sectionName}</span>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {activeProject && (
          <>
            <span
              className={`hidden items-center gap-2 text-xs sm:flex ${
                isDirty ? "text-[#e6b35f]" : "text-[#7fc99c]"
              }`}
            >
              <span className={`size-1.5 rounded-full ${isDirty ? "bg-[#e6b35f]" : "bg-[#58c68a]"}`} />
              {isDirty ? "Non enregistré" : "Enregistré"}
            </span>
            <Button
              size="sm"
              className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]"
              onClick={onSave}
            >
              <Save /> <span className="hidden sm:inline">Sauvegarder</span>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

function LoadingView() {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-white/10 border-t-[#ef4f5f]" />
        <p className="text-sm text-[#8f8996]">Ouverture de votre espace…</p>
      </div>
    </div>
  );
}

function HomeView({
  projects,
  onCreate,
  onImport,
  onOpen,
  onDelete,
}: {
  projects: StudioProject[];
  onCreate: () => void;
  onImport: () => void;
  onOpen: (project: StudioProject) => void;
  onDelete: (project: StudioProject) => void;
}) {
  const totals = projects.reduce(
    (result, project) => {
      const stats = getProjectStats(project);
      result.pages += stats.pages;
      result.words += stats.words;
      result.characters += stats.characters;
      return result;
    },
    { pages: 0, words: 0, characters: 0 },
  );

  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
      <div className="mx-auto max-w-7xl">
        <section className="mb-9 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">
              <Sparkles className="size-3.5" /> Votre atelier narratif
            </div>
            <h1 className="text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">
              Bonjour, Mon Empereur.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#96909e] sm:text-base">
              Reprenez un manuscrit, développez vos personnages ou ouvrez une sauvegarde.
              Tout reste sur cet appareil.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="border-white/10 bg-white/3 text-[#ddd8e5] hover:bg-white/7 hover:text-white"
              onClick={onImport}
            >
              <Import /> Ouvrir une sauvegarde
            </Button>
            <Button className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={onCreate}>
              <Plus /> Nouveau projet
            </Button>
          </div>
        </section>

        <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={FolderOpen} label="Projets" value={projects.length.toLocaleString("fr-FR")} />
          <StatTile icon={FileText} label="Pages" value={totals.pages.toLocaleString("fr-FR")} />
          <StatTile icon={NotebookPen} label="Mots" value={totals.words.toLocaleString("fr-FR")} />
          <StatTile icon={CircleUserRound} label="Personnages" value={totals.characters.toLocaleString("fr-FR")} />
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Vos projets</h2>
            <span className="text-xs text-[#77717f]">{projects.length} au total</span>
          </div>
          {projects.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project, index) => {
                const stats = getProjectStats(project);
                const dirty = project.revision !== project.savedRevision;
                return (
                  <article
                    key={project.id}
                    className="group overflow-hidden rounded-2xl border border-white/8 bg-[#131218] transition-all hover:-translate-y-0.5 hover:border-white/14 hover:bg-[#17151d]"
                  >
                    <button className="w-full text-left" onClick={() => onOpen(project)}>
                      <div
                        className={`relative h-28 overflow-hidden ${
                          index % 3 === 0
                            ? "bg-[linear-gradient(135deg,#4d1824,#17121a)]"
                            : index % 3 === 1
                              ? "bg-[linear-gradient(135deg,#252050,#111824)]"
                              : "bg-[linear-gradient(135deg,#183b3a,#111820)]"
                        }`}
                      >
                        <div className="absolute -right-4 -bottom-11 size-32 rounded-full border border-white/8" />
                        <div className="absolute right-7 -bottom-14 size-32 rounded-full border border-white/5" />
                        <BookOpen className="absolute bottom-4 left-5 size-7 text-white/72" />
                        <span className="absolute top-4 right-4 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-white/70 backdrop-blur">
                          {projectStatusLabels[project.status]}
                        </span>
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-white">{project.name}</h3>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-[#77717f]">
                              <Clock3 className="size-3" /> Modifié {formatDate(project.updatedAt)}
                            </p>
                          </div>
                          {dirty && (
                            <span className="mt-1 size-2 shrink-0 rounded-full bg-[#e6b35f]" title="Non enregistré" />
                          )}
                        </div>
                        <div className="mt-5">
                          <div className="mb-2 flex justify-between text-xs">
                            <span className="text-[#8f8996]">Progression</span>
                            <span className="font-medium text-[#dcd7e3]">{stats.progress}%</span>
                          </div>
                          <Progress value={stats.progress} className="h-1.5 bg-white/7 [&>div]:bg-[#ef4f5f]" />
                        </div>
                        <div className="mt-4 flex gap-4 text-xs text-[#77717f]">
                          <span>{stats.pages} pages</span>
                          <span>{stats.words.toLocaleString("fr-FR")} mots</span>
                          <span>{stats.characters} pers.</span>
                        </div>
                      </div>
                    </button>
                    <div className="flex justify-between border-t border-white/7 px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#aaa4b4] hover:bg-white/6 hover:text-white"
                        onClick={() => onOpen(project)}
                      >
                        Ouvrir <ChevronRight />
                      </Button>
                      <Button
                        aria-label={`Supprimer ${project.name}`}
                        title="Supprimer le projet"
                        variant="ghost"
                        size="icon-sm"
                        className="text-[#716b76] hover:bg-[#ef4f5f]/10 hover:text-[#ff7c89]"
                        onClick={() => onDelete(project)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <button
              className="grid min-h-64 w-full place-items-center rounded-2xl border border-dashed border-white/12 bg-white/2 p-8 text-center hover:bg-white/3"
              onClick={onCreate}
            >
              <span>
                <Plus className="mx-auto mb-4 size-8 text-[#ef6977]" />
                <span className="block font-medium text-white">Créer votre premier projet</span>
                <span className="mt-2 block text-sm text-[#8f8996]">Un volume et une première page seront préparés.</span>
              </span>
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/7 bg-white/[.025] p-4 sm:p-5">
      <div className="mb-4 flex size-8 items-center justify-center rounded-lg bg-white/5 text-[#ef6977]">
        <Icon className="size-4" />
      </div>
      <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-[#77717f]">{label}</div>
    </div>
  );
}

function ProjectWorkspace({
  project,
  section,
  selectedPageId,
  selectedCharacterId,
  selectedNoteId,
  onSelectPage,
  onSelectCharacter,
  onSelectNote,
  updateProject,
}: {
  project: StudioProject;
  section: Section;
  selectedPageId: string | null;
  selectedCharacterId: string | null;
  selectedNoteId: string | null;
  onSelectPage: (id: string) => void;
  onSelectCharacter: (id: string) => void;
  onSelectNote: (id: string) => void;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
}) {
  if (section === "writing") {
    return (
      <WritingView
        project={project}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
        updateProject={updateProject}
      />
    );
  }
  if (section === "characters") {
    return (
      <CharactersView
        project={project}
        selectedCharacterId={selectedCharacterId}
        onSelectCharacter={onSelectCharacter}
        updateProject={updateProject}
      />
    );
  }
  if (section === "notes") {
    return (
      <NotesView
        project={project}
        selectedNoteId={selectedNoteId}
        onSelectNote={onSelectNote}
        updateProject={updateProject}
      />
    );
  }
  return <DashboardView project={project} updateProject={updateProject} />;
}

function DashboardView({
  project,
  updateProject,
}: {
  project: StudioProject;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
}) {
  const stats = getProjectStats(project);
  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">Vue d’ensemble</div>
          <h1 className="text-3xl font-bold tracking-[-.03em] text-white">{project.name}</h1>
          <p className="mt-2 text-sm text-[#8f8996]">Dernière modification {formatDate(project.updatedAt)}</p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Progression" value={`${stats.progress}%`} icon={BarChart3} />
          <Metric label="Pages" value={`${stats.completedPages} / ${project.targetPages || stats.pages}`} icon={FileText} />
          <Metric label="Mots" value={stats.words.toLocaleString("fr-FR")} icon={NotebookPen} />
          <Metric label="Personnages" value={stats.characters.toString()} icon={Users} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <section className="rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-6">
            <h2 className="font-semibold text-white">Progression du manuscrit</h2>
            <p className="mt-1 text-sm text-[#8f8996]">Calculée à partir des pages marquées comme terminées.</p>
            <div className="mt-6 rounded-xl bg-black/20 p-5">
              <div className="mb-3 flex justify-between text-sm">
                <span className="text-[#aaa4b4]">Pages terminées</span>
                <span className="font-semibold text-white">{stats.completedPages} sur {project.targetPages || stats.pages}</span>
              </div>
              <Progress value={stats.progress} className="h-2 bg-white/7 [&>div]:bg-[#ef4f5f]" />
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <SmallCount label="Volumes" value={stats.volumes} />
                <SmallCount label="Chapitres" value={stats.chapters} />
                <SmallCount label="Notes" value={stats.notes} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-6">
            <h2 className="font-semibold text-white">Paramètres rapides</h2>
            <div className="mt-5 grid gap-5">
              <label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">
                Statut du projet
                <Select
                  value={project.status}
                  onValueChange={(status: StudioProject["status"]) =>
                    updateProject((draft) => {
                      draft.status = status;
                    })
                  }
                >
                  <SelectTrigger className="w-full border-white/10 bg-white/3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(projectStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">
                Objectif de pages
                <Input
                  min={0}
                  type="number"
                  value={project.targetPages}
                  className="border-white/10 bg-white/3"
                  onChange={(event) =>
                    updateProject((draft) => {
                      draft.targetPages = Math.max(0, Number(event.target.value));
                    })
                  }
                />
              </label>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-6">
          <label className="grid gap-3">
            <span className="font-semibold text-white">Résumé du projet</span>
            <textarea
              className="min-h-28 resize-y rounded-xl border border-white/9 bg-black/20 p-4 text-sm leading-6 text-[#ddd8e5] outline-none transition focus:border-[#ef4f5f]/60 focus:ring-2 focus:ring-[#ef4f5f]/10"
              value={project.description}
              placeholder="Pitch, intention ou résumé général…"
              onChange={(event) =>
                updateProject((draft) => {
                  draft.description = event.target.value;
                })
              }
            />
          </label>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FileText }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#131218] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[#77717f]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-[#ef4f5f]/10 text-[#ef6977]">
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function SmallCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/6 bg-white/3 px-3 py-3">
      <div className="font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-[#77717f]">{label}</div>
    </div>
  );
}

function WritingView({
  project,
  selectedPageId,
  onSelectPage,
  updateProject,
}: {
  project: StudioProject;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
}) {
  const selection = findPage(project, selectedPageId) ?? findPage(project, firstPageId(project));

  function addVolume() {
    const page: StudioPage = { id: createId("page"), title: "Page 1", content: "<p>Commencez à écrire ici…</p>", status: "draft" };
    const chapter: StudioChapter = { id: createId("chapter"), title: "Chapitre 1", pages: [page] };
    const volume: StudioVolume = { id: createId("volume"), title: `Volume ${project.volumes.length + 1}`, chapters: [chapter] };
    updateProject((draft) => draft.volumes.push(volume));
    onSelectPage(page.id);
  }

  function addChapter(volumeId: string) {
    const volume = project.volumes.find((candidate) => candidate.id === volumeId);
    const page: StudioPage = { id: createId("page"), title: "Page 1", content: "<p>Commencez à écrire ici…</p>", status: "draft" };
    const chapter: StudioChapter = {
      id: createId("chapter"),
      title: `Chapitre ${(volume?.chapters.length ?? 0) + 1}`,
      pages: [page],
    };
    updateProject((draft) => {
      draft.volumes.find((candidate) => candidate.id === volumeId)?.chapters.push(chapter);
    });
    onSelectPage(page.id);
  }

  function addPage(chapterId: string) {
    let pageNumber = 1;
    project.volumes.forEach((volume) => {
      const chapter = volume.chapters.find((candidate) => candidate.id === chapterId);
      if (chapter) pageNumber = chapter.pages.length + 1;
    });
    const page: StudioPage = {
      id: createId("page"),
      title: `Page ${pageNumber}`,
      content: "<p>Commencez à écrire ici…</p>",
      status: "draft",
    };
    updateProject((draft) => {
      draft.volumes.forEach((volume) => {
        volume.chapters.find((candidate) => candidate.id === chapterId)?.pages.push(page);
      });
    });
    onSelectPage(page.id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-white/7 bg-[#100f14] lg:w-72 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between border-b border-white/7 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[.15em] text-[#8f8996]">Manuscrit</span>
          <Button aria-label="Ajouter un volume" title="Ajouter un volume" size="icon-xs" variant="ghost" onClick={addVolume}>
            <Plus />
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[calc(100svh-7.2rem)]">
          {project.volumes.map((volume) => (
            <div key={volume.id} className="mb-3">
              <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-[#c8c2cf]">
                <BookOpen className="size-3.5 text-[#ef6977]" />
                <span className="truncate">{volume.title}</span>
                <Button
                  aria-label={`Ajouter un chapitre à ${volume.title}`}
                  title="Ajouter un chapitre"
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto text-[#77717f]"
                  onClick={() => addChapter(volume.id)}
                >
                  <Plus />
                </Button>
              </div>
              {volume.chapters.map((chapter) => (
                <div key={chapter.id} className="ml-3 border-l border-white/7 pl-2">
                  <div className="flex items-center gap-1 px-2 py-1.5 text-xs text-[#8f8996]">
                    <span className="truncate">{chapter.title}</span>
                    <Button
                      aria-label={`Ajouter une page à ${chapter.title}`}
                      title="Ajouter une page"
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto text-[#77717f]"
                      onClick={() => addPage(chapter.id)}
                    >
                      <Plus />
                    </Button>
                  </div>
                  {chapter.pages.map((page) => (
                    <button
                      key={page.id}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        page.id === selection?.page.id
                          ? "bg-[#ef4f5f]/12 text-[#ff8a95]"
                          : "text-[#77717f] hover:bg-white/4 hover:text-[#c8c2cf]"
                      }`}
                      onClick={() => onSelectPage(page.id)}
                    >
                      {page.status === "done" ? <Check className="size-3.5 text-[#58c68a]" /> : <FileText className="size-3.5" />}
                      <span className="truncate">{page.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {selection ? (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              aria-label="Titre de la page"
              value={selection.page.title}
              className="h-auto flex-1 border-0 bg-transparent px-0 text-xl font-semibold text-white shadow-none focus-visible:ring-0"
              onChange={(event) =>
                updateProject((draft) => {
                  const target = findPage(draft, selection.page.id);
                  if (target) target.page.title = event.target.value;
                })
              }
            />
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#77717f]">
                {stripHtml(selection.page.content).split(/\s+/).filter(Boolean).length} mots
              </span>
              <Select
                value={selection.page.status}
                onValueChange={(status: StudioPage["status"]) =>
                  updateProject((draft) => {
                    const target = findPage(draft, selection.page.id);
                    if (target) target.page.status = status;
                  })
                }
              >
                <SelectTrigger size="sm" className="w-[128px] border-white/10 bg-white/3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(pageStatusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <RichTextEditor
            documentId={selection.page.id}
            html={selection.page.content}
            onChange={(content) =>
              updateProject((draft) => {
                const target = findPage(draft, selection.page.id);
                if (target) target.page.content = content;
              })
            }
          />
        </section>
      ) : (
        <div className="grid flex-1 place-items-center p-8 text-center text-[#8f8996]">
          <div>
            <BookOpen className="mx-auto mb-3 size-7" />
            <p>Ajoutez un volume pour commencer à écrire.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CharactersView({
  project,
  selectedCharacterId,
  onSelectCharacter,
  updateProject,
}: {
  project: StudioProject;
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string) => void;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
}) {
  const selected = project.characters.find((character) => character.id === selectedCharacterId) ?? project.characters[0];

  function addCharacter() {
    const character = { id: createId("character"), name: "Nouveau personnage", role: "", description: "" };
    updateProject((draft) => draft.characters.push(character));
    onSelectCharacter(character.id);
  }

  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">Distribution</div>
            <h1 className="text-3xl font-bold tracking-[-.03em] text-white">Personnages</h1>
          </div>
          <Button className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={addCharacter}>
            <Plus /> Ajouter
          </Button>
        </div>

        {project.characters.length ? (
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <div className="grid content-start gap-2">
              {project.characters.map((character) => (
                <button
                  key={character.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    character.id === selected?.id
                      ? "border-[#ef4f5f]/35 bg-[#ef4f5f]/8"
                      : "border-white/7 bg-[#131218] hover:border-white/13"
                  }`}
                  onClick={() => onSelectCharacter(character.id)}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#4a2430,#25202b)] text-sm font-bold text-[#ff9aa4]">
                    {character.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-white">{character.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#77717f]">{character.role || "Rôle à définir"}</span>
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <section className="rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-7">
                <div className="mb-6 flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,#562631,#29212d)] text-lg font-bold text-[#ff9aa4]">
                    {selected.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[.15em] text-[#77717f]">Fiche personnage</p>
                    <h2 className="mt-1 font-semibold text-white">Informations principales</h2>
                  </div>
                </div>
                <div className="grid gap-5">
                  <Field label="Nom">
                    <Input
                      value={selected.name}
                      className="border-white/10 bg-black/20"
                      onChange={(event) => updateProject((draft) => {
                        const target = draft.characters.find((character) => character.id === selected.id);
                        if (target) target.name = event.target.value;
                      })}
                    />
                  </Field>
                  <Field label="Rôle">
                    <Input
                      value={selected.role}
                      placeholder="Protagoniste, allié, antagoniste…"
                      className="border-white/10 bg-black/20"
                      onChange={(event) => updateProject((draft) => {
                        const target = draft.characters.find((character) => character.id === selected.id);
                        if (target) target.role = event.target.value;
                      })}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={selected.description}
                      className="min-h-52 resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-[#ddd8e5] outline-none focus:border-[#ef4f5f]/60 focus:ring-2 focus:ring-[#ef4f5f]/10"
                      placeholder="Apparence, personnalité, objectifs, relations…"
                      onChange={(event) => updateProject((draft) => {
                        const target = draft.characters.find((character) => character.id === selected.id);
                        if (target) target.description = event.target.value;
                      })}
                    />
                  </Field>
                </div>
              </section>
            )}
          </div>
        ) : (
          <EmptyModule icon={Users} title="Aucun personnage" description="Créez votre première fiche pour commencer la distribution." onAdd={addCharacter} />
        )}
      </div>
    </div>
  );
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
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">Carnet</div>
            <h1 className="text-3xl font-bold tracking-[-.03em] text-white">Notes</h1>
          </div>
          <Button className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={addNote}>
            <Plus /> Ajouter
          </Button>
        </div>

        {project.notes.length ? (
          <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[280px_1fr]">
            <div className="grid content-start gap-2 overflow-y-auto">
              {project.notes.map((note) => (
                <button
                  key={note.id}
                  className={`rounded-xl border p-4 text-left transition ${
                    note.id === selected?.id
                      ? "border-[#ef4f5f]/35 bg-[#ef4f5f]/8"
                      : "border-white/7 bg-[#131218] hover:border-white/13"
                  }`}
                  onClick={() => onSelectNote(note.id)}
                >
                  <span className="block truncate text-sm font-medium text-white">{note.title}</span>
                  <span className="mt-2 line-clamp-2 block text-xs leading-5 text-[#77717f]">
                    {note.content || "Note vide"}
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <section className="flex min-h-[430px] flex-col rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-7">
                <Input
                  aria-label="Titre de la note"
                  value={selected.title}
                  className="h-auto border-0 bg-transparent px-0 text-xl font-semibold text-white shadow-none focus-visible:ring-0"
                  onChange={(event) => updateProject((draft) => {
                    const target = draft.notes.find((note) => note.id === selected.id);
                    if (target) target.title = event.target.value;
                  })}
                />
                <div className="my-5 h-px bg-white/7" />
                <textarea
                  aria-label="Contenu de la note"
                  value={selected.content}
                  className="min-h-80 flex-1 resize-none bg-transparent text-sm leading-7 text-[#ddd8e5] outline-none"
                  placeholder="Écrivez votre note…"
                  onChange={(event) => updateProject((draft) => {
                    const target = draft.notes.find((note) => note.id === selected.id);
                    if (target) target.content = event.target.value;
                  })}
                />
              </section>
            )}
          </div>
        ) : (
          <EmptyModule icon={NotebookPen} title="Aucune note" description="Gardez ici vos idées, recherches et rappels de continuité." onAdd={addNote} />
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">
      {label}
      {children}
    </label>
  );
}

function EmptyModule({
  icon: Icon,
  title,
  description,
  onAdd,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  onAdd: () => void;
}) {
  return (
    <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-white/12 bg-white/2 p-8 text-center">
      <div>
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-white/5 text-[#ef6977]">
          <Icon className="size-5" />
        </span>
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#8f8996]">{description}</p>
        <Button className="mt-5 bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={onAdd}>
          <Plus /> Ajouter
        </Button>
      </div>
    </div>
  );
}
