import Typo from "typo-js";

type Segment = { id: string; text: string; language?: string | null };
type Issue = {
  segmentId: string;
  start: number;
  end: number;
  kind: "spelling";
  message: string;
  replacements: string[];
  ruleId: "fr-hunspell";
};

type IncomingMessage =
  | { type: "preload"; id: number; baseUrl: string }
  | { type: "cancel"; id: number }
  | {
      type: "check";
      id: number;
      baseUrl: string;
      defaultLanguage: string;
      maxSuggestions: number;
      personalWords: string[];
      segments: Segment[];
    };

type OutgoingMessage =
  | { type: "ready"; id: number }
  | { type: "cancelled"; id: number }
  | { type: "result"; id: number; issues: Issue[] }
  | { type: "error"; id: number; message: string };

type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<IncomingMessage>) => void) => void;
  postMessage: (message: OutgoingMessage) => void;
};

const scope = globalThis as unknown as WorkerScope;
const wordPattern = /[\p{L}\p{M}]+/gu;
const cancelledRequests = new Set<number>();
const correctCache = new Map<string, boolean>();
const suggestionCache = new Map<string, string[]>();
const maxIssuesPerCheck = 60;
const maxSuggestionLookupsPerCheck = 4;
let dictionaryPromise: Promise<Typo> | null = null;

function loadDictionary(baseUrl: string) {
  if (dictionaryPromise) return dictionaryPromise;
  dictionaryPromise = Promise.all([
    fetch(new URL("fr.aff", baseUrl)).then(readDictionaryText),
    fetch(new URL("fr.dic", baseUrl)).then(readDictionaryText),
  ]).then(([affData, wordsData]) => new Typo("fr_FR", affData, wordsData)).catch((error) => {
    dictionaryPromise = null;
    throw error;
  });
  return dictionaryPromise;
}

async function readDictionaryText(response: Response) {
  if (!response.ok) throw new Error(`Dictionnaire français indisponible (${response.status}).`);
  return response.text();
}

async function check(message: Extract<IncomingMessage, { type: "check" }>) {
  const dictionary = await loadDictionary(message.baseUrl);
  const personalWords = new Set(message.personalWords.map(normalizeWord));
  const issues: Issue[] = [];
  let checkedWords = 0;
  let suggestionLookups = 0;

  for (const segment of message.segments) {
    if (!isFrench(segment.language ?? message.defaultLanguage)) continue;
    for (const match of segment.text.matchAll(wordPattern)) {
      if (cancelledRequests.has(message.id) || issues.length >= maxIssuesPerCheck) break;
      checkedWords += 1;
      if (checkedWords % 20 === 0) await pauseForMessages();

      const word = match[0];
      if (word.length < 2 || /^(?:[A-ZÀ-ÖØ-Þ]\.)+$/u.test(word)) continue;
      const normalized = normalizeWord(word);
      if (personalWords.has(normalized)) continue;

      let correct = readCache(correctCache, normalized);
      if (correct === undefined) {
        correct = dictionary.check(word);
        writeCache(correctCache, normalized, correct, 8_000);
      }
      if (correct) continue;

      let replacements = readCache(suggestionCache, normalized);
      if (replacements === undefined && suggestionLookups < maxSuggestionLookupsPerCheck) {
        suggestionLookups += 1;
        replacements = dictionary.suggest(word, Math.min(5, message.maxSuggestions))
          .filter((suggestion) => /^[\p{L}\p{M}]+$/u.test(suggestion));
        writeCache(suggestionCache, normalized, replacements, 1_500);
      }

      issues.push({
        segmentId: segment.id,
        start: match.index,
        end: match.index + word.length,
        kind: "spelling",
        message: `Orthographe : « ${word} »`,
        replacements: replacements ?? [],
        ruleId: "fr-hunspell",
      });
    }
    if (issues.length >= maxIssuesPerCheck) break;
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
    void loadDictionary(message.baseUrl)
      .then(() => scope.postMessage({ type: "ready", id: message.id }))
      .catch((error) => postError(message.id, error));
    return;
  }
  void check(message).catch((error) => postError(message.id, error));
});

function postError(id: number, error: unknown) {
  scope.postMessage({
    type: "error",
    id,
    message: error instanceof Error ? error.message : "La correction orthographique a échoué.",
  });
}

function isFrench(language: string | null | undefined) {
  return language?.toLocaleLowerCase("fr").split(/[-_]/u)[0] === "fr";
}

function normalizeWord(word: string) {
  return word.normalize("NFC").toLocaleLowerCase("fr-FR");
}

function pauseForMessages() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function readCache<T>(cache: Map<string, T>, key: string) {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function writeCache<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}
