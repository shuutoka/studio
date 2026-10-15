import type { SuperDocConfig } from "@superdoc/react";

import type { StudioSettings, WritingLanguage } from "@/lib/studio";

type ProofingProvider = NonNullable<NonNullable<SuperDocConfig["proofing"]>["provider"]>;
type ProofingRequest = Parameters<ProofingProvider["check"]>[0];
type ProofingResult = Awaited<ReturnType<ProofingProvider["check"]>>;

type WorkerResponse =
  | { type: "ready"; id: number }
  | { type: "cancelled"; id: number }
  | { type: "result"; id: number; issues: ProofingResult["issues"] }
  | { type: "error"; id: number; message: string };

type PendingRequest = {
  resolve: (result: ProofingResult) => void;
  reject: (error: Error) => void;
  removeAbortListener?: () => void;
};

export type StudioProofingController = {
  provider: ProofingProvider;
  preload: () => Promise<void>;
  setDefaultLanguage: (language: WritingLanguage) => void;
  setEnabled: (enabled: boolean) => void;
  setPersonalDictionary: (words: StudioSettings["personalDictionary"]) => void;
};

export function createSuperDocFrenchProofingProvider(
  initialLanguage: WritingLanguage,
): StudioProofingController {
  let worker: Worker | null = null;
  let enabled = true;
  let defaultLanguage = initialLanguage;
  let personalWords: string[] = [];
  let nextRequestId = 0;
  const pending = new Map<number, PendingRequest>();

  const settle = (id: number) => {
    const request = pending.get(id);
    if (!request) return null;
    pending.delete(id);
    request.removeAbortListener?.();
    return request;
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
      pending.forEach((request) => request.reject(new Error("Le processus du dictionnaire français s’est arrêté.")));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  };

  const check = (request: ProofingRequest) => new Promise<ProofingResult>((resolve, reject) => {
    if (request.signal?.aborted || !enabled || !request.segments.length || !request.segments.some((segment) => isFrench(segment.language ?? defaultLanguage))) {
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
      baseUrl: proofingBaseUrl(),
      defaultLanguage,
      maxSuggestions: Math.min(5, Math.max(1, request.maxSuggestions ?? 4)),
      personalWords,
      segments: request.segments,
    });
  });

  const provider: ProofingProvider = {
    id: "enfer-fatal-superdoc-french-proofing",
    getCapabilities: () => ({
      issueKinds: ["spelling"],
      supportsSuggestions: true,
      supportsMultipleLanguages: true,
      supportsBatching: true,
      requiresNetwork: false,
    }),
    check,
    dispose: () => {
      pending.forEach((request) => request.resolve({ issues: [] }));
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };

  return {
    provider,
    preload: () => new Promise<void>((resolve, reject) => {
      if (!enabled || !isFrench(defaultLanguage)) {
        resolve();
        return;
      }
      const activeWorker = ensureWorker();
      const id = ++nextRequestId;
      pending.set(id, { resolve: () => resolve(), reject });
      activeWorker.postMessage({ type: "preload", id, baseUrl: proofingBaseUrl() });
    }),
    setDefaultLanguage: (language) => { defaultLanguage = language; },
    setEnabled: (value) => { enabled = value; },
    setPersonalDictionary: (dictionary) => { personalWords = [...dictionary["fr-FR"]]; },
  };
}

function proofingBaseUrl() {
  return new URL("proofing/", document.baseURI).toString();
}

function isFrench(language: string | null | undefined) {
  return language?.toLocaleLowerCase("fr").split(/[-_]/u)[0] === "fr";
}
