"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";
import { SuperDocEditor, type SuperDocRef } from "@superdoc/react";
import "@superdoc/react/style.css";

import { registerActiveWritingDocument } from "@/lib/writing-editor-registry";
import { persistWritingDocument } from "@/lib/writing-document";
import type { StudioVolume } from "@/lib/studio";

export type WritingDocumentSnapshot = {
  text: string;
  html: string;
  pageCount: number;
};

const STUDIO_SUPERDOC_UI = {
  toolbar: {
    overflow: "menu" as const,
    items: {
      left: ["undo", "redo", "search"] as const,
      center: [
        "zoom", "font-family", "font-size", "bold", "italic", "underline",
        "strikethrough", "text-color", "highlight-color", "link", "image",
        "table", "table-actions", "text-align", "bullet-list", "numbered-list",
        "indent-decrease", "indent-increase", "line-height", "linked-style",
      ] as const,
      right: ["formatting-marks", "copy-format", "clear-formatting"] as const,
    },
    includeItems: ["formatting-marks", "table-of-contents"] as const,
    excludeItems: ["ai", "document-mode"] as const,
  },
  search: true,
  ruler: false,
  comments: false,
} as const;

const STUDIO_SUPERDOC_MODULES = {
  comments: false,
} as const;

export function SuperDocWritingEditor({
  projectId,
  volume,
  documentBlob,
  navigationTarget,
  onSnapshot,
  onError,
}: {
  projectId: string;
  volume: StudioVolume;
  documentBlob: Blob;
  navigationTarget?: { text: string; token: number } | null;
  onSnapshot: (snapshot: WritingDocumentSnapshot) => void;
  onError: (message: string) => void;
}) {
  const editorRef = useRef<SuperDocRef>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const captureQueueRef = useRef(Promise.resolve());
  const latestTextRef = useRef(volume.documentText);
  const lastMetadataRef = useRef({
    text: volume.documentText,
    html: volume.documentHtml,
    pageCount: volume.documentPageCount,
    engine: volume.documentEngine,
  });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      latestTextRef.current = text;
      await persistWritingDocument(projectId, volume.id, volume.title, blob);

      const previous = lastMetadataRef.current;
      if (
        previous.engine !== "superdoc" || previous.text !== text ||
        previous.html !== html || previous.pageCount !== pageCount
      ) {
        lastMetadataRef.current = { text, html, pageCount, engine: "superdoc" };
        onSnapshot({ text, html, pageCount });
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1_500);
    }).catch((error) => {
      onError(error instanceof Error ? error.message : "Le document n’a pas pu être enregistré localement.");
    }).finally(() => setSaving(false));
    await captureQueueRef.current;
  }, [onError, onSnapshot, projectId, volume.id, volume.title]);

  const scheduleCapture = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void capture(), 900);
  }, [capture]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

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
    });
  }, [capture, ready, volume.id]);

  useEffect(() => {
    if (!ready || !navigationTarget?.text) return;
    const instance = editorRef.current?.getInstance();
    instance?.focus();
    instance?.ui.search.find(navigationTarget.text, { caseSensitive: false });
  }, [navigationTarget, ready]);

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
    <div ref={shellRef} className="superdoc-writing-shell relative flex w-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-[#28252d]">
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
        ui={STUDIO_SUPERDOC_UI}
        modules={STUDIO_SUPERDOC_MODULES}
        className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden"
        style={{ height: "100%", minHeight: 0, width: "100%", maxWidth: "100%" }}
        renderLoading={() => <div className="grid h-full min-h-72 place-items-center text-sm text-[#8f8996]"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Préparation des pages…</span></div>}
        onReady={({ superdoc }) => {
          setReady(true);
          // Keep both zoom and toolbar layout out of continuous ResizeObserver
          // feedback loops. The overflow menu handles narrow workspaces.
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
