export type ProjectStatus = "idea" | "draft" | "revision" | "done";
export type PageStatus = "draft" | "review" | "done";
export type ProjectType = "manga" | "novel" | "script" | "free";
export type PageFormat = "free" | "a4" | "a5" | "pocket" | "novel" | "large";
export type GoalStatus = "todo" | "doing" | "done";
export type BackupExtension = "efs" | "zip";
export type AppTheme = "normal" | "dark" | "light";
export type InterfaceSound = "none" | "soft" | "mechanical" | "digital";
export type WritingColorMode = "light" | "dark";
export type QuoteStyle = "straight" | "french";
export type FooterType = "none" | "page" | "date" | "custom";
export type ShortcutPressMode = "single" | "double";
export type WritingCounterKey = "words" | "paragraphs" | "pages" | "characters" | "symbols";
export type BoardType = "tree" | "relationship";
export type BoardTheme = "dark" | "light";
export type BoardNodeKind = "text" | "image" | "character" | "group";
export type BoardAnchor = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

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

export const STANDARD_FONTS = [
  { id: "aptos", label: "Aptos", family: "Aptos" },
  { id: "calibri", label: "Calibri", family: "Calibri" },
  { id: "cambria", label: "Cambria", family: "Cambria" },
  { id: "arial", label: "Arial", family: "Arial" },
  { id: "arial-narrow", label: "Arial Narrow", family: "Arial Narrow" },
  { id: "georgia", label: "Georgia", family: "Georgia" },
  { id: "times", label: "Times New Roman", family: "Times New Roman" },
  { id: "garamond", label: "Garamond", family: "Garamond" },
  { id: "book-antiqua", label: "Book Antiqua", family: "Book Antiqua" },
  { id: "palatino", label: "Palatino Linotype", family: "Palatino Linotype" },
  { id: "baskerville", label: "Baskerville", family: "Baskerville" },
  { id: "century-schoolbook", label: "Century Schoolbook", family: "Century Schoolbook" },
  { id: "verdana", label: "Verdana", family: "Verdana" },
  { id: "tahoma", label: "Tahoma", family: "Tahoma" },
  { id: "trebuchet", label: "Trebuchet MS", family: "Trebuchet MS" },
  { id: "segoe", label: "Segoe UI", family: "Segoe UI" },
  { id: "helvetica", label: "Helvetica", family: "Helvetica" },
  { id: "candara", label: "Candara", family: "Candara" },
  { id: "corbel", label: "Corbel", family: "Corbel" },
  { id: "constantia", label: "Constantia", family: "Constantia" },
  { id: "courier", label: "Courier New", family: "Courier New" },
  { id: "consolas", label: "Consolas", family: "Consolas" },
  { id: "lucida-console", label: "Lucida Console", family: "Lucida Console" },
] as const;

const LEGACY_STANDARD_FONT_IDS = new Set(["arial", "georgia", "times", "verdana", "trebuchet", "courier"]);

export type StudioPage = {
  id: string;
  title: string;
  content: string;
  status: PageStatus;
  typeOverride: ProjectType | null;
  formatOverride: PageFormat | null;
  backgroundOverride: string | null;
  ignoreProjectFooter: boolean;
  /** Legacy v3 fields kept so older saves migrate without losing their footer. */
  footerType: FooterType;
  footerText: string;
};

export type StudioChapter = { id: string; title: string; pages: StudioPage[] };
export type StudioVolume = { id: string; title: string; chapters: StudioChapter[] };

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
  thumbnailImageId: string | null;
  outfits: CharacterOutfit[];
  relations: CharacterRelation[];
};

export type StudioNote = { id: string; title: string; content: string };
export type StudioGoal = { id: string; title: string; description: string; status: GoalStatus };

export type StudioBoardFolder = {
  id: string;
  name: string;
  order: number;
};

export type StudioBoardNode = {
  id: string;
  kind: BoardNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  text: string;
  color: string;
  imageId: string | null;
  characterId: string | null;
  characterIds: string[];
};

export type StudioBoardEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceAnchor: BoardAnchor;
  targetAnchor: BoardAnchor;
  label: string;
  color: string;
};

export type StudioBoardSnapshot = {
  name: string;
  description: string;
  theme: BoardTheme;
  cardColor: string;
  bannerMediaId: string | null;
  folderId: string | null;
  nodes: StudioBoardNode[];
  edges: StudioBoardEdge[];
};

export type StudioBoardHistoryEntry = {
  id: string;
  label: string;
  createdAt: string;
  snapshot: StudioBoardSnapshot;
};

export type StudioBoard = StudioBoardSnapshot & {
  id: string;
  type: BoardType;
  order: number;
  history: StudioBoardHistoryEntry[];
};

export type StudioFont = {
  id: string;
  name: string;
  family: string;
  mediaId: string;
  enabled: boolean;
};

export type StudioSystemFont = {
  id: string;
  name: string;
  family: string;
  enabled: boolean;
};

export type StudioMedia = {
  id: string;
  projectId: string;
  kind: "character-image" | "outfit-image" | "board-image" | "project-banner" | "font";
  name: string;
  mimeType: string;
  createdAt: string;
  blob: Blob;
};

export type CharacterShortcut = {
  id: string;
  character: string;
  shortcut: string;
  pressMode: ShortcutPressMode;
};

export type StudioShortcuts = {
  save: string;
  focus: string;
  pageBreak: string;
  emDash: string;
};

export type StudioSettings = {
  schemaVersion: 5;
  id: "studio-settings";
  revision: number;
  savedRevision: number;
  backupExtension: BackupExtension;
  backupFilename: string;
  googleDriveClientId: string;
  googleDriveFileId: string;
  theme: AppTheme;
  zoom: number;
  interfaceSound: InterfaceSound;
  enabledStandardFonts: string[];
  systemFonts: StudioSystemFont[];
  customFonts: StudioFont[];
  freeBackground: string;
  paperBackground: string;
  freeColorMode: WritingColorMode;
  paperColorMode: WritingColorMode;
  customColors: string[];
  quoteStyle: QuoteStyle;
  writingCounters: Record<WritingCounterKey, boolean>;
  shortcuts: StudioShortcuts;
  characterShortcuts: CharacterShortcut[];
};

export type StudioProject = {
  schemaVersion: 6;
  id: string;
  name: string;
  description: string;
  cardColor: string;
  bannerMediaId: string | null;
  status: ProjectStatus;
  projectType: ProjectType;
  defaultPageFormat: PageFormat;
  targetPages: number;
  footerType: FooterType;
  footerText: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  savedRevision: number;
  volumes: StudioVolume[];
  characters: StudioCharacter[];
  notes: StudioNote[];
  goals: StudioGoal[];
  boardFolders: StudioBoardFolder[];
  boards: StudioBoard[];
  /** Kept for migration from v2 saves. New fonts live in StudioSettings. */
  customFonts: StudioFont[];
};

export type WritingDocumentStats = Record<WritingCounterKey, number>;

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

export function createDefaultSettings(): StudioSettings {
  return {
    schemaVersion: 5,
    id: "studio-settings",
    revision: 1,
    savedRevision: 1,
    backupExtension: "efs",
    backupFilename: "enfer-fatal-studio",
    googleDriveClientId: "",
    googleDriveFileId: "",
    theme: "normal",
    zoom: 100,
    interfaceSound: "none",
    enabledStandardFonts: STANDARD_FONTS.map((font) => font.id),
    systemFonts: [],
    customFonts: [],
    freeBackground: "#15131a",
    paperBackground: "#ffffff",
    freeColorMode: "dark",
    paperColorMode: "light",
    customColors: [],
    quoteStyle: "french",
    writingCounters: {
      words: true,
      paragraphs: false,
      pages: false,
      characters: false,
      symbols: true,
    },
    shortcuts: {
      save: "Ctrl+S",
      focus: "Ctrl+Shift+F",
      pageBreak: "Ctrl+Enter",
      emDash: "Ctrl+-",
    },
    characterShortcuts: [],
  };
}

export function normalizeSettings(value: unknown): StudioSettings {
  const defaults = createDefaultSettings();
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<StudioSettings>;
  const validStandardIds = new Set<string>(STANDARD_FONTS.map((font) => font.id));
  const settingsVersion = Number(input.schemaVersion ?? 0);
  const enabledStandardFonts = Array.isArray(input.enabledStandardFonts)
    ? input.enabledStandardFonts.filter((id): id is string => typeof id === "string" && validStandardIds.has(id))
    : defaults.enabledStandardFonts;
  const revision = Number.isFinite(input.revision) ? Math.max(1, Number(input.revision)) : 1;
  const legacyPaperBackground = normalizeColor(input.paperBackground, defaults.paperBackground);
  const paperBackground = Number(input.schemaVersion ?? 0) < 2 && legacyPaperBackground.toLowerCase() === "#f7f4ed"
    ? defaults.paperBackground
    : legacyPaperBackground;
  return {
    ...defaults,
    revision,
    savedRevision: Number.isFinite(input.savedRevision) ? Number(input.savedRevision) : revision,
    backupExtension: input.backupExtension === "zip" ? "zip" : "efs",
    backupFilename:
      typeof input.backupFilename === "string" && input.backupFilename.trim()
        ? input.backupFilename.trim()
        : defaults.backupFilename,
    googleDriveClientId: typeof input.googleDriveClientId === "string" ? input.googleDriveClientId.trim() : "",
    googleDriveFileId: typeof input.googleDriveFileId === "string" ? input.googleDriveFileId.trim() : "",
    theme: ["normal", "dark", "light"].includes(input.theme ?? "")
      ? input.theme as AppTheme
      : defaults.theme,
    zoom: Number.isFinite(input.zoom) ? Math.min(150, Math.max(75, Number(input.zoom))) : 100,
    interfaceSound: ["none", "soft", "mechanical", "digital"].includes(input.interfaceSound ?? "")
      ? input.interfaceSound as InterfaceSound
      : "none",
    enabledStandardFonts: settingsVersion < 4
      ? [...new Set([...enabledStandardFonts, ...STANDARD_FONTS.filter((font) => !LEGACY_STANDARD_FONT_IDS.has(font.id)).map((font) => font.id)])]
      : enabledStandardFonts,
    systemFonts: normalizeSystemFonts(input.systemFonts),
    customFonts: Array.isArray(input.customFonts)
      ? input.customFonts.flatMap((font) => {
          if (
            typeof font?.id !== "string" || typeof font.name !== "string" ||
            typeof font.family !== "string" || typeof font.mediaId !== "string"
          ) return [];
          return [{ ...font, enabled: font.enabled !== false }];
        })
      : [],
    freeBackground: normalizeColor(input.freeBackground, defaults.freeBackground),
    paperBackground,
    freeColorMode: input.freeColorMode === "light" || input.freeColorMode === "dark"
      ? input.freeColorMode
      : inferColorMode(input.freeBackground, defaults.freeColorMode),
    paperColorMode: input.paperColorMode === "light" || input.paperColorMode === "dark"
      ? input.paperColorMode
      : inferColorMode(paperBackground, defaults.paperColorMode),
    customColors: Array.isArray(input.customColors)
      ? input.customColors.flatMap((color) => normalizeColor(color, "") ? [color] : []).slice(0, 3)
      : [],
    quoteStyle: input.quoteStyle === "straight" ? "straight" : "french",
    writingCounters: {
      words: input.writingCounters?.words !== false,
      paragraphs: input.writingCounters?.paragraphs === true,
      pages: input.writingCounters?.pages === true,
      characters: input.writingCounters?.characters === true,
      symbols: input.writingCounters?.symbols !== false,
    },
    shortcuts: {
      save: normalizeShortcut(input.shortcuts?.save, defaults.shortcuts.save),
      focus: normalizeShortcut(input.shortcuts?.focus, defaults.shortcuts.focus),
      pageBreak: normalizeShortcut(input.shortcuts?.pageBreak, defaults.shortcuts.pageBreak),
      emDash: normalizeShortcut(input.shortcuts?.emDash, defaults.shortcuts.emDash),
    },
    characterShortcuts: Array.isArray(input.characterShortcuts)
      ? input.characterShortcuts.flatMap((binding) => {
          if (
            typeof binding?.id !== "string" || typeof binding.character !== "string" ||
            !binding.character || typeof binding.shortcut !== "string" || !binding.shortcut
          ) return [];
          return [{
            id: binding.id,
            character: binding.character,
            shortcut: binding.shortcut,
            pressMode: binding.pressMode === "double" ? "double" as const : "single" as const,
          }];
        })
      : [],
  };
}

function normalizeSystemFonts(value: unknown): StudioSystemFont[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((font) => {
    if (!font || typeof font !== "object") return [];
    const input = font as Partial<StudioSystemFont>;
    const family = typeof input.family === "string" ? input.family.trim() : "";
    if (!family || family.length > 180 || seen.has(family.toLocaleLowerCase("fr"))) return [];
    seen.add(family.toLocaleLowerCase("fr"));
    return [{
      id: typeof input.id === "string" && input.id ? input.id : `system-${family.toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, "-")}`,
      name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : family,
      family,
      enabled: input.enabled !== false,
    }];
  }).slice(0, 2_000);
}

function normalizeShortcut(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function inferColorMode(value: unknown, fallback: WritingColorMode): WritingColorMode {
  const color = normalizeColor(value, "");
  if (!color) return fallback;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 145 ? "dark" : "light";
}

function normalizeBoardAnchor(value: unknown, fallback: BoardAnchor): BoardAnchor {
  return ["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"].includes(String(value))
    ? value as BoardAnchor
    : fallback;
}

export function createEmptyPage(index = 1): StudioPage {
  return {
    id: createId("page"), title: `Page ${index}`, content: "", status: "draft",
    typeOverride: null, formatOverride: null, backgroundOverride: null,
    ignoreProjectFooter: false,
    footerType: "none", footerText: "",
  };
}

export function createEmptyCharacter(name = "Nouveau personnage"): StudioCharacter {
  return {
    id: createId("character"), name, role: "", age: "", species: "", description: "",
    appearance: "", personality: "", objectives: "", notes: "", tags: [], imageIds: [], thumbnailImageId: null,
    outfits: [], relations: [],
  };
}

export function stripHtml(html: string) {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function getVolumePages(volume: StudioVolume) {
  return volume.chapters.flatMap((chapter) => chapter.pages);
}

export function createEmptyVolume(index = 1, title = `Volume ${index}`): StudioVolume {
  return {
    id: createId("volume"),
    title,
    chapters: [{ id: createId("chapter"), title: "Contenu", pages: [createEmptyPage()] }],
  };
}

export function createEmptyBoard(name = "Nouvel arbre", type: BoardType = "tree", order = 0): StudioBoard {
  return {
    id: createId("board"),
    name: name.trim() || (type === "tree" ? "Nouvel arbre" : "Nouveau diagramme"),
    type,
    description: "",
    theme: "dark",
    cardColor: "#17151d",
    bannerMediaId: null,
    folderId: null,
    order,
    nodes: [],
    edges: [],
    history: [],
  };
}

export function getWritingDocumentStats(volume: StudioVolume): WritingDocumentStats {
  const pages = getVolumePages(volume);
  const plainPages = pages.map((page) => plainTextWithSpacing(page.content));
  const text = plainPages.join("\n");
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const paragraphs = pages.reduce((total, page) => total + countParagraphs(page.content), 0);
  return {
    words,
    paragraphs,
    pages: pages.length,
    characters: [...text].filter((character) => !/\s/u.test(character)).length,
    symbols: [...text].length,
  };
}

function plainTextWithSpacing(html: string) {
  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|blockquote|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  container.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,blockquote,li").forEach((node) => node.append("\n"));
  return container.textContent ?? "";
}

function countParagraphs(html: string) {
  if (!stripHtml(html)) return 0;
  const matches = html.match(/<(p|div|h[1-6]|blockquote|li)(?:\s[^>]*)?>/gi);
  return Math.max(1, matches?.length ?? 0);
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
    volumes: project.volumes.length, chapters: chapters.length, pages: pages.length,
    completedPages, characters: project.characters.length, notes: project.notes.length, words,
    progress: progressBase > 0 ? Math.min(100, Math.round((completedPages / progressBase) * 100)) : 0,
    completedGoals: project.goals.filter((goal) => goal.status === "done").length,
  };
}

export function createBlankProject(name: string, projectType: ProjectType = "manga"): StudioProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 6, id: createId("project"), name: name.trim() || "Projet sans titre",
    description: "", cardColor: "#4d1824", bannerMediaId: null, status: "idea", projectType,
    defaultPageFormat: projectType === "novel" ? "novel" : projectType === "free" ? "free" : "a4",
    targetPages: 0, footerType: "none", footerText: "",
    createdAt: now, updatedAt: now, revision: 1, savedRevision: 0,
    volumes: [createEmptyVolume()],
    characters: [], notes: [], goals: [], boardFolders: [], boards: [], customFonts: [],
  };
}

export function createDemoProject(): StudioProject {
  const project = createBlankProject("Enfer Fatal", "manga");
  project.id = "project-demo-enfer-fatal";
  project.description = "Projet de démonstration. Explorez le Studio, puis créez votre propre projet depuis l’accueil.";
  project.status = "draft";
  project.targetPages = 24;
  project.revision = 1;
  project.savedRevision = 1;
  project.volumes[0].id = "volume-demo-1";
  project.volumes[0].chapters[0].id = "chapter-demo-1";
  project.volumes[0].chapters[0].title = "Chapitre 1 — Une journée ordinaire en enfer";
  project.volumes[0].chapters[0].pages = [
    {
      ...createEmptyPage(1), id: "page-demo-1",
      content: "<h2>Ouverture</h2><p><strong>Plan général :</strong> les tours infernales dominent la ville sous un ciel rougeoyant.</p><p><em>Narration :</em> Même l’Enfer a besoin d’une bonne direction.</p>",
    },
    {
      ...createEmptyPage(2), id: "page-demo-2", status: "done",
      content: "<p>Lucy traverse les bureaux, un café à la main. Les employés s’écartent sur son passage.</p><p><strong>Lucy :</strong> Le rapport des âmes, sur mon bureau avant midi.</p>",
    },
  ];
  project.characters = [{
    ...createEmptyCharacter("Lucy"), id: "character-demo-lucy",
    role: "Protagoniste — CEO des Enfers", species: "Démone",
    tags: ["protagoniste", "enfer", "direction"],
    description: "Démone charismatique et redoutablement organisée. Elle voyage entre les mondes tout en dirigeant l’Enfer.",
  }];
  project.notes = [{ id: "note-demo-tone", title: "Ton général", content: "Comédie surnaturelle, aventure et contraste entre l’administration infernale et les voyages intermondes." }];
  project.goals = [
    { id: "goal-demo-1", title: "Définir l’ouverture du chapitre", description: "Valider la scène d’introduction et son rythme.", status: "doing" },
    { id: "goal-demo-2", title: "Finaliser la fiche de Lucy", description: "Compléter ses objectifs et ses relations.", status: "todo" },
  ];
  return project;
}

function normalizePage(value: Partial<StudioPage>, index: number): StudioPage {
  return {
    ...createEmptyPage(index + 1),
    id: typeof value.id === "string" ? value.id : createId("page"),
    title: typeof value.title === "string" ? value.title : `Page ${index + 1}`,
    content: value.content === "<p>Commencez à écrire ici…</p>" ? "" : typeof value.content === "string" ? value.content : "",
    status: ["draft", "review", "done"].includes(value.status ?? "") ? value.status as PageStatus : "draft",
    typeOverride: ["manga", "novel", "script", "free"].includes(value.typeOverride ?? "") ? value.typeOverride as ProjectType : null,
    formatOverride: ["free", "a4", "a5", "pocket", "novel", "large"].includes(value.formatOverride ?? "") ? value.formatOverride as PageFormat : null,
    backgroundOverride: normalizeColor(value.backgroundOverride, "") || null,
    ignoreProjectFooter: value.ignoreProjectFooter === true,
    footerType: ["none", "page", "date", "custom"].includes(value.footerType ?? "") ? value.footerType as FooterType : "none",
    footerText: typeof value.footerText === "string" ? value.footerText : "",
  };
}

function normalizeCharacter(value: Partial<StudioCharacter>): StudioCharacter {
  const imageIds = Array.isArray(value.imageIds) ? value.imageIds.filter((id): id is string => typeof id === "string") : [];
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
    imageIds,
    thumbnailImageId: typeof value.thumbnailImageId === "string" && imageIds.includes(value.thumbnailImageId)
      ? value.thumbnailImageId
      : imageIds[0] ?? null,
    outfits: Array.isArray(value.outfits) ? value.outfits.map((outfit) => ({
      id: typeof outfit.id === "string" ? outfit.id : createId("outfit"),
      name: typeof outfit.name === "string" ? outfit.name : "Tenue",
      description: typeof outfit.description === "string" ? outfit.description : "",
      imageIds: Array.isArray(outfit.imageIds) ? outfit.imageIds.filter((id): id is string => typeof id === "string") : [],
    })) : [],
    relations: Array.isArray(value.relations) ? value.relations.map((relation) => ({
      id: typeof relation.id === "string" ? relation.id : createId("relation"),
      targetCharacterId: typeof relation.targetCharacterId === "string" ? relation.targetCharacterId : "",
      type: typeof relation.type === "string" ? relation.type : "Relation",
      description: typeof relation.description === "string" ? relation.description : "",
    })) : [],
  };
}

function normalizeBoardNode(value: Partial<StudioBoardNode>, index: number): StudioBoardNode {
  const kind = ["text", "image", "character", "group"].includes(value.kind ?? "")
    ? value.kind as BoardNodeKind
    : "text";
  const defaultSize = kind === "group"
    ? { width: 420, height: 280 }
    : kind === "character"
      ? { width: 220, height: 150 }
      : { width: 240, height: 170 };
  return {
    id: typeof value.id === "string" && value.id ? value.id : createId("board-node"),
    kind,
    x: Number.isFinite(value.x) ? Math.max(0, Number(value.x)) : 120 + (index % 4) * 280,
    y: Number.isFinite(value.y) ? Math.max(0, Number(value.y)) : 120 + Math.floor(index / 4) * 220,
    width: Number.isFinite(value.width) ? Math.max(160, Number(value.width)) : defaultSize.width,
    height: Number.isFinite(value.height) ? Math.max(110, Number(value.height)) : defaultSize.height,
    title: typeof value.title === "string" ? value.title : kind === "character" ? "Personnage" : "Nouvelle boîte",
    text: typeof value.text === "string" ? value.text : "",
    color: normalizeColor(value.color, "#26222d"),
    imageId: typeof value.imageId === "string" ? value.imageId : null,
    characterId: typeof value.characterId === "string" ? value.characterId : null,
    characterIds: Array.isArray(value.characterIds)
      ? value.characterIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeBoardSnapshot(value: Partial<StudioBoardSnapshot>): StudioBoardSnapshot {
  const nodes = Array.isArray(value.nodes) ? value.nodes.map(normalizeBoardNode) : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : "Tableau sans titre",
    description: typeof value.description === "string" ? value.description : "",
    theme: value.theme === "light" ? "light" : "dark",
    cardColor: normalizeColor(value.cardColor, value.theme === "light" ? "#ffffff" : "#17151d"),
    bannerMediaId: typeof value.bannerMediaId === "string" ? value.bannerMediaId : null,
    folderId: typeof value.folderId === "string" ? value.folderId : null,
    nodes,
    edges: Array.isArray(value.edges) ? value.edges.flatMap((edge) => {
      if (!edge || typeof edge !== "object") return [];
      if (typeof edge.sourceId !== "string" || typeof edge.targetId !== "string") return [];
      if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId) || edge.sourceId === edge.targetId) return [];
      return [{
        id: typeof edge.id === "string" && edge.id ? edge.id : createId("board-edge"),
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceAnchor: normalizeBoardAnchor(edge.sourceAnchor, "right"),
        targetAnchor: normalizeBoardAnchor(edge.targetAnchor, "left"),
        label: typeof edge.label === "string" ? edge.label : "",
        color: normalizeColor(edge.color, "#ef6977"),
      } satisfies StudioBoardEdge];
    }) : [],
  };
}

function normalizeBoard(value: Partial<StudioBoard>, index: number): StudioBoard {
  const snapshot = normalizeBoardSnapshot(value);
  return {
    ...snapshot,
    id: typeof value.id === "string" && value.id ? value.id : createId("board"),
    type: value.type === "relationship" ? "relationship" : "tree",
    order: Number.isFinite(value.order) ? Number(value.order) : index,
    history: Array.isArray(value.history) ? value.history.slice(-40).flatMap((entry) => {
      if (!entry || typeof entry !== "object" || typeof entry.label !== "string") return [];
      return [{
        id: typeof entry.id === "string" && entry.id ? entry.id : createId("board-history"),
        label: entry.label,
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
        snapshot: normalizeBoardSnapshot(entry.snapshot ?? {}),
      } satisfies StudioBoardHistoryEntry];
    }) : [],
  };
}

export function normalizeProject(value: unknown): StudioProject {
  if (!value || typeof value !== "object") throw new Error("Le projet est invalide.");
  const input = value as Partial<StudioProject>;
  if (typeof input.id !== "string" || typeof input.name !== "string") {
    throw new Error("Le fichier ne contient pas un projet Enfer Fatal Studio valide.");
  }
  const now = new Date().toISOString();
  const revision = Number.isFinite(input.revision) ? Number(input.revision) : 1;
  const legacyFooterPage = input.volumes?.flatMap((volume) => volume.chapters ?? [])
    .flatMap((chapter) => chapter.pages ?? [])
    .find((page) => page.footerType && page.footerType !== "none");
  return {
    schemaVersion: 6,
    id: input.id,
    name: input.name,
    description: typeof input.description === "string" ? input.description : "",
    cardColor: normalizeColor(input.cardColor, "#4d1824"),
    bannerMediaId: typeof input.bannerMediaId === "string" ? input.bannerMediaId : null,
    status: ["idea", "draft", "revision", "done"].includes(input.status ?? "") ? input.status as ProjectStatus : "draft",
    projectType: ["manga", "novel", "script", "free"].includes(input.projectType ?? "") ? input.projectType as ProjectType : "manga",
    defaultPageFormat: ["free", "a4", "a5", "pocket", "novel", "large"].includes(input.defaultPageFormat ?? "") ? input.defaultPageFormat as PageFormat : "a4",
    targetPages: Number.isFinite(input.targetPages) ? Math.max(0, Number(input.targetPages)) : 0,
    footerType: ["none", "page", "date", "custom"].includes(input.footerType ?? "")
      ? input.footerType as FooterType
      : legacyFooterPage?.footerType ?? "none",
    footerText: typeof input.footerText === "string" ? input.footerText : legacyFooterPage?.footerText ?? "",
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
    revision,
    savedRevision: Number.isFinite(input.savedRevision) ? Number(input.savedRevision) : revision,
    volumes: Array.isArray(input.volumes) ? input.volumes.map((volume, volumeIndex) => ({
      id: typeof volume.id === "string" ? volume.id : createId("volume"),
      title: typeof volume.title === "string" ? volume.title : `Volume ${volumeIndex + 1}`,
      chapters: Array.isArray(volume.chapters) ? volume.chapters.map((chapter, chapterIndex) => ({
        id: typeof chapter.id === "string" ? chapter.id : createId("chapter"),
        title: typeof chapter.title === "string" ? chapter.title : `Chapitre ${chapterIndex + 1}`,
        pages: Array.isArray(chapter.pages) ? chapter.pages.map((page, pageIndex) => normalizePage(page, pageIndex)) : [],
      })) : [],
    })) : [],
    characters: Array.isArray(input.characters) ? input.characters.map(normalizeCharacter) : [],
    notes: Array.isArray(input.notes) ? input.notes.map((note) => ({
      id: typeof note.id === "string" ? note.id : createId("note"),
      title: typeof note.title === "string" ? note.title : "Note",
      content: typeof note.content === "string" ? note.content : "",
    })) : [],
    goals: Array.isArray(input.goals) ? input.goals.map((goal) => ({
      id: typeof goal.id === "string" ? goal.id : createId("goal"),
      title: typeof goal.title === "string" ? goal.title : "Objectif",
      description: typeof goal.description === "string" ? goal.description : "",
      status: ["todo", "doing", "done"].includes(goal.status ?? "") ? goal.status as GoalStatus : "todo",
    })) : [],
    boardFolders: Array.isArray(input.boardFolders) ? input.boardFolders.flatMap((folder, index) => {
      if (!folder || typeof folder !== "object") return [];
      return [{
        id: typeof folder.id === "string" && folder.id ? folder.id : createId("board-folder"),
        name: typeof folder.name === "string" && folder.name.trim() ? folder.name.trim() : `Dossier ${index + 1}`,
        order: Number.isFinite(folder.order) ? Number(folder.order) : index,
      } satisfies StudioBoardFolder];
    }) : [],
    boards: Array.isArray(input.boards) ? input.boards.map(normalizeBoard) : [],
    customFonts: Array.isArray(input.customFonts) ? input.customFonts.flatMap((font) => {
      if (typeof font?.id !== "string" || typeof font.name !== "string" || typeof font.family !== "string" || typeof font.mediaId !== "string") return [];
      return [{ ...font, enabled: font.enabled !== false }];
    }) : [],
  };
}

export const normalizeImportedProject = normalizeProject;
