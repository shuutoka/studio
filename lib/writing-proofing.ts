import nspell, { type NSpell } from "nspell";
import type { SuperDocConfig } from "@superdoc/react";

import type { WritingLanguage } from "@/lib/studio";

type ProofingProvider = NonNullable<NonNullable<SuperDocConfig["proofing"]>["provider"]>;
type ProofingRequest = Parameters<ProofingProvider["check"]>[0];
type ProofingSegment = ProofingRequest["segments"][number];
type ProofingIssue = Awaited<ReturnType<ProofingProvider["check"]>>["issues"][number];

const checkerCache = new Map<string, Promise<NSpell>>();
const wordPattern = /[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu;

function languageBase(language: string | null | undefined) {
  const base = language?.toLocaleLowerCase("en").split(/[-_]/u)[0];
  return ["de", "en", "es", "fr"].includes(base ?? "") ? base! : "fr";
}

async function loadChecker(language: string | null | undefined) {
  const base = languageBase(language);
  const cached = checkerCache.get(base);
  if (cached) return cached;
  const loading = Promise.all([
    fetch(new URL(`proofing/${base}.aff`, document.baseURI)).then(readDictionaryResponse),
    fetch(new URL(`proofing/${base}.dic`, document.baseURI)).then(readDictionaryResponse),
  ]).then(([aff, dic]) => nspell({ aff, dic }));
  checkerCache.set(base, loading);
  return loading;
}

async function readDictionaryResponse(response: Response) {
  if (!response.ok) throw new Error(`Dictionnaire orthographique indisponible (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

async function checkSegment(segment: ProofingSegment, fallbackLanguage: string | null | undefined) {
  const checker = await loadChecker(segment.language ?? fallbackLanguage);
  const issues: ProofingIssue[] = [];
  for (const match of segment.text.matchAll(wordPattern)) {
    const word = match[0];
    const start = match.index;
    if (word.length < 2 || /^(?:[A-ZÀ-ÖØ-Þ]\.)+$/u.test(word) || checker.correct(word)) continue;
    issues.push({
      segmentId: segment.id,
      start,
      end: start + word.length,
      kind: "spelling",
      message: `Orthographe : « ${word} »`,
      replacements: checker.suggest(word).slice(0, 6),
    });
    if (issues.length >= 250) break;
  }
  return issues;
}

export function preloadWritingDictionary(language: WritingLanguage) {
  return loadChecker(language).then(() => undefined);
}

export function createStudioProofingProvider(): ProofingProvider {
  return {
    id: "enfer-fatal-local-spelling",
    getCapabilities: () => ({
      issueKinds: ["spelling"],
      supportsSuggestions: true,
      supportsMultipleLanguages: true,
      supportsBatching: true,
      requiresNetwork: false,
    }),
    check: async (request) => ({
      issues: (await Promise.all(request.segments.map((segment) =>
        checkSegment(segment, request.defaultLanguage),
      ))).flat(),
    }),
  };
}
