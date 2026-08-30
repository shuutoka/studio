"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Palette,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_FORMATS, type PageFormat, type StudioFont } from "@/lib/studio";

type RichTextEditorProps = {
  documentId: string;
  html: string;
  format: PageFormat;
  customFonts: StudioFont[];
  onChange: (html: string) => void;
};

const allowedElements = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "DIV",
  "EM",
  "FONT",
  "H1",
  "H2",
  "H3",
  "HR",
  "I",
  "LI",
  "OL",
  "P",
  "SPAN",
  "STRIKE",
  "STRONG",
  "U",
  "UL",
]);

const standardFonts = [
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times", value: "Times New Roman" },
  { label: "Verdana", value: "Verdana" },
  { label: "Trebuchet", value: "Trebuchet MS" },
  { label: "Courier", value: "Courier New" },
];

function sanitizeHtml(html: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");

  [...parsed.body.querySelectorAll("*")].forEach((element) => {
    if (!allowedElements.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const allowed =
        name === "href" || name === "style" || name === "color" || name === "size" || name === "face";
      if (!allowed || name.startsWith("on")) element.removeAttribute(attribute.name);
    });

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:|#)/i.test(href)) element.removeAttribute("href");
    }
  });

  return parsed.body.innerHTML;
}

export function RichTextEditor({
  documentId,
  html,
  format,
  customFonts,
  onChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const loadedDocumentId = useRef<string | null>(null);
  const [fillRatio, setFillRatio] = useState(0);
  const formatDefinition = PAGE_FORMATS[format];
  const hasPageLimit = formatDefinition.height !== null;

  const measureFill = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !hasPageLimit) {
      setFillRatio(0);
      return;
    }
    setFillRatio(editor.clientHeight ? editor.scrollHeight / editor.clientHeight : 0);
  }, [hasPageLimit]);

  useEffect(() => {
    if (editorRef.current && loadedDocumentId.current !== documentId) {
      editorRef.current.innerHTML = sanitizeHtml(html);
      loadedDocumentId.current = documentId;
      window.requestAnimationFrame(measureFill);
    }
  }, [documentId, html, measureFill]);

  useEffect(() => {
    window.requestAnimationFrame(measureFill);
  }, [format, measureFill]);

  function emitChange() {
    if (!editorRef.current) return;
    onChange(sanitizeHtml(editorRef.current.innerHTML));
    measureFill();
  }

  function run(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    emitChange();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#111016] shadow-[0_24px_70px_rgba(0,0,0,.28)]">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/8 bg-[#17151d] px-3 py-2">
        <Select defaultValue="p" onValueChange={(value) => run("formatBlock", value)}>
          <SelectTrigger aria-label="Style du paragraphe" className="mr-1 w-[126px] border-white/10 bg-white/4" size="sm">
            <Heading2 className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="p">Paragraphe</SelectItem>
            <SelectItem value="h1">Titre 1</SelectItem>
            <SelectItem value="h2">Titre 2</SelectItem>
            <SelectItem value="h3">Titre 3</SelectItem>
            <SelectItem value="blockquote">Citation</SelectItem>
          </SelectContent>
        </Select>

        <Select defaultValue="Arial" onValueChange={(value) => run("fontName", value)}>
          <SelectTrigger aria-label="Police" className="w-[126px] border-white/10 bg-white/4" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {standardFonts.map((font) => (
              <SelectItem key={font.value} value={font.value}>{font.label}</SelectItem>
            ))}
            {customFonts.map((font) => (
              <SelectItem key={font.id} value={font.family}>{font.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select defaultValue="3" onValueChange={(value) => run("fontSize", value)}>
          <SelectTrigger aria-label="Taille du texte" className="w-[76px] border-white/10 bg-white/4" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">9 pt</SelectItem>
            <SelectItem value="2">10 pt</SelectItem>
            <SelectItem value="3">12 pt</SelectItem>
            <SelectItem value="4">14 pt</SelectItem>
            <SelectItem value="5">18 pt</SelectItem>
            <SelectItem value="6">24 pt</SelectItem>
            <SelectItem value="7">32 pt</SelectItem>
          </SelectContent>
        </Select>

        <ToolbarButton label="Gras" onClick={() => run("bold")}><Bold /></ToolbarButton>
        <ToolbarButton label="Italique" onClick={() => run("italic")}><Italic /></ToolbarButton>
        <ToolbarButton label="Souligné" onClick={() => run("underline")}><Underline /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <ToolbarButton label="Liste à puces" onClick={() => run("insertUnorderedList")}><List /></ToolbarButton>
        <ToolbarButton label="Liste numérotée" onClick={() => run("insertOrderedList")}><ListOrdered /></ToolbarButton>
        <ToolbarButton label="Séparateur" onClick={() => run("insertHorizontalRule")}><Minus /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <label className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-[#aaa4b4] transition-colors hover:bg-white/7 hover:text-white" title="Couleur du texte">
          <Palette className="size-4" />
          <input
            aria-label="Couleur du texte"
            className="absolute inset-0 cursor-pointer opacity-0"
            type="color"
            defaultValue="#222028"
            onChange={(event) => run("foreColor", event.target.value)}
          />
        </label>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <ToolbarButton label="Annuler" onClick={() => run("undo")}><Undo2 /></ToolbarButton>
        <ToolbarButton label="Rétablir" onClick={() => run("redo")}><Redo2 /></ToolbarButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[#09080b] p-4 sm:p-7">
        <div
          className={`mx-auto overflow-hidden shadow-[0_18px_55px_rgba(0,0,0,.45)] ${
            hasPageLimit ? "paper-sheet bg-[#f7f4ed]" : "rounded-xl border border-white/8 bg-[#15131a]"
          }`}
          style={
            hasPageLimit
              ? {
                  width: `min(100%, ${formatDefinition.width}px)`,
                  aspectRatio: `${formatDefinition.width} / ${formatDefinition.height}`,
                }
              : { width: "100%", minHeight: 460 }
          }
        >
          <div
            ref={editorRef}
            className={`studio-editor h-full overflow-y-auto px-[clamp(1.5rem,8%,5rem)] py-[clamp(2rem,9%,5rem)] text-[16px] leading-7 outline-none ${
              hasPageLimit ? "paper-editor text-[#29262b]" : "text-[#ddd8e5]"
            }`}
            contentEditable
            role="textbox"
            aria-label="Contenu de la page"
            aria-multiline="true"
            suppressContentEditableWarning
            onInput={emitChange}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-[#17151d] px-4 py-2 text-[11px] text-[#77717f]">
        <span>{formatDefinition.label} · {formatDefinition.detail}</span>
        {hasPageLimit && (
          <span className={fillRatio > 1 ? "font-semibold text-[#ff7885]" : "text-[#8f8996]"}>
            {fillRatio > 1
              ? `Dépassement estimé : ${Math.round((fillRatio - 1) * 100)} %`
              : `Remplissage estimé : ${Math.round(fillRatio * 100)} %`}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      aria-label={label}
      title={label}
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-[#aaa4b4] hover:bg-white/7 hover:text-white"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
