import Typo from "typo-js";

import {
  analyzeFrenchProofingSegment,
  normalizeFrenchWord,
  type FrenchDictionaryAdapter,
  type FrenchSpellingIssue,
  type ProofingTextSegment,
} from "@/lib/writing-proofing-analyzer";

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
      segments: ProofingTextSegment[];
    };

type OutgoingMessage =
  | { type: "ready"; id: number }
  | { type: "cancelled"; id: number }
  | { type: "result"; id: number; issues: FrenchSpellingIssue[] }
  | { type: "error"; id: number; message: string };

type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<IncomingMessage>) => void) => void;
  postMessage: (message: OutgoingMessage) => void;
};

const scope = globalThis as unknown as WorkerScope;
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
  const issues: FrenchSpellingIssue[] = [];
  const budget = {
    remainingIssues: maxIssuesPerCheck,
    remainingSuggestionLookups: maxSuggestionLookupsPerCheck,
  };
  const dictionaryAdapter: FrenchDictionaryAdapter = {
    check: (word, normalizedWord) => {
      let correct = readCache(correctCache, normalizedWord);
      if (correct === undefined) {
        correct = dictionary.check(word);
        writeCache(correctCache, normalizedWord, correct, 8_000);
      }
      return correct;
    },
    suggest: (word, normalizedWord, limit) => {
      let replacements = readCache(suggestionCache, normalizedWord);
      if (replacements === undefined) {
        replacements = dictionary.suggest(word, limit);
        writeCache(suggestionCache, normalizedWord, replacements, 1_500);
      }
      return replacements;
    },
  };

  for (const segment of message.segments) {
    if (!isFrench(segment.language ?? message.defaultLanguage)) continue;
    issues.push(...analyzeFrenchProofingSegment(segment, {
      dictionary: dictionaryAdapter,
      personalWords,
      maxSuggestions: Math.min(5, message.maxSuggestions),
      budget,
    }));
    if (cancelledRequests.has(message.id) || budget.remainingIssues <= 0) break;
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

const normalizeWord = normalizeFrenchWord;

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
