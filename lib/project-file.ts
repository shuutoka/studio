import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { loadProjectMedia } from "@/lib/studio-db";
import {
  normalizeImportedProject,
  type StudioMedia,
  type StudioProject,
} from "@/lib/studio";

function safeFilename(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_.]+/g, "-")
      .replace(/^-+|-+$/g, "") || "fichier"
  );
}

export async function downloadProject(project: StudioProject) {
  const media = await loadProjectMedia(project.id);
  const mediaEntries: Record<string, Uint8Array> = {};
  const manifestMedia: Array<Omit<StudioMedia, "blob"> & { path: string }> = [];

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

  const manifest = {
    format: "enfer-fatal-studio",
    formatVersion: 2,
    projectId: project.id,
    projectName: project.name,
    exportedAt: new Date().toISOString(),
    media: manifestMedia,
  };
  const archive = zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "project.json": strToU8(JSON.stringify(project, null, 2)),
      ...mediaEntries,
    },
    { level: 6 },
  );
  const payload = new Uint8Array(archive.byteLength);
  payload.set(archive);
  const blob = new Blob([payload.buffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(project.name)}.efstudio.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function readProjectFile(file: File): Promise<{
  project: StudioProject;
  media: StudioMedia[];
}> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const projectFile = archive["project.json"];
  const manifestFile = archive["manifest.json"];

  if (!projectFile || !manifestFile) {
    throw new Error("Cette archive ne contient pas un projet complet.");
  }

  const manifest = JSON.parse(strFromU8(manifestFile)) as {
    format?: string;
    media?: Array<{
      id: string;
      projectId: string;
      kind: StudioMedia["kind"];
      name: string;
      mimeType: string;
      createdAt: string;
      path: string;
    }>;
  };
  if (manifest.format !== "enfer-fatal-studio") {
    throw new Error("Ce fichier n’est pas une sauvegarde Enfer Fatal Studio.");
  }

  const project = normalizeImportedProject(JSON.parse(strFromU8(projectFile)));
  const media = (manifest.media ?? []).flatMap((item) => {
    const bytes = archive[item.path];
    if (!bytes) return [];
    const payload = new Uint8Array(bytes.byteLength);
    payload.set(bytes);
    return [
      {
        id: item.id,
        projectId: project.id,
        kind: item.kind,
        name: item.name,
        mimeType: item.mimeType,
        createdAt: item.createdAt,
        blob: new Blob([payload.buffer], { type: item.mimeType }),
      } satisfies StudioMedia,
    ];
  });

  return { project, media };
}
