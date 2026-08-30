"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold, Heading2, Italic, List, ListOrdered, Minus, Palette, Redo2,
  Sigma, Underline, Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isSingleKeyShortcut, matchesShortcut } from "@/lib/shortcuts";
import {
  PAGE_FORMATS,
  STANDARD_FONTS,
  type CharacterShortcut,
  type FooterType,
  type PageFormat,
  type QuoteStyle,
  type StudioFont,
  type StudioShortcuts,
} from "@/lib/studio";

type RichTextEditorProps = {
  documentId: string;
  html: string;
  format: PageFormat;
  backgroundColor?: string;
  customFonts: StudioFont[];
  enabledStandardFonts?: string[];
  quoteStyle?: QuoteStyle;
  shortcuts?: StudioShortcuts;
  characterShortcuts?: CharacterShortcut[];
  footerType?: FooterType;
  footerText?: string;
  pageNumber?: number;
  onChange: (html: string) => void;
  onPageBreak?: () => void;
};

const allowedElements = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FONT", "H1", "H2", "H3",
  "HR", "I", "LI", "OL", "P", "SPAN", "STRIKE", "STRONG", "U", "UL",
]);

const baseSpecialCharacters = ["—", "–", "…", "•", "©", "®", "™", "°", "±", "×", "÷", "œ", "Œ", "æ", "Æ"];

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
      const allowed = name === "href" || name === "style" || name === "color" || name === "size" || name === "face";
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
  documentId, html, format, backgroundColor = "#f7f4ed", customFonts,
  enabledStandardFonts = STANDARD_FONTS.map((font) => font.id), quoteStyle = "french",
  shortcuts = { save: "Ctrl+S", focus: "Ctrl+Shift+F", pageBreak: "Ctrl+Enter", emDash: "Ctrl+-" },
  characterShortcuts = [], footerType = "none", footerText = "", pageNumber = 1,
  onChange, onPageBreak = () => undefined,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const loadedDocumentId = useRef<string | null>(null);
  const lastSingleKey = useRef<{ shortcut: string; time: number } | null>(null);
  const [fillRatio, setFillRatio] = useState(0);
  const formatDefinition = PAGE_FORMATS[format];
  const hasPageLimit = formatDefinition.height !== null;
  const darkBackground = isDark(backgroundColor);
  const textColor = darkBackground ? "#eeeaf2" : "#29262b";
  const fonts = [
    ...STANDARD_FONTS.filter((font) => enabledStandardFonts.includes(font.id)),
    ...customFonts.filter((font) => font.enabled).map((font) => ({ id: font.id, label: font.name, family: font.family })),
  ];

  const measureFill = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !hasPageLimit) { setFillRatio(0); return; }
    setFillRatio(editor.clientHeight ? editor.scrollHeight / editor.clientHeight : 0);
  }, [hasPageLimit]);

  useEffect(() => {
    if (editorRef.current && loadedDocumentId.current !== documentId) {
      editorRef.current.innerHTML = sanitizeHtml(html);
      loadedDocumentId.current = documentId;
      window.requestAnimationFrame(measureFill);
    }
  }, [documentId, html, measureFill]);

  useEffect(() => { window.requestAnimationFrame(measureFill); }, [format, footerType, measureFill]);

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

  function insertText(value: string) {
    run("insertText", value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (matchesShortcut(event, shortcuts.pageBreak)) {
      event.preventDefault();
      onPageBreak();
      return;
    }
    if (matchesShortcut(event, shortcuts.emDash)) {
      event.preventDefault();
      insertText("—");
      return;
    }
    const binding = characterShortcuts.find((item) => item.shortcut && matchesShortcut(event, item.shortcut));
    if (!binding) return;
    if (binding.pressMode === "single" || !isSingleKeyShortcut(binding.shortcut)) {
      event.preventDefault();
      insertText(binding.character);
      return;
    }
    const now = event.timeStamp;
    if (lastSingleKey.current?.shortcut === binding.shortcut && now - lastSingleKey.current.time < 450) {
      event.preventDefault();
      document.execCommand("delete");
      insertText(binding.character);
      lastSingleKey.current = null;
    } else {
      lastSingleKey.current = { shortcut: binding.shortcut, time: now };
    }
  }

  const footer = footerType === "page"
    ? `— ${pageNumber} —`
    : footerType === "date"
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())
      : footerType === "custom" ? footerText : "";
  const specialCharacters = quoteStyle === "french"
    ? ["« ", " »", ...baseSpecialCharacters]
    : ["\"", "'", ...baseSpecialCharacters];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#111016] shadow-[0_24px_70px_rgba(0,0,0,.28)]">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/8 bg-[#17151d] px-3 py-2">
        <Select defaultValue="p" onValueChange={(value) => run("formatBlock", value)}>
          <SelectTrigger aria-label="Style du paragraphe" className="mr-1 w-[126px] border-white/10 bg-white/4" size="sm"><Heading2 className="size-4" /><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="p">Paragraphe</SelectItem><SelectItem value="h1">Titre 1</SelectItem><SelectItem value="h2">Titre 2</SelectItem><SelectItem value="h3">Titre 3</SelectItem><SelectItem value="blockquote">Citation</SelectItem></SelectContent>
        </Select>

        <Select defaultValue={fonts[0]?.family ?? "__none__"} onValueChange={(value) => { if (value !== "__none__") run("fontName", value); }}>
          <SelectTrigger aria-label="Police" className="w-[142px] border-white/10 bg-white/4" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>{fonts.length ? fonts.map((font) => <SelectItem key={font.id} value={font.family}>{font.label}</SelectItem>) : <SelectItem value="__none__">Aucune police active</SelectItem>}</SelectContent>
        </Select>

        <Select defaultValue="3" onValueChange={(value) => run("fontSize", value)}>
          <SelectTrigger aria-label="Taille du texte" className="w-[76px] border-white/10 bg-white/4" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="1">9 pt</SelectItem><SelectItem value="2">10 pt</SelectItem><SelectItem value="3">12 pt</SelectItem><SelectItem value="4">14 pt</SelectItem><SelectItem value="5">18 pt</SelectItem><SelectItem value="6">24 pt</SelectItem><SelectItem value="7">32 pt</SelectItem></SelectContent>
        </Select>

        <ToolbarButton label="Gras" onClick={() => run("bold")}><Bold /></ToolbarButton>
        <ToolbarButton label="Italique" onClick={() => run("italic")}><Italic /></ToolbarButton>
        <ToolbarButton label="Souligné" onClick={() => run("underline")}><Underline /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <ToolbarButton label="Liste à puces" onClick={() => run("insertUnorderedList")}><List /></ToolbarButton>
        <ToolbarButton label="Liste numérotée" onClick={() => run("insertOrderedList")}><ListOrdered /></ToolbarButton>
        <ToolbarButton label="Séparateur" onClick={() => run("insertHorizontalRule")}><Minus /></ToolbarButton>
        <label className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-[#aaa4b4] transition-colors hover:bg-white/7 hover:text-white" title="Couleur du texte"><Palette className="size-4" /><input aria-label="Couleur du texte" className="absolute inset-0 cursor-pointer opacity-0" type="color" defaultValue={textColor} onChange={(event) => run("foreColor", event.target.value)} /></label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button aria-label="Caractères spéciaux" title="Caractères spéciaux" type="button" variant="ghost" size="icon-sm" className="text-[#aaa4b4]"><Sigma /></Button></DropdownMenuTrigger>
          <DropdownMenuContent className="grid grid-cols-4 gap-1 p-2">
            {specialCharacters.map((character, index) => <DropdownMenuItem key={`${character}-${index}`} className="grid size-9 place-items-center p-0 text-base" onSelect={() => insertText(character)}>{character}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <ToolbarButton label="Annuler" onClick={() => run("undo")}><Undo2 /></ToolbarButton>
        <ToolbarButton label="Rétablir" onClick={() => run("redo")}><Redo2 /></ToolbarButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[#09080b] p-4 sm:p-7">
        <div
          className={`mx-auto flex flex-col overflow-hidden shadow-[0_18px_55px_rgba(0,0,0,.45)] ${hasPageLimit ? "paper-sheet" : "rounded-xl border border-white/8"}`}
          style={{
            backgroundColor,
            color: textColor,
            width: hasPageLimit ? `min(100%, ${formatDefinition.width}px)` : "100%",
            ...(hasPageLimit ? { aspectRatio: `${formatDefinition.width} / ${formatDefinition.height}` } : { minHeight: 460 }),
          }}
        >
          <div
            ref={editorRef}
            className={`studio-editor min-h-0 flex-1 overflow-y-auto px-[clamp(1.5rem,8%,5rem)] py-[clamp(2rem,9%,5rem)] text-[16px] leading-7 outline-none ${darkBackground ? "editor-dark-surface" : "paper-editor"}`}
            contentEditable role="textbox" aria-label="Contenu de la page" aria-multiline="true"
            suppressContentEditableWarning onInput={emitChange} onKeyDown={handleKeyDown}
          />
          {footer && <div className="shrink-0 border-t border-current/10 px-8 py-3 text-center text-[11px] opacity-65">{footer}</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-[#17151d] px-4 py-2 text-[11px] text-[#77717f]">
        <span>{formatDefinition.label} · {formatDefinition.detail}</span>
        <span>{shortcuts.pageBreak} : nouvelle page</span>
        {hasPageLimit && <span className={fillRatio > 1 ? "font-semibold text-[#ff7885]" : "text-[#8f8996]"}>{fillRatio > 1 ? `Dépassement estimé : ${Math.round((fillRatio - 1) * 100)} %` : `Remplissage estimé : ${Math.round(fillRatio * 100)} %`}</span>}
      </div>
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <Button aria-label={label} title={label} type="button" variant="ghost" size="icon-sm" className="text-[#aaa4b4] hover:bg-white/7 hover:text-white" onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{children}</Button>;
}

function isDark(hex: string) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 145;
}
