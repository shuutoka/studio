"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_FORMATS, type PageFormat } from "@/lib/studio";
import { readWritingDocument, removeImportedFormatting, type ImportedWritingDocument } from "@/lib/writing-import";

export function WritingImportButton({ onImport }: { onImport: (document: ImportedWritingDocument) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [document, setDocument] = useState<ImportedWritingDocument | null>(null);
  const [title, setTitle] = useState("");
  const [pageFormat, setPageFormat] = useState<PageFormat>("a4");
  const [removeFormatting, setRemoveFormatting] = useState(false);
  const [loading, setLoading] = useState(false);

  async function read(file?: File) {
    if (!file) return;
    setLoading(true);
    try {
      const result = await readWritingDocument(file);
      setDocument(result);
      setTitle(result.title);
      setPageFormat(result.pageFormat);
      setRemoveFormatting(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <><input ref={inputRef} type="file" className="hidden" accept=".docx,.odt,.txt,.html,.htm,text/plain,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text" onChange={(event) => void read(event.target.files?.[0])} /><Button size="sm" variant="outline" className="border-white/10" disabled={loading} onClick={() => inputRef.current?.click()}>{loading ? <LoaderCircle className="animate-spin" /> : <FileUp />}<span className="hidden sm:inline">Importer</span></Button><Dialog open={Boolean(document)} onOpenChange={(open) => !open && setDocument(null)}><DialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]"><DialogHeader><DialogTitle>Importer le manuscrit</DialogTitle><DialogDescription className="text-[#9c96a5]">Le document sera ajouté comme un nouveau volume. Les pages, styles de texte et surlignages reconnus sont conservés.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-xs text-[#aaa4b4]">Nom du volume<Input value={title} className="border-white/10 bg-black/20" onChange={(event) => setTitle(event.target.value)} /></label><label className="grid gap-2 text-xs text-[#aaa4b4]">Format des pages<Select value={pageFormat} onValueChange={(value: PageFormat) => setPageFormat(value)}><SelectTrigger className="w-full border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAGE_FORMATS).map(([value, format]) => <SelectItem key={value} value={value}>{format.label} — {format.detail}</SelectItem>)}</SelectContent></Select></label><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/8 bg-black/15 p-3 text-sm text-[#c8c2cf]"><Checkbox checked={removeFormatting} onCheckedChange={(checked) => setRemoveFormatting(checked === true)} /><span><span className="block font-medium text-white">Supprimer la mise en forme</span><span className="mt-0.5 block text-xs text-[#77717f]">Conserver uniquement le texte, les paragraphes et les pages.</span></span></label><p className="rounded-xl border border-white/8 bg-black/15 p-3 text-xs text-[#8f8996]">{document?.pages.length ?? 0} page(s) détectée(s) · {document?.sourceFormat.toUpperCase()}</p></div><DialogFooter><Button variant="ghost" onClick={() => setDocument(null)}>Annuler</Button><Button className="bg-[#ef4f5f] text-white" disabled={!title.trim()} onClick={() => { if (!document) return; onImport({ ...document, title: title.trim(), pageFormat, pages: removeFormatting ? removeImportedFormatting(document.pages) : document.pages }); setDocument(null); toast.success("Manuscrit importé dans un nouveau volume."); }}>Importer</Button></DialogFooter></DialogContent></Dialog></>;
}
