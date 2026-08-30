export type ProjectStatus = "idea" | "draft" | "revision" | "done";
export type PageStatus = "draft" | "review" | "done";

export type StudioPage = {
  id: string;
  title: string;
  content: string;
  status: PageStatus;
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

export type StudioCharacter = {
  id: string;
  name: string;
  role: string;
  description: string;
};

export type StudioNote = {
  id: string;
  title: string;
  content: string;
};

export type StudioProject = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  targetPages: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
  savedRevision: number;
  volumes: StudioVolume[];
  characters: StudioCharacter[];
  notes: StudioNote[];
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
};

export function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
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
  };
}

export function createBlankProject(name: string): StudioProject {
  const now = new Date().toISOString();
  const pageId = createId("page");
  return {
    schemaVersion: 1,
    id: createId("project"),
    name: name.trim() || "Projet sans titre",
    description: "",
    status: "idea",
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
            pages: [
              {
                id: pageId,
                title: "Page 1",
                content: "<p>Commencez à écrire ici…</p>",
                status: "draft",
              },
            ],
          },
        ],
      },
    ],
    characters: [],
    notes: [],
  };
}

export function createDemoProject(): StudioProject {
  const now = new Date().toISOString();
  const project: StudioProject = {
    schemaVersion: 1,
    id: "project-demo-enfer-fatal",
    name: "Enfer Fatal",
    description:
      "Projet de démonstration. Explorez le Studio, puis créez votre propre projet depuis l’accueil.",
    status: "draft",
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
                content:
                  "<h2>Ouverture</h2><p><strong>Plan général :</strong> les tours infernales dominent la ville sous un ciel rougeoyant.</p><p><em>Narration :</em> Même l’Enfer a besoin d’une bonne direction.</p>",
              },
              {
                id: "page-demo-2",
                title: "Page 2",
                status: "done",
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
        id: "character-demo-lucy",
        name: "Lucy",
        role: "Protagoniste — CEO des Enfers",
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
  };

  return project;
}

export function normalizeImportedProject(value: unknown): StudioProject {
  if (!value || typeof value !== "object") {
    throw new Error("Le projet importé est invalide.");
  }

  const input = value as Partial<StudioProject>;
  if (typeof input.id !== "string" || typeof input.name !== "string") {
    throw new Error("Le fichier ne contient pas un projet Enfer Fatal Studio valide.");
  }

  const now = new Date().toISOString();
  const revision = Number.isFinite(input.revision) ? Number(input.revision) : 1;
  return {
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    description: typeof input.description === "string" ? input.description : "",
    status: ["idea", "draft", "revision", "done"].includes(input.status ?? "")
      ? (input.status as ProjectStatus)
      : "draft",
    targetPages: Number.isFinite(input.targetPages)
      ? Math.max(0, Number(input.targetPages))
      : 0,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
    revision,
    savedRevision: revision,
    volumes: Array.isArray(input.volumes) ? input.volumes : [],
    characters: Array.isArray(input.characters) ? input.characters : [],
    notes: Array.isArray(input.notes) ? input.notes : [],
  };
}
