export type ProjectStatus = "idea" | "draft" | "revision" | "done";
export type PageStatus = "draft" | "review" | "done";
export type ProjectType = "manga" | "novel" | "script" | "free";
export type PageFormat = "free" | "a4" | "a5" | "pocket" | "novel" | "large";
export type GoalStatus = "todo" | "doing" | "done";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  manga: "Manga / BD",
  novel: "Roman",
  script: "Script",
  free: "Écriture libre",
};

export const PAGE_FORMATS: Record<
  PageFormat,
  { label: string; detail: string; width: number; height: number | null }
> = {
  free: { label: "Libre", detail: "Sans limite de page", width: 760, height: null },
  a4: { label: "A4", detail: "210 × 297 mm", width: 680, height: 962 },
  a5: { label: "A5", detail: "148 × 210 mm", width: 520, height: 738 },
  pocket: { label: "Livre de poche", detail: "110 × 178 mm", width: 440, height: 712 },
  novel: { label: "Roman standard", detail: "140 × 216 mm", width: 520, height: 802 },
  large: { label: "Grand format", detail: "170 × 240 mm", width: 620, height: 875 },
};

export type StudioPage = {
  id: string;
  title: string;
  content: string;
  status: PageStatus;
  typeOverride: ProjectType | null;
  formatOverride: PageFormat | null;
};

export type StudioChapter = {
  id: string;
  title: string;
  pages: StudioPage[];
};

export type StudioVolume = {
  id: string;
  title: string;
  chapters: StudioChapter[];
};

export type CharacterRelation = {
  id: string;
  targetCharacterId: string;
  type: string;
  description: string;
};

export type CharacterOutfit = {
  id: string;
  name: string;
  description: string;
  imageIds: string[];
};

export type StudioCharacter = {
  id: string;
  name: string;
  role: string;
  age: string;
  species: string;
  description: string;
  appearance: string;
  personality: string;
  objectives: string;
  notes: string;
  tags: string[];
  imageIds: string[];
  outfits: CharacterOutfit[];
  relations: CharacterRelation[];
};

export type StudioNote = {
  id: string;
  title: string;
  content: string;
};

export type StudioGoal = {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
};

export type StudioFont = {
  id: string;
  name: string;
  family: string;
  mediaId: string;
};

export type StudioMedia = {
  id: string;
  projectId: string;
  kind: "character-image" | "outfit-image" | "font";
  name: string;
  mimeType: string;
  createdAt: string;
  blob: Blob;
};

export type StudioProject = {
  schemaVersion: 2;
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  projectType: ProjectType;
  defaultPageFormat: PageFormat;
  targetPages: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
  savedRevision: number;
  volumes: StudioVolume[];
  characters: StudioCharacter[];
  notes: StudioNote[];
  goals: StudioGoal[];
  customFonts: StudioFont[];
};

export type ProjectStats = {
  volumes: number;
  chapters: number;
  pages: number;
  completedPages: number;
  characters: number;
  notes: number;
  words: number;
  progress: number;
  completedGoals: number;
};

export function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createEmptyPage(index = 1): StudioPage {
  return {
    id: createId("page"),
    title: `Page ${index}`,
    content: "",
    status: "draft",
    typeOverride: null,
    formatOverride: null,
  };
}

export function createEmptyCharacter(name = "Nouveau personnage"): StudioCharacter {
  return {
    id: createId("character"),
    name,
    role: "",
    age: "",
    species: "",
    description: "",
    appearance: "",
    personality: "",
    objectives: "",
    notes: "",
    tags: [],
    imageIds: [],
    outfits: [],
    relations: [],
  };
}

export function stripHtml(html: string) {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function getProjectStats(project: StudioProject): ProjectStats {
  const chapters = project.volumes.flatMap((volume) => volume.chapters);
  const pages = chapters.flatMap((chapter) => chapter.pages);
  const completedPages = pages.filter((page) => page.status === "done").length;
  const words = pages.reduce((total, page) => {
    const text = stripHtml(page.content);
    return total + (text ? text.split(/\s+/).length : 0);
  }, 0);
  const progressBase = project.targetPages > 0 ? project.targetPages : pages.length;

  return {
    volumes: project.volumes.length,
    chapters: chapters.length,
    pages: pages.length,
    completedPages,
    characters: project.characters.length,
    notes: project.notes.length,
    words,
    progress:
      progressBase > 0
        ? Math.min(100, Math.round((completedPages / progressBase) * 100))
        : 0,
    completedGoals: project.goals.filter((goal) => goal.status === "done").length,
  };
}

export function createBlankProject(
  name: string,
  projectType: ProjectType = "manga",
): StudioProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: createId("project"),
    name: name.trim() || "Projet sans titre",
    description: "",
    status: "idea",
    projectType,
    defaultPageFormat: projectType === "novel" ? "novel" : projectType === "free" ? "free" : "a4",
    targetPages: 0,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    savedRevision: 0,
    volumes: [
      {
        id: createId("volume"),
        title: "Volume 1",
        chapters: [
          {
            id: createId("chapter"),
            title: "Chapitre 1",
            pages: [createEmptyPage()],
          },
        ],
      },
    ],
    characters: [],
    notes: [],
    goals: [],
    customFonts: [],
  };
}

export function createDemoProject(): StudioProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: "project-demo-enfer-fatal",
    name: "Enfer Fatal",
    description:
      "Projet de démonstration. Explorez le Studio, puis créez votre propre projet depuis l’accueil.",
    status: "draft",
    projectType: "manga",
    defaultPageFormat: "a4",
    targetPages: 24,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    savedRevision: 1,
    volumes: [
      {
        id: "volume-demo-1",
        title: "Volume 1",
        chapters: [
          {
            id: "chapter-demo-1",
            title: "Chapitre 1 — Une journée ordinaire en enfer",
            pages: [
              {
                id: "page-demo-1",
                title: "Page 1",
                status: "draft",
                typeOverride: null,
                formatOverride: null,
                content:
                  "<h2>Ouverture</h2><p><strong>Plan général :</strong> les tours infernales dominent la ville sous un ciel rougeoyant.</p><p><em>Narration :</em> Même l’Enfer a besoin d’une bonne direction.</p>",
              },
              {
                id: "page-demo-2",
                title: "Page 2",
                status: "done",
                typeOverride: null,
                formatOverride: null,
                content:
                  "<p>Lucy traverse les bureaux, un café à la main. Les employés s’écartent sur son passage.</p><p><strong>Lucy :</strong> Le rapport des âmes, sur mon bureau avant midi.</p>",
              },
            ],
          },
        ],
      },
    ],
    characters: [
      {
        ...createEmptyCharacter("Lucy"),
        id: "character-demo-lucy",
        role: "Protagoniste — CEO des Enfers",
        species: "Démone",
        tags: ["protagoniste", "enfer", "direction"],
        description:
          "Démone charismatique et redoutablement organisée. Elle voyage entre les mondes tout en dirigeant l’Enfer.",
      },
    ],
    notes: [
      {
        id: "note-demo-tone",
        title: "Ton général",
        content:
          "Comédie surnaturelle, aventure et contraste entre l’administration infernale et les voyages intermondes.",
      },
    ],
    goals: [
      {
        id: "goal-demo-1",
        title: "Définir l’ouverture du chapitre",
        description: "Valider la scène d’introduction et son rythme.",
        status: "doing",
      },
      {
        id: "goal-demo-2",
        title: "Finaliser la fiche de Lucy",
        description: "Compléter ses objectifs et ses relations.",
        status: "todo",
      },
    ],
    customFonts: [],
  };
}

function normalizePage(value: Partial<StudioPage>, index: number): StudioPage {
  return {
    id: typeof value.id === "string" ? value.id : createId("page"),
    title: typeof value.title === "string" ? value.title : `Page ${index + 1}`,
    content:
      value.content === "<p>Commencez à écrire ici…</p>"
        ? ""
        : typeof value.content === "string"
          ? value.content
          : "",
    status: ["draft", "review", "done"].includes(value.status ?? "")
      ? (value.status as PageStatus)
      : "draft",
    typeOverride: ["manga", "novel", "script", "free"].includes(value.typeOverride ?? "")
      ? (value.typeOverride as ProjectType)
      : null,
    formatOverride: ["free", "a4", "a5", "pocket", "novel", "large"].includes(
      value.formatOverride ?? "",
    )
      ? (value.formatOverride as PageFormat)
      : null,
  };
}

function normalizeCharacter(value: Partial<StudioCharacter>): StudioCharacter {
  return {
    ...createEmptyCharacter(typeof value.name === "string" ? value.name : "Personnage"),
    id: typeof value.id === "string" ? value.id : createId("character"),
    role: typeof value.role === "string" ? value.role : "",
    age: typeof value.age === "string" ? value.age : "",
    species: typeof value.species === "string" ? value.species : "",
    description: typeof value.description === "string" ? value.description : "",
    appearance: typeof value.appearance === "string" ? value.appearance : "",
    personality: typeof value.personality === "string" ? value.personality : "",
    objectives: typeof value.objectives === "string" ? value.objectives : "",
    notes: typeof value.notes === "string" ? value.notes : "",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    imageIds: Array.isArray(value.imageIds)
      ? value.imageIds.filter((id): id is string => typeof id === "string")
      : [],
    outfits: Array.isArray(value.outfits)
      ? value.outfits.map((outfit) => ({
          id: typeof outfit.id === "string" ? outfit.id : createId("outfit"),
          name: typeof outfit.name === "string" ? outfit.name : "Tenue",
          description: typeof outfit.description === "string" ? outfit.description : "",
          imageIds: Array.isArray(outfit.imageIds)
            ? outfit.imageIds.filter((id): id is string => typeof id === "string")
            : [],
        }))
      : [],
    relations: Array.isArray(value.relations)
      ? value.relations.map((relation) => ({
          id: typeof relation.id === "string" ? relation.id : createId("relation"),
          targetCharacterId:
            typeof relation.targetCharacterId === "string" ? relation.targetCharacterId : "",
          type: typeof relation.type === "string" ? relation.type : "Relation",
          description: typeof relation.description === "string" ? relation.description : "",
        }))
      : [],
  };
}

export function normalizeProject(value: unknown): StudioProject {
  if (!value || typeof value !== "object") {
    throw new Error("Le projet est invalide.");
  }

  const input = value as Partial<StudioProject>;
  if (typeof input.id !== "string" || typeof input.name !== "string") {
    throw new Error("Le fichier ne contient pas un projet Enfer Fatal Studio valide.");
  }

  const now = new Date().toISOString();
  const revision = Number.isFinite(input.revision) ? Number(input.revision) : 1;
  return {
    schemaVersion: 2,
    id: input.id,
    name: input.name,
    description: typeof input.description === "string" ? input.description : "",
    status: ["idea", "draft", "revision", "done"].includes(input.status ?? "")
      ? (input.status as ProjectStatus)
      : "draft",
    projectType: ["manga", "novel", "script", "free"].includes(input.projectType ?? "")
      ? (input.projectType as ProjectType)
      : "manga",
    defaultPageFormat: ["free", "a4", "a5", "pocket", "novel", "large"].includes(
      input.defaultPageFormat ?? "",
    )
      ? (input.defaultPageFormat as PageFormat)
      : "a4",
    targetPages: Number.isFinite(input.targetPages) ? Math.max(0, Number(input.targetPages)) : 0,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
    revision,
    savedRevision: Number.isFinite(input.savedRevision) ? Number(input.savedRevision) : revision,
    volumes: Array.isArray(input.volumes)
      ? input.volumes.map((volume, volumeIndex) => ({
          id: typeof volume.id === "string" ? volume.id : createId("volume"),
          title: typeof volume.title === "string" ? volume.title : `Volume ${volumeIndex + 1}`,
          chapters: Array.isArray(volume.chapters)
            ? volume.chapters.map((chapter, chapterIndex) => ({
                id: typeof chapter.id === "string" ? chapter.id : createId("chapter"),
                title:
                  typeof chapter.title === "string"
                    ? chapter.title
                    : `Chapitre ${chapterIndex + 1}`,
                pages: Array.isArray(chapter.pages)
                  ? chapter.pages.map((page, pageIndex) => normalizePage(page, pageIndex))
                  : [],
              }))
            : [],
        }))
      : [],
    characters: Array.isArray(input.characters)
      ? input.characters.map((character) => normalizeCharacter(character))
      : [],
    notes: Array.isArray(input.notes)
      ? input.notes.map((note) => ({
          id: typeof note.id === "string" ? note.id : createId("note"),
          title: typeof note.title === "string" ? note.title : "Note",
          content: typeof note.content === "string" ? note.content : "",
        }))
      : [],
    goals: Array.isArray(input.goals)
      ? input.goals.map((goal) => ({
          id: typeof goal.id === "string" ? goal.id : createId("goal"),
          title: typeof goal.title === "string" ? goal.title : "Objectif",
          description: typeof goal.description === "string" ? goal.description : "",
          status: ["todo", "doing", "done"].includes(goal.status ?? "")
            ? (goal.status as GoalStatus)
            : "todo",
        }))
      : [],
    customFonts: Array.isArray(input.customFonts)
      ? input.customFonts.filter(
          (font): font is StudioFont =>
            typeof font.id === "string" &&
            typeof font.name === "string" &&
            typeof font.family === "string" &&
            typeof font.mediaId === "string",
        )
      : [],
  };
}

export const normalizeImportedProject = normalizeProject;
