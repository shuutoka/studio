import nspell, { type NSpell } from "nspell";

type WorkerSegment = {
  id: string;
  text: string;
  language?: string | null;
};

type WorkerIssue = {
  segmentId: string;
  start: number;
  end: number;
  kind: "spelling";
  message: string;
  replacements: string[];
};

type CheckMessage = {
  type: "check";
  id: number;
  baseUrl: string;
  defaultLanguage: string;
  maxSuggestions: number;
  segments: WorkerSegment[];
};

type PreloadMessage = {
  type: "preload";
  id: number;
  baseUrl: string;
  language: string;
};

type CancelMessage = { type: "cancel"; id: number };
type IncomingMessage = CheckMessage | PreloadMessage | CancelMessage;

type OutgoingMessage =
  | { type: "result"; id: number; issues: WorkerIssue[] }
  | { type: "ready"; id: number }
  | { type: "cancelled"; id: number }
  | { type: "error"; id: number; message: string };

type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<IncomingMessage>) => void) => void;
  postMessage: (message: OutgoingMessage) => void;
};

const scope = globalThis as unknown as WorkerScope;
const checkerCache = new Map<string, Promise<NSpell>>();
const correctnessCache = new Map<string, boolean>();
const suggestionCache = new Map<string, string[]>();
const cancelledRequests = new Set<number>();
const wordPattern = /[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu;
const maxIssuesPerRequest = 100;
const maxSuggestionLookupsPerRequest = 60;

function languageBase(language: string | null | undefined) {
  const base = language?.toLocaleLowerCase("en").split(/[-_]/u)[0];
  return ["de", "en", "es", "fr"].includes(base ?? "") ? base! : "fr";
}

async function loadChecker(baseUrl: string, language: string | null | undefined) {
  const base = languageBase(language);
  const cached = checkerCache.get(base);
  if (cached) return cached;

  const loading = Promise.all([
    fetch(new URL(`${base}.aff`, baseUrl)).then(readDictionaryResponse),
    fetch(new URL(`${base}.dic`, baseUrl)).then(readDictionaryResponse),
  ]).then(([aff, dic]) => nspell({ aff, dic })).catch((error) => {
    checkerCache.delete(base);
    throw error;
  });
  checkerCache.set(base, loading);
  return loading;
}

async function readDictionaryResponse(response: Response) {
  if (!response.ok) throw new Error(`Dictionnaire orthographique indisponible (${response.status}).`);
  // nspell accepts strings directly. Passing a browser Uint8Array looks valid
  // but prevents Hunspell affixes and suggestions from being interpreted.
  return response.text();
}

function getCached<T>(cache: Map<string, T>, key: string) {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function setCached<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

function pauseForMessages() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function check(message: CheckMessage) {
  const issues: WorkerIssue[] = [];
  let inspectedWords = 0;
  let suggestionLookups = 0;

  for (const segment of message.segments) {
    if (cancelledRequests.has(message.id) || issues.length >= maxIssuesPerRequest) break;
    const language = languageBase(segment.language ?? message.defaultLanguage);
    const checker = await loadChecker(message.baseUrl, language);

    for (const match of segment.text.matchAll(wordPattern)) {
      if (cancelledRequests.has(message.id) || issues.length >= maxIssuesPerRequest) break;
      inspectedWords += 1;
      if (inspectedWords % 24 === 0) await pauseForMessages();

      const word = match[0];
      if (word.length < 2 || /^(?:[A-ZÀ-ÖØ-Þ]\.)+$/u.test(word)) continue;
      const normalizedWord = word.normalize("NFC").toLocaleLowerCase(language);
      const cacheKey = `${language}:${normalizedWord}`;
      let correct = getCached(correctnessCache, cacheKey);
      if (correct === undefined) {
        correct = checker.correct(word);
        setCached(correctnessCache, cacheKey, correct, 12_000);
      }
      if (correct) continue;

      let replacements = getCached(suggestionCache, cacheKey);
      if (replacements === undefined && suggestionLookups < maxSuggestionLookupsPerRequest) {
        suggestionLookups += 1;
        replacements = checker.suggest(word).slice(0, message.maxSuggestions);
        setCached(suggestionCache, cacheKey, replacements, 3_000);
      }

      issues.push({
        segmentId: segment.id,
        start: match.index,
        end: match.index + word.length,
        kind: "spelling",
        message: `Orthographe : « ${word} »`,
        replacements: replacements ?? [],
      });
    }
  }

  if (cancelledRequests.delete(message.id)) {
    scope.postMessage({ type: "cancelled", id: message.id });
    return;
  }
  scope.postMessage({ type: "result", id: message.id, issues });
}

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelledRequests.add(message.id);
    setTimeout(() => cancelledRequests.delete(message.id), 30_000);
    return;
  }

  if (message.type === "preload") {
    void loadChecker(message.baseUrl, message.language)
      .then(() => scope.postMessage({ type: "ready", id: message.id }))
      .catch((error) => scope.postMessage({
        type: "error",
        id: message.id,
        message: error instanceof Error ? error.message : "Le dictionnaire n’a pas pu être chargé.",
      }));
    return;
  }

  void check(message).catch((error) => scope.postMessage({
    type: "error",
    id: message.id,
    message: error instanceof Error ? error.message : "La correction orthographique a échoué.",
  }));
});
