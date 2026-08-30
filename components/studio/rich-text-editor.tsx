"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold, Heading2, Italic, List, ListOrdered, Minus, Redo2,
  Sigma, Underline, Undo2,
} from "lucide-react";

import { ColorPicker } from "@/components/studio/color-picker";
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
  type WritingColorMode,
} from "@/lib/studio";

type RichTextEditorProps = {
  documentId: string;
  html: string;
  format: PageFormat;
  backgroundColor?: string;
  colorMode?: WritingColorMode;
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
  onOverflow?: (html: string) => void;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  navigationLanding?: "top" | "bottom";
  autoFocus?: boolean;
};

const allowedElements = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FONT", "H1", "H2", "H3",
  "HR", "I", "LI", "OL", "P", "SPAN", "STRIKE", "STRONG", "U", "UL",
]);

const baseSpecialCharacters = ["—", "–", "…", "•", "©", "®", "™", "°", "±", "×", "÷", "œ", "Œ", "æ", "Æ"];
const doublePressDelay = 450;

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
  documentId, html, format, backgroundColor = "#ffffff", customFonts,
  colorMode = "light",
  enabledStandardFonts = STANDARD_FONTS.map((font) => font.id), quoteStyle = "french",
  shortcuts = { save: "Ctrl+S", focus: "Ctrl+Shift+F", pageBreak: "Ctrl+Enter", emDash: "Ctrl+-" },
  characterShortcuts = [], footerType = "none", footerText = "", pageNumber = 1,
  onChange, onPageBreak = () => undefined, onOverflow = () => undefined,
  onNavigatePrevious, onNavigateNext, navigationLanding = "top", autoFocus = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollHostRef = useRef<HTMLDivElement>(null);
  const loadedDocumentId = useRef<string | null>(null);
  const pendingDoublePress = useRef<{ shortcut: string; fallback: string; timer: number } | null>(null);
  const nextFrenchQuoteIsOpening = useRef(true);
  const wheelLockedUntil = useRef(0);
  const [fillRatio, setFillRatio] = useState(0);
  const formatDefinition = PAGE_FORMATS[format];
  const hasPageLimit = formatDefinition.height !== null;
  const darkBackground = colorMode === "dark";
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
      nextFrenchQuoteIsOpening.current = true;
      if (pendingDoublePress.current) window.clearTimeout(pendingDoublePress.current.timer);
      pendingDoublePress.current = null;
      window.requestAnimationFrame(() => {
        measureFill();
        const scrollHost = scrollHostRef.current;
        if (scrollHost) scrollHost.scrollTop = navigationLanding === "bottom" ? scrollHost.scrollHeight : 0;
        if (autoFocus && editorRef.current) placeCaretAtEnd(editorRef.current);
      });
    }
  }, [autoFocus, documentId, html, measureFill, navigationLanding]);

  useEffect(() => { window.requestAnimationFrame(measureFill); }, [format, footerType, measureFill]);
  useEffect(() => { nextFrenchQuoteIsOpening.current = true; }, [quoteStyle]);
  useEffect(() => () => {
    if (pendingDoublePress.current) window.clearTimeout(pendingDoublePress.current.timer);
  }, []);

  function emitChange() {
    if (!editorRef.current) return;
    const overflow = hasPageLimit ? extractOverflowHtml(editorRef.current) : "";
    onChange(sanitizeHtml(editorRef.current.innerHTML));
    measureFill();
    if (overflow) onOverflow(sanitizeHtml(overflow));
  }

  function run(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    emitChange();
  }

  function insertText(value: string) {
    run("insertText", value);
  }

  function flushPendingDoublePress() {
    const pending = pendingDoublePress.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDoublePress.current = null;
    if (pending.fallback) insertText(pending.fallback);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const binding = characterShortcuts.find((item) => item.shortcut && matchesShortcut(event, item.shortcut));
    if (pendingDoublePress.current && pendingDoublePress.current.shortcut !== binding?.shortcut) {
      flushPendingDoublePress();
    }
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
    if (binding && (binding.pressMode === "single" || !isSingleKeyShortcut(binding.shortcut))) {
      event.preventDefault();
      insertText(binding.character);
      return;
    }
    if (binding) {
      event.preventDefault();
      const pending = pendingDoublePress.current;
      if (pending?.shortcut === binding.shortcut) {
        window.clearTimeout(pending.timer);
        pendingDoublePress.current = null;
        insertText(binding.character);
      } else {
        const fallback = event.key.length === 1 ? event.key : event.key === "Spacebar" ? " " : "";
        const timer = window.setTimeout(() => {
          const current = pendingDoublePress.current;
          if (current?.shortcut !== binding.shortcut) return;
          pendingDoublePress.current = null;
          if (current.fallback) insertText(current.fallback);
        }, doublePressDelay);
        pendingDoublePress.current = { shortcut: binding.shortcut, fallback, timer };
      }
      return;
    }
    if (event.key === "\"" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (quoteStyle === "straight") {
        insertText("\"");
      } else {
        insertText(nextFrenchQuoteIsOpening.current ? "« " : " »");
        nextFrenchQuoteIsOpening.current = !nextFrenchQuoteIsOpening.current;
      }
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const now = performance.now();
    if (now < wheelLockedUntil.current) return;
    const host = event.currentTarget;
    const atTop = host.scrollTop <= 2;
    const atBottom = host.scrollHeight - host.clientHeight - host.scrollTop <= 2;
    if (event.deltaY < 0 && atTop && onNavigatePrevious) {
      event.preventDefault();
      wheelLockedUntil.current = now + 280;
      onNavigatePrevious();
    } else if (event.deltaY > 0 && atBottom && onNavigateNext) {
      event.preventDefault();
      wheelLockedUntil.current = now + 280;
      onNavigateNext();
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
        <ColorPicker label="Couleur du texte" value={textColor} onChange={(value) => run("foreColor", value)} />
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

      <div ref={scrollHostRef} className="min-h-0 flex-1 overflow-auto bg-[#09080b] p-4 sm:p-7" onWheel={handleWheel}>
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
            className={`studio-editor min-h-0 flex-1 px-[clamp(1.5rem,8%,5rem)] py-[clamp(2rem,9%,5rem)] text-[16px] leading-7 outline-none ${hasPageLimit ? "overflow-hidden" : "overflow-y-auto"} ${darkBackground ? "editor-dark-surface" : "paper-editor"}`}
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

function extractOverflowHtml(editor: HTMLDivElement) {
  if (editor.scrollHeight <= editor.clientHeight + 1) return "";
  const bounds = editor.getBoundingClientRect();
  const paddingBottom = Number.parseFloat(window.getComputedStyle(editor).paddingBottom) || 0;
  const bottomLimit = bounds.bottom - paddingBottom - 1;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let startNode: Text | null = null;
  let startOffset = 0;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (!textNode.data) continue;
    const wholeRange = document.createRange();
    wholeRange.selectNodeContents(textNode);
    const lastRect = [...wholeRange.getClientRects()].at(-1);
    if (!lastRect || lastRect.bottom <= bottomLimit) continue;

    let low = 0;
    let high = textNode.data.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, middle);
      const rect = [...range.getClientRects()].at(-1);
      if (!rect || rect.bottom <= bottomLimit) low = middle;
      else high = middle - 1;
    }
    startOffset = low;
    const wordBoundary = Math.max(
      textNode.data.lastIndexOf(" ", Math.max(0, startOffset - 1)),
      textNode.data.lastIndexOf("\n", Math.max(0, startOffset - 1)),
    );
    if (wordBoundary >= Math.max(0, startOffset - 40)) startOffset = wordBoundary + 1;
    startNode = textNode;
    break;
  }

  const range = document.createRange();
  if (startNode) range.setStart(startNode, startOffset);
  else {
    const overflowingChild = [...editor.children].find((child) => child.getBoundingClientRect().bottom > bottomLimit);
    if (overflowingChild) range.setStartBefore(overflowingChild);
    else if (editor.lastChild) range.setStartBefore(editor.lastChild);
    else return "";
  }
  range.setEnd(editor, editor.childNodes.length);
  const fragment = range.extractContents();
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}

function placeCaretAtEnd(editor: HTMLDivElement) {
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
