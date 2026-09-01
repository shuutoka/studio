import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { loadAllMedia } from "@/lib/studio-db";
import {
  createDefaultSettings,
  normalizeImportedProject,
  normalizeProject,
  normalizeSettings,
  type StudioMedia,
  type StudioProject,
  type StudioSettings,
} from "@/lib/studio";

type ManifestMedia = Omit<StudioMedia, "blob"> & { path: string };

export type StudioBackup = {
  projects: StudioProject[];
  settings: StudioSettings;
  media: StudioMedia[];
};

export function safeFilename(name: string) {
  return (
    name
      .replace(/\.(efs|zip)$/i, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_.]+/g, "-")
      .replace(/^-+|-+$/g, "") || "enfer-fatal-studio"
  );
}

export async function downloadStudioBackup(
  projects: StudioProject[],
  settings: StudioSettings,
) {
  const referencedMediaIds = new Set([
    ...settings.customFonts.map((font) => font.mediaId),
    ...projects.flatMap((project) => project.characters.flatMap((character) => [
      ...character.imageIds,
      ...character.outfits.flatMap((outfit) => outfit.imageIds),
    ])),
    ...projects.flatMap((project) => project.boards.flatMap((board) => [
      ...(board.bannerMediaId ? [board.bannerMediaId] : []),
      ...board.nodes.flatMap((node) => node.imageId ? [node.imageId] : []),
      ...board.history.flatMap((entry) => [
        ...(entry.snapshot.bannerMediaId ? [entry.snapshot.bannerMediaId] : []),
        ...entry.snapshot.nodes.flatMap((node) => node.imageId ? [node.imageId] : []),
      ]),
    ])),
  ]);
  const media = (await loadAllMedia()).filter((item) => referencedMediaIds.has(item.id));
  const mediaEntries: Record<string, Uint8Array> = {};
  const manifestMedia: ManifestMedia[] = [];

  for (const item of media) {
    const path = `media/${item.id}-${safeFilename(item.name)}`;
    mediaEntries[path] = new Uint8Array(await item.blob.arrayBuffer());
    manifestMedia.push({
      id: item.id,
      projectId: item.projectId,
      kind: item.kind,
      name: item.name,
      mimeType: item.mimeType,
      createdAt: item.createdAt,
      path,
    });
  }

  const savedProjects = projects.map((project) => ({
    ...project,
    savedRevision: project.revision,
  }));
  const savedSettings = { ...settings, savedRevision: settings.revision };
  const manifest = {
    format: "enfer-fatal-studio-backup",
    formatVersion: 4,
    exportedAt: new Date().toISOString(),
    projectCount: savedProjects.length,
    media: manifestMedia,
  };
  const archive = zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "studio.json": strToU8(JSON.stringify({ projects: savedProjects, settings: savedSettings }, null, 2)),
      ...mediaEntries,
    },
    { level: settings.backupExtension === "efs" ? 0 : 6 },
  );
  const payload = new Uint8Array(archive.byteLength);
  payload.set(archive);
  const mime = settings.backupExtension === "efs"
    ? "application/vnd.enfer-fatal-studio"
    : "application/zip";
  downloadBlob(
    new Blob([payload.buffer], { type: mime }),
    `${safeFilename(settings.backupFilename)}.${settings.backupExtension}`,
  );
}

export async function readStudioBackup(file: File): Promise<StudioBackup> {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Le fichier n’est pas une archive EFS ou ZIP valide.");
  }

  const manifestFile = archive["manifest.json"];
  if (!manifestFile) throw new Error("Le manifeste de sauvegarde est manquant.");
  const manifest = JSON.parse(strFromU8(manifestFile)) as {
    format?: string;
    media?: ManifestMedia[];
  };

  if (manifest.format === "enfer-fatal-studio-backup") {
    const studioFile = archive["studio.json"];
    if (!studioFile) throw new Error("Les données globales du Studio sont manquantes.");
    const data = JSON.parse(strFromU8(studioFile)) as { projects?: unknown[]; settings?: unknown };
    const projects = Array.isArray(data.projects) ? data.projects.map(normalizeProject) : [];
    const settings = mergeLegacyFonts(projects, normalizeSettings(data.settings));
    return { projects, settings, media: readMedia(archive, manifest.media ?? []) };
  }

  // Compatibility with the previous one-project .efstudio.zip format.
  if (manifest.format === "enfer-fatal-studio" && archive["project.json"]) {
    const project = normalizeImportedProject(JSON.parse(strFromU8(archive["project.json"])));
    const settings = mergeLegacyFonts([project], createDefaultSettings());
    return { projects: [project], settings, media: readMedia(archive, manifest.media ?? []) };
  }

  throw new Error("Ce fichier n’est pas une sauvegarde Enfer Fatal Studio reconnue.");
}

/** Compatibility helpers for the previous project-by-project UI. */
export async function downloadProject(project: StudioProject) {
  const settings = createDefaultSettings();
  settings.backupExtension = "zip";
  settings.backupFilename = project.name;
  return downloadStudioBackup([project], settings);
}

export async function readProjectFile(file: File) {
  const backup = await readStudioBackup(file);
  const project = backup.projects[0];
  if (!project) throw new Error("La sauvegarde ne contient aucun projet.");
  return { project, media: backup.media };
}

function mergeLegacyFonts(projects: StudioProject[], settings: StudioSettings) {
  const known = new Set(settings.customFonts.map((font) => font.mediaId));
  const legacy = projects.flatMap((project) => project.customFonts).filter((font) => {
    if (known.has(font.mediaId)) return false;
    known.add(font.mediaId);
    return true;
  });
  return { ...settings, customFonts: [...settings.customFonts, ...legacy] };
}

function readMedia(archive: Record<string, Uint8Array>, entries: ManifestMedia[]) {
  return entries.flatMap((item) => {
    const bytes = archive[item.path];
    if (!bytes) return [];
    const payload = new Uint8Array(bytes.byteLength);
    payload.set(bytes);
    return [{
      id: item.id,
      projectId: item.projectId,
      kind: item.kind,
      name: item.name,
      mimeType: item.mimeType,
      createdAt: item.createdAt,
      blob: new Blob([payload.buffer], { type: item.mimeType }),
    } satisfies StudioMedia];
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
