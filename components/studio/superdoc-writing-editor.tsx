"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";
import { SuperDocEditor, type SuperDocRef } from "@superdoc/react";
import type { SelectionTarget } from "superdoc/ui";
import "@superdoc/react/style.css";

import { isSingleKeyShortcut, matchesShortcut } from "@/lib/shortcuts";
import { applyDocxFooter, extractDocxOutline } from "@/lib/writing-docx";
import { registerActiveWritingDocument } from "@/lib/writing-editor-registry";
import { persistWritingDocument } from "@/lib/writing-document";
import { STANDARD_FONTS, type StudioSettings, type StudioVolume } from "@/lib/studio";

export type WritingDocumentSnapshot = {
  text: string;
  html: string;
  pageCount: number;
  outline: Array<{ level: number; label: string }>;
};

const STUDIO_SUPERDOC_UI = {
  toolbar: {
    overflow: "menu" as const,
    items: {
      left: ["undo", "redo", "search"] as const,
      center: [
        "linked-style", "zoom", "font-family", "font-size", "bold", "italic", "underline",
        "strikethrough", "text-color", "highlight-color", "link", "image",
        "table", "table-actions", "text-align", "bullet-list", "numbered-list",
        "indent-decrease", "indent-increase", "line-height",
      ] as const,
      right: ["formatting-marks", "copy-format", "clear-formatting"] as const,
    },
    includeItems: ["formatting-marks", "table-of-contents"] as const,
    excludeItems: ["ai", "document-mode"] as const,
  },
  search: true,
  // En mode contenu, la règle crée une boucle ResizeObserver qui déplace le canevas.
  ruler: false,
  comments: false,
} as const;

const STUDIO_SUPERDOC_MODULES = { comments: false } as const;
const doublePressDelay = 450;

type InsertTextPayload = {
  text: string;
  target: SelectionTarget;
};

export function SuperDocWritingEditor({
  projectId,
  volume,
  settings,
  documentBlob,
  navigationTarget,
  onSnapshot,
  onError,
}: {
  projectId: string;
  volume: StudioVolume;
  settings: StudioSettings;
  documentBlob: Blob;
  navigationTarget?: { text: string; token: number } | null;
  onSnapshot: (snapshot: WritingDocumentSnapshot) => void;
  onError: (message: string) => void;
}) {
  const editorRef = useRef<SuperDocRef>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const captureQueueRef = useRef(Promise.resolve());
  const commandCleanupRef = useRef<Array<() => void>>([]);
  const lastSelectionTargetRef = useRef<SelectionTarget | null>(null);
  const insertTextRef = useRef<(text: string) => boolean>(() => false);
  const insertPageBreakRef = useRef<() => boolean>(() => false);
  const pageBreakShortcutRef = useRef(settings.shortcuts.pageBreak);
  const latestTextRef = useRef(volume.documentText);
  const nextFrenchQuoteIsOpening = useRef(true);
  const pendingDoublePress = useRef<{ shortcut: string; fallback: string; timer: number } | null>(null);
  const lastMetadataRef = useRef({
    text: volume.documentText,
    html: volume.documentHtml,
    pageCount: volume.documentPageCount,
    outline: JSON.stringify(volume.documentOutline),
    engine: volume.documentEngine,
  });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  pageBreakShortcutRef.current = settings.shortcuts.pageBreak;

  const fontOptions = useMemo(() => [
    ...STANDARD_FONTS
      .filter((font) => settings.enabledStandardFonts.includes(font.id))
      .map((font) => ({ value: font.family, label: font.label, previewFamily: font.family })),
    ...settings.systemFonts
      .filter((font) => font.enabled)
      .map((font) => ({ value: font.family, label: font.name, previewFamily: font.family })),
    ...settings.customFonts
      .filter((font) => font.enabled)
      .map((font) => ({ value: font.family, label: font.name, previewFamily: font.family })),
  ], [settings.customFonts, settings.enabledStandardFonts, settings.systemFonts]);

  const editorUi = useMemo(() => ({
    ...STUDIO_SUPERDOC_UI,
    toolbar: {
      ...STUDIO_SUPERDOC_UI.toolbar,
      fontOptions,
      strings: {
        "linked-style": "Styles de texte",
        "linked-style-label": "Style",
        "formatting-marks": "Afficher les marques de mise en forme",
      },
    },
  }), [fontOptions]);

  const capture = useCallback(async () => {
    const instance = editorRef.current?.getInstance();
    if (!instance) return;
    setSaving(true);
    captureQueueRef.current = captureQueueRef.current.then(async () => {
      const blob = await instance.export({ exportType: ["docx"], triggerDownload: false });
      const rawHtml = await Promise.resolve(instance.activeEditor?.getHTML?.());
      const html = normalizeEditorHtml(rawHtml);
      const text = instance.ui.document.getText() ?? plainTextFromHtml(html);
      const pageCount = Math.max(1, shellRef.current?.querySelectorAll(".superdoc-page").length ?? 1);
      const outline = await extractDocxOutline(blob).catch(() => volume.documentOutline);
      const serializedOutline = JSON.stringify(outline);
      latestTextRef.current = text;
      await persistWritingDocument(projectId, volume.id, volume.title, blob);

      const previous = lastMetadataRef.current;
      if (
        previous.engine !== "superdoc" || previous.text !== text || previous.html !== html ||
        previous.pageCount !== pageCount || previous.outline !== serializedOutline
      ) {
        lastMetadataRef.current = { text, html, pageCount, outline: serializedOutline, engine: "superdoc" };
        onSnapshot({ text, html, pageCount, outline });
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1_500);
    }).catch((error) => {
      onError(error instanceof Error ? error.message : "Le document n’a pas pu être enregistré localement.");
    }).finally(() => setSaving(false));
    await captureQueueRef.current;
  }, [onError, onSnapshot, projectId, volume.documentOutline, volume.id, volume.title]);

  const scheduleCapture = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void capture(), 900);
  }, [capture]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (pendingDoublePress.current) window.clearTimeout(pendingDoublePress.current.timer);
    commandCleanupRef.current.forEach((cleanup) => cleanup());
  }, []);

  useEffect(() => { nextFrenchQuoteIsOpening.current = true; }, [settings.quoteStyle]);

  useEffect(() => {
    if (!ready) return;
    return registerActiveWritingDocument(volume.id, {
      flush: capture,
      exportDocx: async () => {
        const instance = editorRef.current?.getInstance();
        if (!instance) throw new Error("L’éditeur n’est pas prêt.");
        return instance.export({ exportType: ["docx"], triggerDownload: false });
      },
      getText: () => editorRef.current?.getInstance()?.ui.document.getText() ?? latestTextRef.current,
      print: () => printEditor(),
      navigateToText: (text) => {
        const instance = editorRef.current?.getInstance();
        instance?.focus();
        instance?.ui.search.find(text, { caseSensitive: false });
      },
      insertText: (text) => insertTextRef.current(text),
      applyFooter: async (type, text, format) => {
        const instance = editorRef.current?.getInstance();
        if (!instance) throw new Error("L’éditeur n’est pas prêt.");
        const blob = await instance.export({ exportType: ["docx"], triggerDownload: false });
        const pageCount = Math.max(1, shellRef.current?.querySelectorAll(".superdoc-page").length ?? 1);
        const updated = await applyDocxFooter(blob, type, text, format, pageCount);
        await Promise.resolve(instance.ui.document.replaceFile(updated));
        await persistWritingDocument(projectId, volume.id, volume.title, updated);
        window.setTimeout(() => void capture(), 120);
      },
    });
  }, [capture, projectId, ready, volume.id, volume.title]);

  useEffect(() => {
    if (!ready || !navigationTarget?.text) return;
    const instance = editorRef.current?.getInstance();
    instance?.focus();
    instance?.ui.search.find(navigationTarget.text, { caseSensitive: false });
  }, [navigationTarget, ready]);

  function configureCommands(superdoc: NonNullable<ReturnType<SuperDocRef["getInstance"]>>) {
    commandCleanupRef.current.forEach((cleanup) => cleanup());
    const textCommand = superdoc.ui.commands.register<InsertTextPayload>({
      id: "efs.insert-text",
      execute: ({ doc, payload }) => {
        const insert = doc?.insert;
        if (typeof insert !== "function" || !payload?.text || !payload.target) return false;
        return insert.call(doc, {
          target: payload.target,
          value: payload.text,
          type: "text",
        });
      },
    });
    const pageBreakCommand = superdoc.ui.commands.register({
      id: "efs.insert-page-break",
      execute: ({ doc, selection }) => {
        const insert = doc?.insert;
        if (typeof insert !== "function") return false;
        const point = selection.selectionTarget?.start;
        const blockId = point?.kind === "text" ? point.blockId : undefined;
        return insert.call(doc, {
          ...(blockId ? {
            target: { kind: "block", nodeType: "paragraph", nodeId: blockId },
            placement: "after",
          } : {}),
          content: { kind: "break", break: { type: "page" } },
        });
      },
    });
    const stopObservingSelection = superdoc.ui.selection.observe((selection) => {
      if (selection.selectionTarget) lastSelectionTargetRef.current = selection.selectionTarget;
    });
    const shell = shellRef.current;
    const interceptPageBreak = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      const matchesConfiguredShortcut = matchesShortcut(event, pageBreakShortcutRef.current);
      const matchesDefaultShortcut = matchesShortcut(event, "Ctrl+Enter") || matchesShortcut(event, "Meta+Enter");
      if (!matchesConfiguredShortcut && !matchesDefaultShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (matchesConfiguredShortcut) insertPageBreakRef.current();
    };
    shell?.addEventListener("keydown", interceptPageBreak, true);

    let restoreFocusFrame = 0;
    const restoreFocusAfterStyle = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".toolbar-dropdown-menu--render-only .style-name")) return;
      const target = lastSelectionTargetRef.current;
      if (!target) return;
      if (restoreFocusFrame) window.cancelAnimationFrame(restoreFocusFrame);
      restoreFocusFrame = window.requestAnimationFrame(() => {
        lastSelectionTargetRef.current = target;
        superdoc.ui.selection.apply(target);
        superdoc.focus();
      });
    };
    document.addEventListener("click", restoreFocusAfterStyle, true);

    commandCleanupRef.current = [
      textCommand,
      pageBreakCommand,
      stopObservingSelection,
      () => shell?.removeEventListener("keydown", interceptPageBreak, true),
      () => {
        document.removeEventListener("click", restoreFocusAfterStyle, true);
        if (restoreFocusFrame) window.cancelAnimationFrame(restoreFocusFrame);
      },
    ];
    insertTextRef.current = (text) => {
      const target = superdoc.ui.selection.current()?.selectionTarget ?? lastSelectionTargetRef.current;
      if (!target) return false;
      superdoc.focus();
      superdoc.ui.selection.apply(target);
      void textCommand.handle.executeAsync({ text, target }).then(() => {
        const caret = advanceSelectionTarget(target, text);
        if (caret) {
          lastSelectionTargetRef.current = caret;
          superdoc.ui.selection.apply(caret);
        }
        superdoc.focus();
        scheduleCapture();
      }).catch((error) => {
        onError(error instanceof Error ? error.message : "Le texte n’a pas pu être inséré.");
      });
      return true;
    };
    insertPageBreakRef.current = () => {
      superdoc.focus();
      pageBreakCommand.handle.execute();
      scheduleCapture();
      return true;
    };
  }

  function flushPendingDoublePress() {
    const pending = pendingDoublePress.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDoublePress.current = null;
    insertTextRef.current(pending.fallback);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.repeat) return;
    const binding = settings.characterShortcuts.find((item) => item.shortcut && matchesShortcut(event, item.shortcut));
    if (pendingDoublePress.current && pendingDoublePress.current.shortcut !== binding?.shortcut) flushPendingDoublePress();
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) scheduleBodyStyleAfterEnter();
    if (matchesShortcut(event, settings.shortcuts.emDash)) {
      consumeEditorShortcut(event);
      insertTextRef.current("—");
      return;
    }
    if (binding && (binding.pressMode === "single" || !isSingleKeyShortcut(binding.shortcut))) {
      consumeEditorShortcut(event);
      insertTextRef.current(binding.character);
      return;
    }
    if (binding?.pressMode === "double") {
      consumeEditorShortcut(event);
      const pending = pendingDoublePress.current;
      if (pending?.shortcut === binding.shortcut) {
        window.clearTimeout(pending.timer);
        pendingDoublePress.current = null;
        insertTextRef.current(binding.character);
      } else {
        const fallback = event.key.length === 1 ? event.key : "";
        const timer = window.setTimeout(() => {
          if (pendingDoublePress.current?.shortcut !== binding.shortcut) return;
          pendingDoublePress.current = null;
          insertTextRef.current(fallback);
        }, doublePressDelay);
        pendingDoublePress.current = { shortcut: binding.shortcut, fallback, timer };
      }
      return;
    }
    if (event.key === '"' && settings.quoteStyle === "french" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      consumeEditorShortcut(event);
      insertTextRef.current(nextFrenchQuoteIsOpening.current ? "« " : " »");
      nextFrenchQuoteIsOpening.current = !nextFrenchQuoteIsOpening.current;
    }
  }

  function scheduleBodyStyleAfterEnter() {
    const superdoc = editorRef.current?.getInstance();
    if (!superdoc) return;
    const activeStyle = superdoc.ui.styles.getActiveParagraphStyle();
    if (!activeStyle.styleId || isBodyTextStyle(activeStyle.styleId, activeStyle.styleName)) return;
    window.requestAnimationFrame(() => {
      void superdoc.ui.commands.executeAsync("linked-style", "Normal").then(() => {
        const target = superdoc.ui.selection.current()?.selectionTarget;
        if (target) lastSelectionTargetRef.current = target;
        superdoc.focus();
        scheduleCapture();
      }).catch((error) => {
        onError(error instanceof Error ? error.message : "Le style Corps de texte n’a pas pu être appliqué.");
      });
    });
  }

  function printEditor() {
    if (!shellRef.current) return false;
    document.body.classList.add("efs-printing-writing-document");
    const cleanup = () => document.body.classList.remove("efs-printing-writing-document");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 30_000);
    window.print();
    return true;
  }

  return (
    <div
      ref={shellRef}
      className="superdoc-writing-shell relative flex w-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden"
      data-paper-color-mode={settings.paperColorMode}
      style={{
        "--efs-paper-background": settings.paperBackground,
        "--sd-layout-page-color": settings.paperColorMode === "dark" ? "#eeeaf2" : "#29262b",
      } as React.CSSProperties}
      onKeyDownCapture={handleKeyDown}
    >
      <div className="superdoc-writing-status pointer-events-none absolute bottom-3 right-4 z-30 rounded-full border border-white/10 bg-[#17151d]/95 px-2.5 py-1 text-[11px] font-medium text-[#aaa4b4] shadow-lg backdrop-blur">
        {!ready ? <span className="flex items-center gap-1.5"><LoaderCircle className="size-3 animate-spin" /> Ouverture du DOCX…</span>
          : saving ? <span className="flex items-center gap-1.5"><Save className="size-3" /> Enregistrement local…</span>
            : saved ? <span className="flex items-center gap-1.5 text-[#28754b]"><Check className="size-3" /> Enregistré localement</span>
              : <span>DOCX local</span>}
      </div>
      <SuperDocEditor
        ref={editorRef}
        document={documentBlob}
        documentMode="editing"
        role="editor"
        contained
        measurementUnit="cm"
        zoom={{ initial: 90, mode: "manual" }}
        ui={editorUi}
        modules={STUDIO_SUPERDOC_MODULES}
        className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden"
        style={{ height: "100%", minHeight: 0, width: "100%", maxWidth: "100%" }}
        renderLoading={() => <div className="grid h-full min-h-72 place-items-center text-sm text-[#8f8996]"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Préparation des pages…</span></div>}
        onReady={({ superdoc }) => {
          configureCommands(superdoc);
          setReady(true);
          // Fixed zoom plus toolbar overflow avoids the continuous resize loop.
          superdoc.ui.zoom.set(90);
          window.setTimeout(() => void capture(), 120);
        }}
        onEditorUpdate={scheduleCapture}
        onContentError={() => onError("SuperDoc n’a pas pu lire le contenu de ce DOCX.")}
        onException={(error) => {
          if ("diagnosticCode" in error && error.diagnosticCode === "UNSUPPORTED_FEATURE") return;
          console.error("SuperDoc", error);
        }}
      />
    </div>
  );
}

function advanceSelectionTarget(target: SelectionTarget | null, text: string): SelectionTarget | null {
  if (!target || target.start.kind !== "text") return null;
  const point = { ...target.start, offset: target.start.offset + text.length };
  return { ...target, start: point, end: point };
}

function isBodyTextStyle(styleId: string, styleName: string | null) {
  const value = `${styleId} ${styleName ?? ""}`.toLocaleLowerCase("fr").replace(/[\s_-]+/gu, "");
  return value.includes("normal") || value.includes("corpsdetexte") || value.includes("bodytext");
}

function consumeEditorShortcut(event: React.KeyboardEvent<HTMLDivElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

function normalizeEditorHtml(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(normalizeEditorHtml).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const candidate = value as { html?: unknown; content?: unknown };
    if (typeof candidate.html === "string") return candidate.html;
    if (typeof candidate.content === "string") return candidate.content;
  }
  return "";
}

function plainTextFromHtml(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.textContent ?? "";
}
