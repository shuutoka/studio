"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, LoaderCircle, MessageSquarePlus, Pencil, RotateCcw, Save, Trash2, X } from "lucide-react";
import { SuperDocEditor, type SuperDocRef } from "@superdoc/react";
import type { CommentInfo, SelectionCapture, SelectionTarget } from "superdoc/ui";
import "@superdoc/react/style.css";

import { isSingleKeyShortcut, matchesShortcut } from "@/lib/shortcuts";
import { applyDocxFooter, applyDocxPageFormat, extractDocxOutline, extractDocxText } from "@/lib/writing-docx";
import { registerActiveWritingDocument } from "@/lib/writing-editor-registry";
import { persistWritingDocument } from "@/lib/writing-document";
import { createId, STANDARD_FONTS, type StudioSettings, type StudioVolume, type WritingDrawingStroke } from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

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

const STUDIO_SUPERDOC_MODULES = { comments: { readOnly: false, allowResolve: true } } as const;
const doublePressDelay = 450;

type InsertTextPayload = {
  text: string;
  target: SelectionTarget;
};

type PendingBodyStyleReset = {
  sourceBlockId: string;
  timer: number;
};

type SuperDocInstance = NonNullable<ReturnType<SuperDocRef["getInstance"]>>;
type PageMetricsSnapshot = { pages?: readonly unknown[] };
type PageMetricsHost = {
  getPageMetricsSnapshot?: () => PageMetricsSnapshot;
  subscribePageMetrics?: (listener: (snapshot: PageMetricsSnapshot) => void) => () => void;
};

export function SuperDocWritingEditor({
  projectId,
  volume,
  settings,
  documentBlob,
  navigationTarget,
  onSnapshot,
  onError,
  commentsVisible,
  drawingTool,
  onAddDrawing,
}: {
  projectId: string;
  volume: StudioVolume;
  settings: StudioSettings;
  documentBlob: Blob;
  navigationTarget?: { text: string; token: number } | null;
  onSnapshot: (snapshot: WritingDocumentSnapshot) => void;
  onError: (message: string) => void;
  commentsVisible: boolean;
  drawingTool: { enabled: boolean; color: string; size: number };
  onAddDrawing: (stroke: WritingDrawingStroke) => void;
}) {
  const editorRef = useRef<SuperDocRef>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const captureQueueRef = useRef(Promise.resolve());
  const commandCleanupRef = useRef<Array<() => void>>([]);
  const lastSelectionTargetRef = useRef<SelectionTarget | null>(null);
  const insertTextRef = useRef<(text: string) => boolean>(() => false);
  const pendingBodyStyleResetRef = useRef<PendingBodyStyleReset | null>(null);
  const replayingNativePageBreakRef = useRef(false);
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
  const [superdocInstance, setSuperdocInstance] = useState<SuperDocInstance | null>(null);
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  const assignShellRef = useCallback((node: HTMLDivElement | null) => {
    shellRef.current = node;
    setShellElement(node);
  }, []);

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
      const apiText = instance.ui.document.getText();
      const htmlText = plainTextFromHtml(html);
      const fallbackText = apiText?.trim() ? apiText : htmlText;
      const text = await extractDocxText(blob).then(
        (docxText) => docxText.trim() ? docxText : fallbackText,
        () => fallbackText,
      );
      const pageCount = getSuperDocPageCount(instance, shellRef.current);
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

  const printEditor = useCallback((documentTitle: string) => {
    const shell = shellRef.current;
    const pages = shell ? getRenderedSuperDocPages(shell) : [];
    if (!shell || !pages.length) return false;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = `Impression de ${documentTitle}`;
    frame.style.cssText = "position:fixed;left:-100000px;top:0;width:1200px;height:900px;border:0;";
    document.body.appendChild(frame);

    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDocument || !frameWindow) {
      frame.remove();
      return false;
    }

    frameDocument.open();
    frameDocument.write(buildPrintDocument(documentTitle, pages));
    frameDocument.close();
    copyPrintableCanvases(pages, frameDocument);

    let printed = false;
    const cleanup = () => frame.remove();
    const startPrint = () => {
      if (printed || !frame.isConnected) return;
      printed = true;
      frameWindow.addEventListener("afterprint", cleanup, { once: true });
      frameWindow.focus();
      frameWindow.print();
    };
    const fontsReady = frameDocument.fonts?.ready ?? Promise.resolve();
    const imagesReady = waitForPrintableImages(frameDocument);
    const stylesReady = waitForPrintableStyles(frameDocument);
    void Promise.all([fontsReady, imagesReady, stylesReady]).then(startPrint, startPrint);
    window.setTimeout(startPrint, 2_500);
    window.setTimeout(cleanup, 300_000);
    return true;
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (pendingDoublePress.current) window.clearTimeout(pendingDoublePress.current.timer);
    if (pendingBodyStyleResetRef.current) window.clearTimeout(pendingBodyStyleResetRef.current.timer);
    commandCleanupRef.current.forEach((cleanup) => cleanup());
  }, []);

  useEffect(() => { nextFrenchQuoteIsOpening.current = true; }, [settings.quoteStyle]);
  useEffect(() => { pageBreakShortcutRef.current = settings.shortcuts.pageBreak; }, [settings.shortcuts.pageBreak]);

  useEffect(() => {
    if (!ready) return;
    return registerActiveWritingDocument(volume.id, {
      flush: capture,
      exportDocx: async () => {
        const instance = editorRef.current?.getInstance();
        if (!instance) throw new Error("L’éditeur n’est pas prêt.");
        return instance.export({ exportType: ["docx"], triggerDownload: false });
      },
      getText: () => {
        const apiText = editorRef.current?.getInstance()?.ui.document.getText();
        return apiText?.trim() ? apiText : latestTextRef.current;
      },
      print: (documentTitle) => printEditor(documentTitle),
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
        const pageCount = getSuperDocPageCount(instance, shellRef.current);
        const updated = await applyDocxFooter(blob, type, text, format, pageCount);
        await Promise.resolve(instance.ui.document.replaceFile(updated));
        await persistWritingDocument(projectId, volume.id, volume.title, updated);
        window.setTimeout(() => void capture(), 120);
      },
      applyPageFormat: async (format) => {
        const instance = editorRef.current?.getInstance();
        if (!instance) throw new Error("L’éditeur n’est pas prêt.");
        const blob = await instance.export({ exportType: ["docx"], triggerDownload: false });
        const updated = await applyDocxPageFormat(blob, format);
        await Promise.resolve(instance.ui.document.replaceFile(updated));
        await persistWritingDocument(projectId, volume.id, volume.title, updated);
        window.setTimeout(() => void capture(), 160);
      },
    });
  }, [capture, printEditor, projectId, ready, volume.id, volume.title]);

  useEffect(() => {
    if (!ready || !navigationTarget?.text) return;
    const instance = editorRef.current?.getInstance();
    instance?.focus();
    instance?.ui.search.find(navigationTarget.text, { caseSensitive: false });
  }, [navigationTarget, ready]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!ready || !shell) return;
    const detach: Array<() => void> = [];

    const attachLayers = () => {
      getRenderedSuperDocPages(shell).forEach((page, pageIndex) => {
        if (page.querySelector(":scope > .efs-drawing-layer")) return;
        detach.push(attachDrawingLayer(page, pageIndex, volume.documentDrawings, drawingTool, onAddDrawing));
      });
    };

    attachLayers();
    const observer = new MutationObserver(attachLayers);
    observer.observe(shell, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      detach.forEach((cleanup) => cleanup());
    };
  }, [drawingTool, onAddDrawing, ready, volume.documentDrawings]);

  function configureCommands(superdoc: SuperDocInstance) {
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
    const stopObservingSelection = superdoc.ui.selection.observe((selection) => {
      if (selection.selectionTarget) lastSelectionTargetRef.current = selection.selectionTarget;
      const pending = pendingBodyStyleResetRef.current;
      const currentBlockId = getTextBlockId(selection.selectionTarget);
      if (!pending || !currentBlockId || currentBlockId === pending.sourceBlockId) return;

      window.clearTimeout(pending.timer);
      pendingBodyStyleResetRef.current = null;
      void superdoc.ui.commands.executeAsync("linked-style", "Normal").then(() => {
        const target = superdoc.ui.selection.current()?.selectionTarget;
        if (target) lastSelectionTargetRef.current = target;
        superdoc.focus();
        scheduleCapture();
      }).catch((error) => {
        onError(error instanceof Error ? error.message : "Le style Corps de texte n’a pas pu être appliqué.");
      });
    });
    const shell = shellRef.current;
    const interceptPageBreak = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || replayingNativePageBreakRef.current) return;
      const matchesConfiguredShortcut = matchesShortcut(event, pageBreakShortcutRef.current);
      const matchesNativeShortcut = matchesShortcut(event, "Ctrl+Enter") || matchesShortcut(event, "Meta+Enter");
      if (!matchesConfiguredShortcut && !matchesNativeShortcut) return;
      if (matchesConfiguredShortcut && matchesNativeShortcut) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (matchesConfiguredShortcut) replayNativePageBreakShortcut(event);
    };
    shell?.addEventListener("keydown", interceptPageBreak, true);

    const replayNativePageBreakShortcut = (sourceEvent: KeyboardEvent) => {
      const target = sourceEvent.target;
      if (!(target instanceof EventTarget)) return;
      const useMetaKey = /Mac|iPhone|iPad|iPod/iu.test(window.navigator.platform);
      replayingNativePageBreakRef.current = true;
      try {
        target.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          ctrlKey: !useMetaKey,
          metaKey: useMetaKey,
          bubbles: true,
          cancelable: true,
          composed: true,
        }));
      } finally {
        replayingNativePageBreakRef.current = false;
      }
      window.setTimeout(scheduleCapture, 120);
    };

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
    const stopObservingPageMetrics = observeSuperDocPageMetrics(superdoc, scheduleCapture);

    commandCleanupRef.current = [
      textCommand,
      stopObservingSelection,
      stopObservingPageMetrics,
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
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) armBodyStyleResetAfterEnter();
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

  function armBodyStyleResetAfterEnter() {
    const superdoc = editorRef.current?.getInstance();
    if (!superdoc) return;
    const activeStyle = superdoc.ui.styles.getActiveParagraphStyle();
    const sourceBlockId = getTextBlockId(superdoc.ui.selection.current()?.selectionTarget);
    if (!activeStyle.styleId || !sourceBlockId || isBodyTextStyle(activeStyle.styleId, activeStyle.styleName)) return;

    if (pendingBodyStyleResetRef.current) window.clearTimeout(pendingBodyStyleResetRef.current.timer);
    const timer = window.setTimeout(() => {
      pendingBodyStyleResetRef.current = null;
    }, 1_500);
    pendingBodyStyleResetRef.current = { sourceBlockId, timer };
  }

  return (
    <div
      ref={assignShellRef}
      className="superdoc-writing-shell relative flex w-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden"
      data-paper-color-mode={settings.paperColorMode}
      data-comments-visible={commentsVisible ? "true" : "false"}
      data-drawing-active={drawingTool.enabled ? "true" : "false"}
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
        user={{ id: "studio-local-author", name: "Auteur du Studio" }}
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
          setSuperdocInstance(superdoc);
          setReady(true);
          // Fixed zoom plus toolbar overflow avoids the continuous resize loop.
          superdoc.ui.zoom.set(90);
          window.setTimeout(() => void capture(), 120);
          window.setTimeout(() => void capture(), 800);
        }}
        onEditorUpdate={scheduleCapture}
        onContentError={() => onError("SuperDoc n’a pas pu lire le contenu de ce DOCX.")}
        onException={(error) => {
          if ("diagnosticCode" in error && error.diagnosticCode === "UNSUPPORTED_FEATURE") return;
          console.error("SuperDoc", error);
        }}
      />
      {commentsVisible && superdocInstance && <WritingCommentsLayer
        superdoc={superdocInstance}
        shell={shellElement}
        onMutation={scheduleCapture}
      />}
    </div>
  );
}

function WritingCommentsLayer({
  superdoc,
  shell,
  onMutation,
}: {
  superdoc: SuperDocInstance;
  shell: HTMLElement | null;
  onMutation: () => void;
}) {
  const [comments, setComments] = useState<readonly CommentInfo[]>([]);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerAnchor, setComposerAnchor] = useState<SelectionCapture | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshComments = useCallback(() => {
    setComments(superdoc.ui.comments.list({ includeResolved: true })
      .filter((comment) => !comment.parentCommentId));
  }, [superdoc]);

  useEffect(() => superdoc.ui.comments.observe(refreshComments), [refreshComments, superdoc]);
  useEffect(() => {
    const stopViewport = superdoc.ui.viewport.observe(() => setGeometryRevision((value) => value + 1));
    if (!shell) return stopViewport;
    const observer = new ResizeObserver(() => setGeometryRevision((value) => value + 1));
    observer.observe(shell);
    return () => { stopViewport(); observer.disconnect(); };
  }, [shell, superdoc]);

  const positions = useMemo(() => {
    void geometryRevision;
    const anchored = comments.map((comment) => {
      const result = shell ? superdoc.ui.viewport.getRect({ target: comment.address, relativeTo: shell }) : null;
      const anchorTop = result?.found ? result.rects[0]?.top ?? result.rect?.top : null;
      return { comment, anchorTop };
    }).toSorted((left, right) => (left.anchorTop ?? Number.POSITIVE_INFINITY) - (right.anchorTop ?? Number.POSITIVE_INFINITY));
    return anchored.reduce<{ nextTop: number; items: Array<{ comment: CommentInfo; top: number }> }>((state, entry) => {
      const top = Math.max(state.nextTop, entry.anchorTop == null ? state.nextTop : entry.anchorTop - 12);
      return { nextTop: top + 142, items: [...state.items, { comment: entry.comment, top }] };
    }, { nextTop: 108, items: [] }).items;
  }, [comments, geometryRevision, shell, superdoc]);

  function beginComment() {
    const capture = superdoc.ui.selection.capture();
    if (!capture || capture.empty) {
      toast.error("Sélectionnez d’abord le passage à commenter.");
      return;
    }
    setComposerAnchor(capture);
    setComposerText("");
    setComposerOpen(true);
  }

  async function createComment() {
    if (!composerAnchor || !composerText.trim()) return;
    setBusyId("new");
    const receipt = await Promise.resolve(superdoc.ui.comments.createFromCapture(composerAnchor, { text: composerText.trim() }));
    setBusyId(null);
    if (!receipt.success) {
      toast.error(receipt.failure.message || "Le commentaire n’a pas pu être ajouté.");
      return;
    }
    setComposerOpen(false);
    setComposerAnchor(null);
    setComposerText("");
    refreshComments();
    onMutation();
  }

  async function mutateComment(commentId: string, action: "edit" | "resolve" | "reopen" | "delete") {
    if (action === "delete" && !window.confirm("Supprimer définitivement ce commentaire ?")) return;
    setBusyId(commentId);
    const receipt = action === "edit"
      ? await Promise.resolve(superdoc.ui.comments.edit(commentId, { text: editingText.trim() }))
      : action === "resolve"
        ? await Promise.resolve(superdoc.ui.comments.resolve(commentId))
        : action === "reopen"
          ? await Promise.resolve(superdoc.ui.comments.reopen(commentId))
          : await Promise.resolve(superdoc.ui.comments.delete(commentId));
    setBusyId(null);
    if (!receipt.success) {
      toast.error(receipt.failure.message || "Le commentaire n’a pas pu être modifié.");
      return;
    }
    setEditingId(null);
    setEditingText("");
    refreshComments();
    onMutation();
  }

  return (
    <div className="efs-comments-layer absolute inset-0 z-[24] pointer-events-none" aria-label="Commentaires du manuscrit">
      <div className="efs-comments-toolbar pointer-events-auto absolute right-3 top-13 flex w-72 items-center justify-between rounded-xl border border-white/10 bg-[#17151d]/96 p-2 shadow-xl backdrop-blur">
        <span className="px-1 text-xs font-semibold text-[#d8d3dd]">{comments.length} commentaire{comments.length > 1 ? "s" : ""}</span>
        <Button size="sm" className="h-8 bg-[#ef4f5f] text-xs text-white" onPointerDown={(event) => { event.preventDefault(); beginComment(); }}><MessageSquarePlus /> Ajouter</Button>
      </div>

      {composerOpen && <section className="efs-comment-composer pointer-events-auto absolute right-3 top-24 z-10 w-72 rounded-xl border border-[#ef4f5f]/35 bg-[#1b1821] p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between"><strong className="text-xs text-white">Nouveau commentaire</strong><Button size="icon-xs" variant="ghost" aria-label="Fermer" onClick={() => setComposerOpen(false)}><X /></Button></div>
        <Textarea autoFocus value={composerText} placeholder="Votre remarque…" className="min-h-24 border-white/10 bg-black/20 text-sm" onChange={(event) => setComposerText(event.target.value)} />
        <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setComposerOpen(false)}>Annuler</Button><Button size="sm" disabled={!composerText.trim() || busyId === "new"} onClick={() => void createComment()}>{busyId === "new" && <LoaderCircle className="animate-spin" />} Ajouter</Button></div>
      </section>}

      <div className="efs-comment-cards absolute inset-0">
        {positions.map(({ comment, top }) => {
          const commentId = comment.id;
          const resolved = comment.status === "resolved";
          const editing = editingId === commentId;
          return <article
            key={commentId}
            className={`efs-comment-card pointer-events-auto absolute right-3 w-72 rounded-xl border p-3 shadow-xl backdrop-blur ${resolved ? "border-white/7 bg-[#17151d]/78 text-[#77717f]" : "border-[#ef4f5f]/20 bg-[#17151d]/96 text-[#d8d3dd]"}`}
            style={{ top }}
          >
            <button type="button" className="mb-2 block w-full text-left" onClick={() => { superdoc.ui.comments.setActive(commentId); void superdoc.ui.comments.scrollTo(commentId); }}>
              <span className="flex items-center justify-between gap-2 text-[11px]"><strong className={resolved ? "text-[#8f8996]" : "text-[#ff8a95]"}>{comment.creatorName || "Auteur"}</strong>{resolved && <span className="flex items-center gap-1"><CheckCircle2 className="size-3" /> Validé</span>}</span>
              {comment.anchoredText && <span className="mt-1 block truncate text-[10px] italic text-[#77717f]">« {comment.anchoredText} »</span>}
            </button>
            {editing ? <><Textarea autoFocus value={editingText} className="min-h-20 border-white/10 bg-black/20 text-xs" onChange={(event) => setEditingText(event.target.value)} /><div className="mt-2 flex justify-end gap-1"><Button size="icon-xs" variant="ghost" aria-label="Annuler la modification" onClick={() => setEditingId(null)}><X /></Button><Button size="icon-xs" aria-label="Enregistrer le commentaire" disabled={!editingText.trim() || busyId === commentId} onClick={() => void mutateComment(commentId, "edit")}><Check /></Button></div></> : <p className={`whitespace-pre-wrap text-xs leading-5 ${resolved ? "line-through decoration-white/15" : ""}`}>{comment.text || "Commentaire sans texte"}</p>}
            {!editing && <div className="mt-2 flex justify-end gap-1 border-t border-white/6 pt-2">
              <Button size="icon-xs" variant="ghost" title="Modifier" aria-label="Modifier" disabled={busyId === commentId} onClick={() => { setEditingId(commentId); setEditingText(comment.text ?? ""); }}><Pencil /></Button>
              <Button size="icon-xs" variant="ghost" title={resolved ? "Rouvrir" : "Valider"} aria-label={resolved ? "Rouvrir" : "Valider"} disabled={busyId === commentId} onClick={() => void mutateComment(commentId, resolved ? "reopen" : "resolve")}>{resolved ? <RotateCcw /> : <CheckCircle2 />}</Button>
              <Button size="icon-xs" variant="ghost" className="text-[#c87882]" title="Supprimer" aria-label="Supprimer" disabled={busyId === commentId} onClick={() => void mutateComment(commentId, "delete")}><Trash2 /></Button>
            </div>}
          </article>;
        })}
      </div>
    </div>
  );
}

function attachDrawingLayer(
  page: HTMLElement,
  pageIndex: number,
  drawings: WritingDrawingStroke[],
  tool: { enabled: boolean; color: string; size: number },
  onAddDrawing: (stroke: WritingDrawingStroke) => void,
) {
  const namespace = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(namespace, "svg");
  layer.classList.add("efs-drawing-layer");
  layer.setAttribute("viewBox", "0 0 1000 1000");
  layer.setAttribute("preserveAspectRatio", "none");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: "16",
    pointerEvents: tool.enabled ? "auto" : "none", touchAction: tool.enabled ? "none" : "auto",
  });

  for (const stroke of drawings.filter((item) => item.pageIndex === pageIndex)) {
    layer.append(createDrawingPath(namespace, stroke.points, stroke.color, stroke.size));
  }

  let active: { pointerId: number; points: Array<{ x: number; y: number }>; path: SVGPathElement } | null = null;
  const pointFromEvent = (event: PointerEvent) => {
    const rect = layer.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  };
  const pointerDown = (event: PointerEvent) => {
    if (!tool.enabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    const points = [pointFromEvent(event)];
    const path = createDrawingPath(namespace, points, tool.color, tool.size);
    layer.append(path);
    active = { pointerId: event.pointerId, points, path };
    layer.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const previous = active.points.at(-1)!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015) return;
    active.points.push(point);
    active.path.setAttribute("d", drawingPathData(active.points));
  };
  const finishStroke = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (active.points.length === 1) active.points.push({ x: Math.min(1, active.points[0].x + 0.001), y: active.points[0].y });
    onAddDrawing({ id: createId("drawing"), pageIndex, color: tool.color, size: tool.size, points: active.points });
    active = null;
  };
  layer.addEventListener("pointerdown", pointerDown);
  layer.addEventListener("pointermove", pointerMove);
  layer.addEventListener("pointerup", finishStroke);
  layer.addEventListener("pointercancel", finishStroke);
  page.style.position = "relative";
  page.append(layer);
  return () => layer.remove();
}

function createDrawingPath(namespace: string, points: Array<{ x: number; y: number }>, color: string, size: number) {
  const path = document.createElementNS(namespace, "path") as SVGPathElement;
  path.setAttribute("d", drawingPathData(points));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", String(size));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  return path;
}

function drawingPathData(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index ? "L" : "M"}${Math.round(point.x * 1000)} ${Math.round(point.y * 1000)}`).join(" ");
}

function advanceSelectionTarget(target: SelectionTarget | null, text: string): SelectionTarget | null {
  if (!target || target.start.kind !== "text") return null;
  const point = { ...target.start, offset: target.start.offset + text.length };
  return { ...target, start: point, end: point };
}

function getTextBlockId(target: SelectionTarget | null | undefined) {
  return target?.start.kind === "text" ? target.start.blockId : null;
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

function getPageMetricsHost(superdoc: SuperDocInstance): PageMetricsHost | null {
  const activeEditor = superdoc.activeEditor as unknown as { host?: PageMetricsHost } | null;
  return activeEditor?.host ?? null;
}

function getSuperDocPageCount(superdoc: SuperDocInstance, shell: HTMLElement | null) {
  try {
    const count = getPageMetricsHost(superdoc)?.getPageMetricsSnapshot?.().pages?.length ?? 0;
    if (count > 0) return count;
  } catch {
    // Le comptage DOM ci-dessous reste disponible si les métriques ne sont pas prêtes.
  }
  return Math.max(1, shell ? getRenderedSuperDocPages(shell).length : 0);
}

function observeSuperDocPageMetrics(superdoc: SuperDocInstance, listener: () => void) {
  try {
    return getPageMetricsHost(superdoc)?.subscribePageMetrics?.(() => listener()) ?? (() => undefined);
  } catch {
    return () => undefined;
  }
}

function getRenderedSuperDocPages(shell: HTMLElement) {
  for (const wrapper of shell.querySelectorAll<HTMLElement>("[data-v2-paint-wrapper='true']")) {
    const pages = [...wrapper.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("superdoc-page"),
    );
    if (pages.length) return pages;
  }
  return [...shell.querySelectorAll<HTMLElement>(".superdoc-page")]
    .filter((page) => !page.closest(".toolbar-dropdown-menu"));
}

function buildPrintDocument(documentTitle: string, pages: HTMLElement[]) {
  const stylesheetMarkup = [...document.head.querySelectorAll("style, link[rel='stylesheet']")]
    .map((element) => {
      if (element instanceof HTMLLinkElement) {
        return `<link rel="stylesheet" href="${escapePrintHtml(element.href)}">`;
      }
      return element.outerHTML;
    })
    .join("\n");
  const pagesMarkup = pages.map((page) => page.outerHTML).join("\n");

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <base href="${escapePrintHtml(document.baseURI)}">
    <title>${escapePrintHtml(documentTitle)}</title>
    ${stylesheetMarkup}
    <style>
      @page { margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .efs-print-document { display: block !important; width: 100% !important; overflow: visible !important; background: #fff !important; }
      .superdoc-page {
        position: relative !important;
        inset: auto !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        transform: none !important;
        break-after: page;
        page-break-after: always;
      }
      .superdoc-page:last-child { break-after: auto; page-break-after: auto; }
      .sd-v2-local-selection, .sd-v2-local-selection-caret, .superdoc-comment-highlight { display: none !important; }
    </style>
  </head>
  <body>
    <main class="efs-print-document" data-paper-color-mode="light">${pagesMarkup}</main>
  </body>
</html>`;
}

function copyPrintableCanvases(pages: HTMLElement[], frameDocument: Document) {
  const sourceCanvases = pages.flatMap((page) => [...page.querySelectorAll("canvas")]);
  const targetCanvases = [...frameDocument.querySelectorAll("canvas")];
  sourceCanvases.forEach((source, index) => {
    const target = targetCanvases[index];
    if (!target) return;
    target.width = source.width;
    target.height = source.height;
    try {
      target.getContext("2d")?.drawImage(source, 0, 0);
    } catch {
      // Les images externes restent rendues par leur élément d’origine si le canvas est protégé.
    }
  });
}

function waitForPrintableImages(frameDocument: Document) {
  const images = [...frameDocument.images];
  return Promise.all(images.map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    })));
}

function waitForPrintableStyles(frameDocument: Document) {
  const stylesheets = [...frameDocument.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']")];
  return Promise.all(stylesheets.map((stylesheet) => stylesheet.sheet
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      stylesheet.addEventListener("load", () => resolve(), { once: true });
      stylesheet.addEventListener("error", () => resolve(), { once: true });
    })));
}

function escapePrintHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}
