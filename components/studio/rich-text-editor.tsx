"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Eraser, FilePlus2,
  ImagePlus, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, Minus,
  Moon, PanelBottom, Redo2, Sigma, Sun, Trash2, Underline, Undo2,
} from "lucide-react";

import { ColorPicker } from "@/components/studio/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger,
} from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { isSingleKeyShortcut, matchesShortcut } from "@/lib/shortcuts";
import {
  PAGE_FORMATS, PROJECT_TYPE_LABELS, STANDARD_FONTS, type CharacterShortcut,
  type FooterType, type PageFormat, type PageStatus, type ProjectType,
  type QuoteStyle, type StudioFont, type StudioShortcuts, type StudioSystemFont,
  type WritingColorMode,
} from "@/lib/studio";

export type RichTextEditorPage = {
  id: string;
  html: string;
  status: PageStatus;
  typeOverride: ProjectType | null;
  format: PageFormat;
  formatOverride: PageFormat | null;
  backgroundColor: string;
  colorMode: WritingColorMode;
  ignoreFooter: boolean;
  pageNumber: number;
  position: number;
};

export type WritingNavigationTarget = {
  pageId: string;
  headingIndex?: number;
  token: number;
};

type RichTextEditorProps = {
  pages: RichTextEditorPage[];
  selectedPageId: string | null;
  defaultFormat: PageFormat;
  defaultProjectType: ProjectType;
  customFonts: StudioFont[];
  systemFonts?: StudioSystemFont[];
  enabledStandardFonts?: string[];
  quoteStyle?: QuoteStyle;
  shortcuts?: StudioShortcuts;
  characterShortcuts?: CharacterShortcut[];
  footerType: FooterType;
  footerText: string;
  navigationTarget?: WritingNavigationTarget | null;
  onSelectPage: (pageId: string) => void;
  onChange: (pageId: string, html: string) => void;
  onPageBreak: (pageId: string) => void;
  onOverflow: (pageId: string, html: string) => void;
  onPullBackward: (previousPageId: string, currentPageId: string, previousHtml: string, currentHtml: string) => void;
  onFormatChange: (pageId: string, format: PageFormat | null) => void;
  onTypeChange: (pageId: string, type: ProjectType | null) => void;
  onStatusChange: (pageId: string, status: PageStatus) => void;
  onBackgroundChange: (color: string) => void;
  onColorModeChange: (mode: WritingColorMode) => void;
  onFooterChange: (type: FooterType, text: string) => void;
  onToggleIgnoreFooter: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onError?: (message: string) => void;
};

const allowedElements = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FONT", "H1", "H2", "H3", "H4",
  "HR", "I", "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRIKE", "STRONG",
  "SUB", "SUP", "U", "UL",
]);

const specialCharacterGroups = {
  Typographie: ["« ", " »", "“", "”", "‘", "’", "‹", "›", "—", "–", "…", "•", "·", "‑", "§", "¶", "†", "‡", "№"],
  "Accents et ligatures": ["À", "Á", "Â", "Ä", "Æ", "Ç", "È", "É", "Ê", "Ë", "Î", "Ï", "Ô", "Ö", "Œ", "Ù", "Û", "Ü", "Ÿ", "à", "â", "ä", "æ", "ç", "è", "é", "ê", "ë", "î", "ï", "ô", "ö", "œ", "ù", "û", "ü", "ÿ"],
  Mathématiques: ["±", "×", "÷", "≠", "≈", "≤", "≥", "∞", "√", "∑", "∏", "∫", "∂", "∆", "π", "µ", "°", "‰", "½", "¼", "¾", "⅓", "⅔"],
  Monnaies: ["€", "$", "£", "¥", "₩", "₹", "₽", "₿", "¢", "₫", "₴", "₦", "₱", "₪", "₡"],
  Flèches: ["←", "↑", "→", "↓", "↔", "↕", "⇐", "⇒", "⇔", "↗", "↘", "↙", "↖", "↩", "↪", "⟵", "⟶", "⟷"],
  Symboles: ["©", "®", "™", "✓", "✔", "✕", "✖", "★", "☆", "♥", "♡", "♦", "♣", "♠", "☀", "☁", "☂", "☕", "☎", "⚠", "♩", "♪", "♫"],
  Grec: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω", "Γ", "Δ", "Θ", "Λ", "Σ", "Φ", "Ψ", "Ω"],
  Emoji: ["😀", "😃", "😄", "😁", "😂", "😊", "😍", "😘", "😎", "🤔", "😐", "😢", "😭", "😡", "😱", "🥳", "🤖", "👻", "😈", "👍", "👎", "👏", "🙏", "💪", "👀", "❤️", "💔", "✨", "🔥", "💧", "🌙", "☀️", "⭐", "🌍", "🎉", "🎵", "📌", "✍️", "📖", "💡"],
} satisfies Record<string, string[]>;

const specialGroupNames = Object.keys(specialCharacterGroups) as Array<keyof typeof specialCharacterGroups>;
const doublePressDelay = 450;
const fontSizeOptions = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72, 96];

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
      const allowed = ["href", "style", "color", "size", "face", "src", "alt", "title"].includes(name);
      if (!allowed || name.startsWith("on")) element.removeAttribute(attribute.name);
    });
    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:|#)/i.test(href)) element.removeAttribute("href");
    }
    if (element instanceof HTMLImageElement) {
      const src = element.getAttribute("src") ?? "";
      if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) element.remove();
      else {
        element.style.maxWidth = "100%";
        element.style.height = "auto";
      }
    }
  });
  return parsed.body.innerHTML;
}

export function RichTextEditor({
  pages, selectedPageId, defaultFormat, customFonts, systemFonts = [],
  defaultProjectType,
  enabledStandardFonts = STANDARD_FONTS.map((font) => font.id), quoteStyle = "french",
  shortcuts = { save: "Ctrl+S", focus: "Ctrl+Shift+F", pageBreak: "Ctrl+Enter", emDash: "Ctrl+-" },
  characterShortcuts = [], footerType, footerText, navigationTarget,
  onSelectPage, onChange, onPageBreak, onOverflow, onPullBackward, onFormatChange, onTypeChange,
  onStatusChange,
  onBackgroundChange, onColorModeChange, onFooterChange, onToggleIgnoreFooter,
  onDeletePage, onError = () => undefined,
}: RichTextEditorProps) {
  const editorsRef = useRef(new Map<string, HTMLDivElement>());
  const loadedHtmlRef = useRef(new Map<string, string>());
  const savedRangeRef = useRef<Range | null>(null);
  const activePageIdRef = useRef<string | null>(selectedPageId ?? pages[0]?.id ?? null);
  const pendingDoublePress = useRef<{ shortcut: string; fallback: string; timer: number } | null>(null);
  const pendingFontSizeRef = useRef(new Map<string, number>());
  const nextFrenchQuoteIsOpening = useRef(true);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pageStackRef = useRef<HTMLDivElement>(null);
  const [selectedFontSize, setSelectedFontSize] = useState("12");
  const [customFontSize, setCustomFontSize] = useState("12");

  const activePage = pages.find((page) => page.id === selectedPageId) ?? pages[0];
  const fonts = [
    ...STANDARD_FONTS.filter((font) => enabledStandardFonts.includes(font.id)),
    ...systemFonts.filter((font) => font.enabled).map((font) => ({ id: font.id, label: font.name, family: font.family })),
    ...customFonts.filter((font) => font.enabled).map((font) => ({ id: font.id, label: font.name, family: font.family })),
  ];

  useEffect(() => {
    pages.forEach((page) => {
      const editor = editorsRef.current.get(page.id);
      if (!editor) return;
      const nextHtml = sanitizeHtml(page.html);
      if (loadedHtmlRef.current.get(page.id) !== nextHtml && document.activeElement !== editor) {
        editor.innerHTML = nextHtml;
        loadedHtmlRef.current.set(page.id, nextHtml);
      }
    });
    const ids = new Set(pages.map((page) => page.id));
    [...loadedHtmlRef.current.keys()].forEach((id) => { if (!ids.has(id)) loadedHtmlRef.current.delete(id); });
  }, [pages]);

  useEffect(() => {
    activePageIdRef.current = selectedPageId ?? pages[0]?.id ?? null;
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (!navigationTarget) return;
    window.requestAnimationFrame(() => {
      const editor = editorsRef.current.get(navigationTarget.pageId);
      if (!editor) return;
      const heading = navigationTarget.headingIndex === undefined
        ? null
        : editor.querySelectorAll("h1,h2,h3,h4").item(navigationTarget.headingIndex);
      (heading ?? editor.closest("[data-writing-page]"))?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (heading instanceof HTMLElement) placeCaretAtStart(heading);
      else placeCaretAtEnd(editor);
    });
  }, [navigationTarget]);

  useEffect(() => { nextFrenchQuoteIsOpening.current = true; }, [quoteStyle]);
  useEffect(() => () => {
    if (pendingDoublePress.current) window.clearTimeout(pendingDoublePress.current.timer);
  }, []);
  useEffect(() => {
    const stack = pageStackRef.current;
    if (!stack) return;
    const forwardWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-writing-page]") || !event.deltaY) return;
      event.preventDefault();
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 24
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? stack.clientHeight
          : 1;
      stack.scrollTop += event.deltaY * multiplier;
    };
    stack.addEventListener("wheel", forwardWheel, { passive: false });
    return () => stack.removeEventListener("wheel", forwardWheel);
  }, []);

  function rememberSelection(pageId: string) {
    activePageIdRef.current = pageId;
    if (pageId !== selectedPageId) onSelectPage(pageId);
    const selection = window.getSelection();
    const editor = editorsRef.current.get(pageId);
    if (editor && selection?.rangeCount && editor.contains(selection.anchorNode)) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const pageId = activePageIdRef.current ?? pages[0]?.id;
    if (!pageId) return null;
    const editor = editorsRef.current.get(pageId);
    if (!editor) return null;
    editor.focus();
    const range = savedRangeRef.current;
    if (range && range.startContainer.isConnected && editor.contains(range.startContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else placeCaretAtEnd(editor);
    return { editor, pageId };
  }

  function emitChange(pageId: string) {
    const editor = editorsRef.current.get(pageId);
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!editor || !page) return;
    const pendingFontSize = pendingFontSizeRef.current.get(pageId);
    if (pendingFontSize) {
      const selection = window.getSelection();
      const font = selection?.anchorNode instanceof Element
        ? selection.anchorNode.closest('font[size="7"]')
        : selection?.anchorNode?.parentElement?.closest('font[size="7"]');
      if (font && editor.contains(font)) {
        (font as HTMLElement).style.fontSize = `${pendingFontSize}pt`;
        font.removeAttribute("size");
        pendingFontSizeRef.current.delete(pageId);
      }
    }
    const overflow = PAGE_FORMATS[page.format].height === null ? "" : extractOverflowHtml(editor);
    const nextHtml = sanitizeHtml(editor.innerHTML);
    loadedHtmlRef.current.set(pageId, nextHtml);
    onChange(pageId, nextHtml);
    if (overflow) onOverflow(pageId, sanitizeHtml(overflow));
  }

  function run(command: string, value?: string) {
    const active = restoreSelection();
    if (!active) return;
    document.execCommand(command, false, value);
    rememberSelection(active.pageId);
    emitChange(active.pageId);
  }

  function insertText(value: string) {
    run("insertText", value);
  }

  function applyBlockStyle(value: string) {
    const active = restoreSelection();
    if (!active) return;
    document.execCommand("formatBlock", false, value === "chapter" ? "h2" : value);
    if (value === "chapter") document.execCommand("justifyCenter", false);
    rememberSelection(active.pageId);
    emitChange(active.pageId);
  }

  function applyFontSize(value: number) {
    const size = Math.min(144, Math.max(6, Math.round(value * 10) / 10));
    const active = restoreSelection();
    if (!active) return;
    document.execCommand("fontSize", false, "7");
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const candidates = [...active.editor.querySelectorAll('font[size="7"]')];
    const selectedCandidates = range
      ? candidates.filter((font) => range.intersectsNode(font))
      : [];
    const anchorFont = selection?.anchorNode instanceof Element
      ? selection.anchorNode.closest('font[size="7"]')
      : selection?.anchorNode?.parentElement?.closest('font[size="7"]');
    const targets = selectedCandidates.length ? selectedCandidates : anchorFont ? [anchorFont] : [];
    targets.forEach((font) => {
      (font as HTMLElement).style.fontSize = `${size}pt`;
      font.removeAttribute("size");
    });
    if (selection?.isCollapsed && !targets.length) pendingFontSizeRef.current.set(active.pageId, size);
    else pendingFontSizeRef.current.delete(active.pageId);
    setSelectedFontSize(String(size));
    setCustomFontSize(String(size));
    rememberSelection(active.pageId);
    emitChange(active.pageId);
  }

  function commitCustomFontSize() {
    const value = Number.parseFloat(customFontSize.replace(",", "."));
    if (Number.isFinite(value)) applyFontSize(value);
    else setCustomFontSize(selectedFontSize);
  }

  function pullPageBackward(pageId: string) {
    const index = pages.findIndex((page) => page.id === pageId);
    if (index <= 0) return;
    const currentPage = pages[index];
    const previousPage = pages[index - 1];
    const currentEditor = editorsRef.current.get(currentPage.id);
    const previousEditor = editorsRef.current.get(previousPage.id);
    if (!currentEditor || !previousEditor) return;

    mergeEditorBoundary(previousEditor, currentEditor);
    const overflow = PAGE_FORMATS[previousPage.format].height === null
      ? ""
      : extractOverflowHtml(previousEditor);
    currentEditor.innerHTML = overflow;

    const previousHtml = sanitizeHtml(previousEditor.innerHTML);
    const currentHtml = sanitizeHtml(currentEditor.innerHTML);
    loadedHtmlRef.current.set(previousPage.id, previousHtml);
    loadedHtmlRef.current.set(currentPage.id, currentHtml);
    activePageIdRef.current = previousPage.id;
    savedRangeRef.current = null;
    onPullBackward(previousPage.id, currentPage.id, previousHtml, currentHtml);
    onSelectPage(previousPage.id);
    placeCaretAtEnd(previousEditor);
  }

  function flushPendingDoublePress() {
    const pending = pendingDoublePress.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDoublePress.current = null;
    if (pending.fallback) insertText(pending.fallback);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>, pageId: string) {
    activePageIdRef.current = pageId;
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      isCaretAtEditorStart(event.currentTarget) && pages.findIndex((page) => page.id === pageId) > 0
    ) {
      event.preventDefault();
      pullPageBackward(pageId);
      return;
    }
    const binding = characterShortcuts.find((item) => item.shortcut && matchesShortcut(event, item.shortcut));
    if (pendingDoublePress.current && pendingDoublePress.current.shortcut !== binding?.shortcut) flushPendingDoublePress();
    if (matchesShortcut(event, shortcuts.pageBreak)) {
      event.preventDefault();
      onPageBreak(pageId);
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
      insertText(quoteStyle === "straight" ? "\"" : nextFrenchQuoteIsOpening.current ? "« " : " »");
      if (quoteStyle === "french") nextFrenchQuoteIsOpening.current = !nextFrenchQuoteIsOpening.current;
    }
  }

  function insertImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { onError("Le fichier choisi n’est pas une image."); return; }
    if (file.size > 8 * 1024 * 1024) { onError("L’image dépasse la limite de 8 Mo."); return; }
    const reader = new FileReader();
    reader.onerror = () => onError("L’image n’a pas pu être lue.");
    reader.onload = () => {
      const active = restoreSelection();
      if (!active || typeof reader.result !== "string") return;
      document.execCommand("insertImage", false, reader.result);
      const images = active.editor.querySelectorAll("img");
      const inserted = images.item(images.length - 1);
      if (inserted) {
        inserted.alt = file.name;
        inserted.style.maxWidth = "100%";
        inserted.style.height = "auto";
      }
      emitChange(active.pageId);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="writing-editor-shell flex min-h-0 flex-1 flex-col overflow-hidden border-y border-white/8 bg-[#111016]">
      <div className="writing-toolbar shrink-0 border-b border-white/8 bg-[#17151d] shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-2">
          <Select defaultValue="p" onValueChange={applyBlockStyle}>
            <SelectTrigger aria-label="Style du texte" className="w-[150px] shrink-0 border-white/10 bg-white/4" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="p">Corps de texte</SelectItem><SelectItem value="h1">Titre H1</SelectItem><SelectItem value="h2">Titre H2</SelectItem><SelectItem value="h3">Titre H3</SelectItem><SelectItem value="chapter">Chapitre — H2 centré</SelectItem><SelectItem value="blockquote">Citation</SelectItem><SelectItem value="pre">Texte préformaté</SelectItem></SelectContent>
          </Select>
          <Select defaultValue={fonts[0]?.family ?? "__none__"} onValueChange={(value) => { if (value !== "__none__") run("fontName", value); }}>
            <SelectTrigger aria-label="Police" className="w-[150px] shrink-0 border-white/10 bg-white/4" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>{fonts.length ? fonts.map((font) => <SelectItem key={font.id} value={font.family}>{font.label}</SelectItem>) : <SelectItem value="__none__">Aucune police</SelectItem>}</SelectContent>
          </Select>
          <Select value={selectedFontSize} onValueChange={(value) => applyFontSize(Number(value))}>
            <SelectTrigger aria-label="Taille du texte" className="w-[86px] shrink-0 border-white/10 bg-white/4" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>{!fontSizeOptions.includes(Number(selectedFontSize)) && <SelectItem value={selectedFontSize}>{selectedFontSize} pt</SelectItem>}{fontSizeOptions.map((size) => <SelectItem key={size} value={String(size)}>{size} pt</SelectItem>)}</SelectContent>
          </Select>
          <label className="relative shrink-0"><span className="sr-only">Taille personnalisée en points</span><Input aria-label="Taille personnalisée en points" type="number" min={6} max={144} step={0.5} value={customFontSize} className="h-8 w-[78px] border-white/10 bg-white/4 pr-6 text-xs" onChange={(event) => setCustomFontSize(event.target.value)} onBlur={commitCustomFontSize} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitCustomFontSize(); event.currentTarget.blur(); } }} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#77717f]">pt</span></label>

          <ToolbarDivider />
          <ToolbarButton label="Gras" onClick={() => run("bold")}><Bold /></ToolbarButton>
          <ToolbarButton label="Italique" onClick={() => run("italic")}><Italic /></ToolbarButton>
          <ToolbarButton label="Souligné" onClick={() => run("underline")}><Underline /></ToolbarButton>
          <ColorPicker label="Couleur du texte" value="#29262b" onChange={(value) => run("foreColor", value)} />
          <ColorPicker label="Surligner le texte" value="#fff19a" onChange={(value) => run("hiliteColor", value)} className="text-[#ffd75f]" />
          <ToolbarDivider />
          <ToolbarButton label="Liste à puces" onClick={() => run("insertUnorderedList")}><List /></ToolbarButton>
          <ToolbarButton label="Liste numérotée" onClick={() => run("insertOrderedList")}><ListOrdered /></ToolbarButton>
          <ToolbarButton label="Séparateur" onClick={() => run("insertHorizontalRule")}><Minus /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Aligner à gauche" onClick={() => run("justifyLeft")}><AlignLeft /></ToolbarButton>
          <ToolbarButton label="Centrer" onClick={() => run("justifyCenter")}><AlignCenter /></ToolbarButton>
          <ToolbarButton label="Aligner à droite" onClick={() => run("justifyRight")}><AlignRight /></ToolbarButton>
          <ToolbarButton label="Justifier" onClick={() => run("justifyFull")}><AlignJustify /></ToolbarButton>
          <ToolbarButton label="Diminuer le retrait" onClick={() => run("outdent")}><IndentDecrease /></ToolbarButton>
          <ToolbarButton label="Augmenter le retrait" onClick={() => run("indent")}><IndentIncrease /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Ajouter une image" onClick={() => imageInputRef.current?.click()}><ImagePlus /></ToolbarButton>
          <input ref={imageInputRef} className="hidden" type="file" accept="image/*" onChange={(event) => { insertImage(event.target.files?.[0]); event.target.value = ""; }} />
          <ToolbarButton label="Supprimer la mise en forme" onClick={() => run("removeFormat")}><Eraser /></ToolbarButton>
          <ToolbarButton label="Annuler" onClick={() => run("undo")}><Undo2 /></ToolbarButton>
          <ToolbarButton label="Rétablir" onClick={() => run("redo")}><Redo2 /></ToolbarButton>

          <div className="sticky right-0 ml-auto flex shrink-0 items-center gap-1 border-l border-white/10 bg-[#17151d] pl-2">
            <FooterPopover page={activePage} footerType={footerType} footerText={footerText} onFooterChange={onFooterChange} onToggleIgnoreFooter={onToggleIgnoreFooter} />
            <SpecialCharactersPopover onInsert={insertText} />
          </div>
        </div>

        {activePage && <div className="flex items-center gap-2 overflow-x-auto border-t border-white/7 px-3 py-1.5 text-xs text-[#8f8996]">
          <span className="shrink-0 font-medium text-[#c8c2cf]">Page {activePage.position}</span>
          <Select value={activePage.typeOverride ?? "inherit"} onValueChange={(value) => onTypeChange(activePage.id, value === "inherit" ? null : value as ProjectType)}>
            <SelectTrigger aria-label="Type d’écriture de la page" className="h-7 w-[155px] shrink-0 border-white/10 bg-white/3 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="inherit">Type : {PROJECT_TYPE_LABELS[defaultProjectType]}</SelectItem>{Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={activePage.status} onValueChange={(value: PageStatus) => onStatusChange(activePage.id, value)}>
            <SelectTrigger aria-label="État de la page" className="h-7 w-[105px] shrink-0 border-white/10 bg-white/3 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="draft">Brouillon</SelectItem><SelectItem value="review">À relire</SelectItem><SelectItem value="done">Terminée</SelectItem></SelectContent>
          </Select>
          <Select value={activePage.formatOverride ?? "inherit"} onValueChange={(value) => onFormatChange(activePage.id, value === "inherit" ? null : value as PageFormat)}>
            <SelectTrigger aria-label="Format de la page" className="h-7 w-[175px] shrink-0 border-white/10 bg-white/3 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="inherit">Format : {PAGE_FORMATS[defaultFormat].label}</SelectItem>{Object.entries(PAGE_FORMATS).map(([value, format]) => <SelectItem key={value} value={value}>{format.label} — {format.detail}</SelectItem>)}</SelectContent>
          </Select>
          <Button aria-label="Fond clair" title="Fond clair" aria-pressed={activePage.colorMode === "light"} size="icon-xs" variant={activePage.colorMode === "light" ? "default" : "ghost"} className={activePage.colorMode === "light" ? "bg-[#ef4f5f] text-white" : ""} onClick={() => onColorModeChange("light")}><Sun /></Button>
          <Button aria-label="Fond sombre" title="Fond sombre" aria-pressed={activePage.colorMode === "dark"} size="icon-xs" variant={activePage.colorMode === "dark" ? "default" : "ghost"} className={activePage.colorMode === "dark" ? "bg-[#ef4f5f] text-white" : ""} onClick={() => onColorModeChange("dark")}><Moon /></Button>
          <ColorPicker label="Couleur du fond" value={activePage.backgroundColor} onChange={onBackgroundChange} />
          <Button size="sm" variant={activePage.ignoreFooter ? "secondary" : "ghost"} className="h-7 shrink-0 text-xs" onClick={() => onToggleIgnoreFooter(activePage.id)}><PanelBottom /> {activePage.ignoreFooter ? "Page hors pied" : "Ignorer au pied"}</Button>
          <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => onPageBreak(activePage.id)}><FilePlus2 /> Nouvelle page</Button>
          <Button aria-label="Supprimer la page" title="Supprimer la page" size="icon-xs" variant="ghost" className="shrink-0 text-[#a49eab] hover:text-[#ff7885]" onClick={() => onDeletePage(activePage.id)}><Trash2 /></Button>
        </div>}
      </div>

      <div ref={pageStackRef} className="writing-page-stack min-h-0 flex-1 overflow-y-auto bg-[#09080b] px-4 py-8 sm:px-8">
        {pages.map((page) => {
          const format = PAGE_FORMATS[page.format];
          const limited = format.height !== null;
          const textColor = page.colorMode === "dark" ? "#eeeaf2" : "#29262b";
          const footer = page.ignoreFooter ? "" : footerType === "page" ? `— ${page.pageNumber} —` : footerType === "date" ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date()) : footerType === "custom" ? footerText : "";
          return <div key={page.id} data-writing-page={page.id} className="group/page mx-auto mb-10 w-fit max-w-full scroll-mt-36">
            <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-[#69636f]"><span>Page {page.position}</span><span>{format.label}</span></div>
            <div
              className={`writing-page relative flex max-w-full flex-col overflow-hidden border transition ${page.id === activePage?.id ? "border-[#ef4f5f]/55 shadow-[0_22px_70px_rgba(0,0,0,.5)]" : "border-black/30 shadow-[0_18px_55px_rgba(0,0,0,.38)]"} ${limited ? "paper-sheet" : "rounded-xl"}`}
              style={{ backgroundColor: page.backgroundColor, color: textColor, width: `min(calc(100vw - 4rem), ${format.width}px)`, ...(limited ? { aspectRatio: `${format.width} / ${format.height}` } : { minHeight: 520 }) }}
              onMouseDown={() => { activePageIdRef.current = page.id; if (page.id !== selectedPageId) onSelectPage(page.id); }}
            >
              <div
                ref={(node) => { if (node) { editorsRef.current.set(page.id, node); if (!loadedHtmlRef.current.has(page.id)) { const initial = sanitizeHtml(page.html); node.innerHTML = initial; loadedHtmlRef.current.set(page.id, initial); } } else editorsRef.current.delete(page.id); }}
                className={`studio-editor min-h-0 flex-1 overflow-hidden px-[clamp(1.5rem,8%,5rem)] py-[clamp(2rem,9%,5rem)] text-[16px] leading-7 outline-none ${page.colorMode === "dark" ? "editor-dark-surface" : "paper-editor"}`}
                contentEditable role="textbox" aria-label={`Contenu de la page ${page.position}`} aria-multiline="true"
                suppressContentEditableWarning
                onFocus={() => rememberSelection(page.id)}
                onMouseUp={() => rememberSelection(page.id)}
                onKeyUp={() => rememberSelection(page.id)}
                onKeyDown={(event) => handleKeyDown(event, page.id)}
                onInput={() => emitChange(page.id)}
              />
              {footer && <div className="shrink-0 border-t border-current/10 px-8 py-3 text-center text-[11px] opacity-65">{footer}</div>}
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}

function FooterPopover({ page, footerType, footerText, onFooterChange, onToggleIgnoreFooter }: {
  page?: RichTextEditorPage;
  footerType: FooterType;
  footerText: string;
  onFooterChange: (type: FooterType, text: string) => void;
  onToggleIgnoreFooter: (pageId: string) => void;
}) {
  return <Popover>
    <PopoverTrigger asChild><Button aria-label="Pied de page" title="Pied de page" type="button" variant="ghost" size="sm" className="h-8 shrink-0 text-[#c8c2cf]"><PanelBottom /> Pied de page</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80 border-white/10 bg-[#1b1821] text-[#eeeaf2]">
      <PopoverHeader className="mb-4"><PopoverTitle>Pied de page du projet</PopoverTitle></PopoverHeader>
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-xs text-[#aaa4b4]">Contenu<Select value={footerType} onValueChange={(value: FooterType) => onFooterChange(value, footerText)}><SelectTrigger className="w-full border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Aucun</SelectItem><SelectItem value="page">Numérotation</SelectItem><SelectItem value="date">Date actuelle</SelectItem><SelectItem value="custom">Texte personnalisé</SelectItem></SelectContent></Select></label>
        {footerType === "custom" && <label className="grid gap-1.5 text-xs text-[#aaa4b4]">Texte<Input value={footerText} className="border-white/10 bg-black/20" onChange={(event) => onFooterChange("custom", event.target.value)} /></label>}
        {page && <div className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/15 p-3"><div><p className="text-sm font-medium text-white">Ignorer la page {page.position}</p><p className="mt-1 text-[11px] leading-4 text-[#77717f]">Elle n’affiche aucun pied et ne compte pas dans la numérotation.</p></div><Switch checked={page.ignoreFooter} onCheckedChange={() => onToggleIgnoreFooter(page.id)} /></div>}
      </div>
    </PopoverContent>
  </Popover>;
}

function SpecialCharactersPopover({ onInsert }: { onInsert: (character: string) => void }) {
  const [group, setGroup] = useState<(typeof specialGroupNames)[number]>("Typographie");
  const [search, setSearch] = useState("");
  const characters = useMemo(() => {
    if (!search.trim()) return specialCharacterGroups[group];
    const query = search.trim().toLocaleLowerCase("fr");
    return specialGroupNames.flatMap((name) => specialCharacterGroups[name].map((character) => ({ name, character })))
      .filter((item) => item.name.toLocaleLowerCase("fr").includes(query) || item.character.includes(query))
      .map((item) => item.character);
  }, [group, search]);
  return <Popover>
    <PopoverTrigger asChild><Button aria-label="Caractères spéciaux" title="Caractères spéciaux" type="button" variant="default" size="sm" className="h-8 shrink-0 bg-[#ef4f5f] text-white hover:bg-[#ff6675]"><Sigma /> Caractères spéciaux</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(92vw,540px)] border-white/10 bg-[#1b1821] p-0 text-[#eeeaf2]">
      <div className="border-b border-white/8 p-4"><PopoverHeader><PopoverTitle>Caractères spéciaux et emoji</PopoverTitle></PopoverHeader><Input aria-label="Rechercher un caractère" value={search} placeholder="Rechercher une catégorie…" className="mt-3 border-white/10 bg-black/20" onChange={(event) => setSearch(event.target.value)} /></div>
      {!search && <div className="flex gap-1 overflow-x-auto border-b border-white/8 px-3 py-2">{specialGroupNames.map((name) => <button key={name} type="button" className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs ${group === name ? "bg-[#ef4f5f]/16 text-[#ff8a95]" : "text-[#8f8996] hover:bg-white/5 hover:text-white"}`} onClick={() => setGroup(name)}>{name}</button>)}</div>}
      <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto p-3 sm:grid-cols-10">{characters.map((character, index) => <button key={`${character}-${index}`} type="button" title={character} className="grid aspect-square place-items-center rounded-md border border-white/6 bg-white/3 text-base hover:border-[#ef4f5f]/35 hover:bg-[#ef4f5f]/10" onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(character)}>{character}</button>)}</div>
    </PopoverContent>
  </Popover>;
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <Button aria-label={label} title={label} type="button" variant="ghost" size="icon-sm" className="shrink-0 text-[#aaa4b4] hover:bg-white/7 hover:text-white" onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{children}</Button>;
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/10" />;
}

function isCaretAtEditorStart(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode)) return false;
  const caret = selection.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(editor);
  try {
    before.setEnd(caret.startContainer, caret.startOffset);
  } catch {
    return false;
  }
  const fragment = before.cloneContents();
  return !(fragment.textContent ?? "").replace(/\u00a0/g, " ").trim() && !fragment.querySelector("img,hr");
}

function mergeEditorBoundary(previousEditor: HTMLDivElement, currentEditor: HTMLDivElement) {
  const previousLast = previousEditor.lastElementChild;
  const currentFirst = currentEditor.firstElementChild;
  const mergeableBlocks = new Set(["P", "DIV", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "UL", "OL"]);
  if (
    previousLast && currentFirst && previousLast.tagName === currentFirst.tagName &&
    mergeableBlocks.has(previousLast.tagName) && previousLast.getAttribute("style") === currentFirst.getAttribute("style")
  ) {
    while (currentFirst.firstChild) previousLast.append(currentFirst.firstChild);
    currentFirst.remove();
  }
  while (currentEditor.firstChild) previousEditor.append(currentEditor.firstChild);
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
    const wordBoundary = Math.max(textNode.data.lastIndexOf(" ", Math.max(0, startOffset - 1)), textNode.data.lastIndexOf("\n", Math.max(0, startOffset - 1)));
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

function placeCaretAtEnd(editor: HTMLElement) {
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeCaretAtStart(element: HTMLElement) {
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  (element.closest("[contenteditable]") as HTMLElement | null)?.focus();
}
