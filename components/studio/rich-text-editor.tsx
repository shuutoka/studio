"use client";

import { useEffect, useRef } from "react";
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

type RichTextEditorProps = {
  documentId: string;
  html: string;
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
        name === "href" || name === "style" || name === "color" || name === "size";
      if (!allowed || name.startsWith("on")) element.removeAttribute(attribute.name);
    });

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:|#)/i.test(href)) element.removeAttribute("href");
    }
  });

  return parsed.body.innerHTML;
}

export function RichTextEditor({ documentId, html, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const loadedDocumentId = useRef<string | null>(null);

  useEffect(() => {
    if (editorRef.current && loadedDocumentId.current !== documentId) {
      editorRef.current.innerHTML = sanitizeHtml(html);
      loadedDocumentId.current = documentId;
    }
  }, [documentId, html]);

  function emitChange() {
    if (!editorRef.current) return;
    onChange(sanitizeHtml(editorRef.current.innerHTML));
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
          <SelectTrigger
            aria-label="Style du paragraphe"
            className="mr-1 w-[132px] border-white/10 bg-white/4"
            size="sm"
          >
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

        <ToolbarButton label="Gras" onClick={() => run("bold")}>
          <Bold />
        </ToolbarButton>
        <ToolbarButton label="Italique" onClick={() => run("italic")}>
          <Italic />
        </ToolbarButton>
        <ToolbarButton label="Souligné" onClick={() => run("underline")}>
          <Underline />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <ToolbarButton label="Liste à puces" onClick={() => run("insertUnorderedList")}>
          <List />
        </ToolbarButton>
        <ToolbarButton label="Liste numérotée" onClick={() => run("insertOrderedList")}>
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton label="Séparateur" onClick={() => run("insertHorizontalRule")}>
          <Minus />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <label
          className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-[#aaa4b4] transition-colors hover:bg-white/7 hover:text-white"
          title="Couleur du texte"
        >
          <Palette className="size-4" />
          <input
            aria-label="Couleur du texte"
            className="absolute inset-0 cursor-pointer opacity-0"
            type="color"
            defaultValue="#e9e5ef"
            onChange={(event) => run("foreColor", event.target.value)}
          />
        </label>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <ToolbarButton label="Annuler" onClick={() => run("undo")}>
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton label="Rétablir" onClick={() => run("redo")}>
          <Redo2 />
        </ToolbarButton>
      </div>

      <div
        ref={editorRef}
        className="studio-editor min-h-[430px] flex-1 overflow-y-auto px-[clamp(1.5rem,6vw,5.5rem)] py-10 text-[17px] leading-8 text-[#ddd8e5] outline-none"
        contentEditable
        role="textbox"
        aria-label="Contenu de la page"
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={emitChange}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
