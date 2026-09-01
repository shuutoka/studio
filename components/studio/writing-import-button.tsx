"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { readWritingDocument, type ImportedWritingDocument } from "@/lib/writing-import";

export function WritingImportButton({ onImport }: { onImport: (document: ImportedWritingDocument) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [document, setDocument] = useState<ImportedWritingDocument | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function read(file?: File) {
    if (!file) return;
    setLoading(true);
    try {
      const result = await readWritingDocument(file);
      setDocument(result);
      setTitle(result.title);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <><input ref={inputRef} type="file" className="hidden" accept=".docx,.odt,.txt,.html,.htm,text/plain,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text" onChange={(event) => void read(event.target.files?.[0])} /><Button size="sm" variant="outline" className="border-white/10" disabled={loading} onClick={() => inputRef.current?.click()}>{loading ? <LoaderCircle className="animate-spin" /> : <FileUp />}<span className="hidden sm:inline">Importer</span></Button><Dialog open={Boolean(document)} onOpenChange={(open) => !open && setDocument(null)}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Importer le manuscrit</DialogTitle><DialogDescription className="text-[#9c96a5]">Le document sera ajouté comme un nouveau volume. Les sauts de page explicites sont conservés.</DialogDescription></DialogHeader><label className="grid gap-2 text-xs text-[#aaa4b4]">Nom du volume<Input value={title} className="border-white/10 bg-black/20" onChange={(event) => setTitle(event.target.value)} /></label><p className="rounded-xl border border-white/8 bg-black/15 p-3 text-xs text-[#8f8996]">{document?.pages.length ?? 0} page(s) détectée(s) · {document?.sourceFormat.toUpperCase()}</p><DialogFooter><Button variant="ghost" onClick={() => setDocument(null)}>Annuler</Button><Button className="bg-[#ef4f5f] text-white" disabled={!title.trim()} onClick={() => { if (!document) return; onImport({ ...document, title: title.trim() }); setDocument(null); toast.success("Manuscrit importé dans un nouveau volume."); }}>Importer</Button></DialogFooter></DialogContent></Dialog></>;
}
