import { loadMedia, persistMedia } from "@/lib/studio-db";
import { createProjectWritingDocx } from "@/lib/writing-export";
import { writingDocumentMediaId } from "@/lib/writing-document-id";
import type { StudioProject } from "@/lib/studio";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function loadOrCreateWritingDocument(project: StudioProject, volumeId: string) {
  const media = await loadMedia(writingDocumentMediaId(volumeId));
  if (media?.blob) return media.blob;

  const volume = project.volumes.find((candidate) => candidate.id === volumeId);
  if (!volume) throw new Error("Le volume demandé est introuvable.");
  const blob = createProjectWritingDocx(project, volumeId);
  await persistWritingDocument(project.id, volumeId, volume.title, blob);
  return blob;
}

export async function persistWritingDocument(
  projectId: string,
  volumeId: string,
  volumeTitle: string,
  blob: Blob,
) {
  await persistMedia({
    id: writingDocumentMediaId(volumeId),
    projectId,
    kind: "writing-docx",
    name: `${volumeTitle || "Manuscrit"}.docx`,
    mimeType: DOCX_MIME,
    createdAt: new Date().toISOString(),
    blob: blob.type === DOCX_MIME ? blob : new Blob([await blob.arrayBuffer()], { type: DOCX_MIME }),
  });
}
