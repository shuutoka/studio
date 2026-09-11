import { getActiveWritingDocument } from "@/lib/writing-editor-registry";
import { loadOrCreateWritingDocument } from "@/lib/writing-document";
import { getManuscriptFilename } from "@/lib/writing-export";
import { getVolumePages, stripHtml, type StudioProject } from "@/lib/studio";

export type NativeWritingExportFormat = "docx" | "pdf" | "print" | "txt";
export type NativeWritingExportResult = "download" | "print";

export async function exportNativeWriting(
  project: StudioProject,
  volumeId: string,
  format: NativeWritingExportFormat,
): Promise<NativeWritingExportResult> {
  const volume = project.volumes.find((candidate) => candidate.id === volumeId);
  if (!volume) throw new Error("Le manuscrit sélectionné est introuvable.");
  const filename = getManuscriptFilename(project, volumeId);
  const active = getActiveWritingDocument(volumeId);
  await active?.flush();

  if (format === "pdf" || format === "print") {
    if (!active?.print(filename)) {
      throw new Error("Ouvrez ce volume dans l’espace Écriture avant de créer le PDF ou de l’imprimer.");
    }
    return "print";
  }

  if (format === "txt") {
    const text = active?.getText() || volume.documentText || getVolumePages(volume)
      .map((page) => stripHtml(page.content))
      .join("\f");
    download(new Blob([text], { type: "text/plain;charset=utf-8" }), `${filename}.txt`);
    return "download";
  }

  const blob = active
    ? await active.exportDocx()
    : await loadOrCreateWritingDocument(project, volumeId);
  download(blob, `${filename}.docx`);
  return "download";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
