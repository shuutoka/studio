import type { SuperDocConfig } from "@superdoc/react";

import type { WritingLanguage } from "@/lib/studio";

type ProofingProvider = NonNullable<NonNullable<SuperDocConfig["proofing"]>["provider"]>;
type ProofingRequest = Parameters<ProofingProvider["check"]>[0];
type ProofingResult = Awaited<ReturnType<ProofingProvider["check"]>>;

type WorkerResponse =
  | { type: "result"; id: number; issues: ProofingResult["issues"] }
  | { type: "ready"; id: number }
  | { type: "cancelled"; id: number }
  | { type: "error"; id: number; message: string };

type PendingRequest = {
  resolve: (result: ProofingResult) => void;
  reject: (error: Error) => void;
  removeAbortListener?: () => void;
};

export type StudioProofingController = {
  provider: ProofingProvider;
  preload: (language?: WritingLanguage) => Promise<void>;
  setDefaultLanguage: (language: WritingLanguage) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

export function createStudioProofingProvider(initialLanguage: WritingLanguage): StudioProofingController {
  let worker: Worker | null = null;
  let defaultLanguage = initialLanguage;
  let enabled = true;
  let nextRequestId = 0;
  const pending = new Map<number, PendingRequest>();

  const settle = (id: number) => {
    const request = pending.get(id);
    if (!request) return null;
    pending.delete(id);
    request.removeAbortListener?.();
    return request;
  };

  const rejectAll = (message: string) => {
    pending.forEach((request) => request.reject(new Error(message)));
    pending.clear();
  };

  const cancelAll = () => {
    pending.forEach((request) => {
      request.removeAbortListener?.();
      request.resolve({ issues: [] });
    });
    pending.clear();
  };

  const ensureWorker = () => {
    if (worker) return worker;
    if (typeof Worker === "undefined") throw new Error("Le correcteur local n’est pas disponible dans ce navigateur.");
    worker = new Worker(new URL("./writing-proofing.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const request = settle(message.id);
      if (!request) return;
      if (message.type === "error") request.reject(new Error(message.message));
      else request.resolve({ issues: message.type === "result" ? message.issues : [] });
    });
    worker.addEventListener("error", () => {
      rejectAll("Le processus du correcteur orthographique s’est arrêté.");
      worker?.terminate();
      worker = null;
    });
    return worker;
  };

  const sendCheck = (request: ProofingRequest) => new Promise<ProofingResult>((resolve, reject) => {
    if (!enabled || !request.segments.length) {
      resolve({ issues: [] });
      return;
    }

    const activeWorker = ensureWorker();
    const id = ++nextRequestId;
    const abort = () => {
      const active = settle(id);
      if (!active) return;
      activeWorker.postMessage({ type: "cancel", id });
      active.resolve({ issues: [] });
    };
    const pendingRequest: PendingRequest = { resolve, reject };
    if (request.signal) {
      request.signal.addEventListener("abort", abort, { once: true });
      pendingRequest.removeAbortListener = () => request.signal?.removeEventListener("abort", abort);
    }
    pending.set(id, pendingRequest);
    activeWorker.postMessage({
      type: "check",
      id,
      baseUrl: new URL("proofing/", document.baseURI).toString(),
      defaultLanguage,
      maxSuggestions: Math.min(6, Math.max(1, request.maxSuggestions ?? 4)),
      segments: request.segments,
    });
  });

  const provider: ProofingProvider = {
    id: "enfer-fatal-local-spelling-worker",
    getCapabilities: () => ({
      issueKinds: ["spelling"],
      supportsSuggestions: true,
      supportsMultipleLanguages: true,
      supportsBatching: true,
      requiresNetwork: false,
    }),
    check: sendCheck,
  };

  return {
    provider,
    preload: (language = defaultLanguage) => new Promise<void>((resolve, reject) => {
      if (!enabled) {
        resolve();
        return;
      }
      const activeWorker = ensureWorker();
      const id = ++nextRequestId;
      pending.set(id, { resolve: () => resolve(), reject });
      activeWorker.postMessage({
        type: "preload",
        id,
        baseUrl: new URL("proofing/", document.baseURI).toString(),
        language,
      });
    }),
    setDefaultLanguage: (language) => { defaultLanguage = language; },
    setEnabled: (value) => { enabled = value; },
    dispose: () => {
      cancelAll();
      worker?.terminate();
      worker = null;
    },
  };
}
