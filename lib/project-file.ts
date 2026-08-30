import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  normalizeImportedProject,
  type StudioProject,
} from "@/lib/studio";

function safeFilename(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "projet"
  );
}

export function downloadProject(project: StudioProject) {
  const manifest = {
    format: "enfer-fatal-studio",
    formatVersion: 1,
    projectId: project.id,
    projectName: project.name,
    exportedAt: new Date().toISOString(),
  };
  const archive = zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "project.json": strToU8(JSON.stringify(project, null, 2)),
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

export async function readProjectFile(file: File) {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const projectFile = archive["project.json"];
  const manifestFile = archive["manifest.json"];

  if (!projectFile || !manifestFile) {
    throw new Error("Cette archive ne contient pas un projet complet.");
  }

  const manifest = JSON.parse(strFromU8(manifestFile)) as { format?: string };
  if (manifest.format !== "enfer-fatal-studio") {
    throw new Error("Ce fichier n’est pas une sauvegarde Enfer Fatal Studio.");
  }

  return normalizeImportedProject(JSON.parse(strFromU8(projectFile)));
}
