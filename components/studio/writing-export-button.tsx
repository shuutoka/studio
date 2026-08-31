"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StudioProject } from "@/lib/studio";
import {
  exportProjectWriting, getManuscriptFilename, getManuscriptPageCount,
  type WritingExportFormat,
} from "@/lib/writing-export";

export function WritingExportButton({
  project, initialVolumeId, compact = false,
}: {
  project: StudioProject;
  initialVolumeId?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<WritingExportFormat>("docx");
  const [volumeId, setVolumeId] = useState(initialVolumeId ?? project.volumes[0]?.id ?? "");
  const selectedVolumeId = project.volumes.some((volume) => volume.id === volumeId)
    ? volumeId
    : project.volumes[0]?.id ?? "";
  const manuscriptPageCount = selectedVolumeId ? getManuscriptPageCount(project, selectedVolumeId) : 0;

  function openDialog() {
    const preferred = initialVolumeId && project.volumes.some((volume) => volume.id === initialVolumeId)
      ? initialVolumeId
      : project.volumes[0]?.id ?? "";
    setVolumeId(preferred);
    setOpen(true);
  }

  function startExport() {
    if (!selectedVolumeId) return;
    try {
      const result = exportProjectWriting(project, selectedVolumeId, format);
      setOpen(false);
      toast.success(result === "print"
        ? format === "pdf"
          ? "Choisissez « Enregistrer au format PDF » dans la fenêtre ouverte."
          : "Le dialogue d’impression a été ouvert."
        : "Le manuscrit a été exporté.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’export du manuscrit a échoué.");
    }
  }

  return <>
    <Button variant="outline" size={compact ? "sm" : "default"} className="shrink-0 border-white/10 bg-white/3" onClick={openDialog}><FileDown /> {compact ? "Exporter" : "Exporter l’écriture"}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]">
        <DialogHeader>
          <DialogTitle>Exporter un manuscrit</DialogTitle>
          <DialogDescription className="text-[#9c96a5]">Choisissez le volume et le format. Les pages vides, sauts de page, images et mises en forme compatibles sont conservés.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Manuscrit à exporter
            <Select value={selectedVolumeId} onValueChange={setVolumeId} disabled={!project.volumes.length}>
              <SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue placeholder="Aucun volume" /></SelectTrigger>
              <SelectContent>{project.volumes.map((volume) => <SelectItem key={volume.id} value={volume.id}>{volume.title} — {getManuscriptPageCount(project, volume.id)} page(s)</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-xs font-medium text-[#aaa4b4]">Format du document
            <Select value={format} onValueChange={(value: WritingExportFormat) => setFormat(value)}>
              <SelectTrigger className="w-full border-white/10 bg-white/4"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="pdf">PDF — enregistrer depuis la fenêtre</SelectItem><SelectItem value="print">PDF impression / papier</SelectItem><SelectItem value="docx">Word .docx</SelectItem><SelectItem value="odt">OpenDocument .odt</SelectItem><SelectItem value="txt">Texte brut .txt</SelectItem></SelectContent>
            </Select>
          </label>
          {selectedVolumeId && <p className="rounded-lg border border-white/8 bg-black/15 px-3 py-2 text-xs text-[#8f8996]">{format === "print" ? "Impression" : <>Fichier : <span className="font-mono text-[#c8c2cf]">{getManuscriptFilename(project, selectedVolumeId)}.{format}</span></>} · {manuscriptPageCount} page{manuscriptPageCount > 1 ? "s" : ""}</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button className="bg-[#ef4f5f] text-white" disabled={!selectedVolumeId || manuscriptPageCount === 0} onClick={startExport}><FileDown /> Exporter</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
