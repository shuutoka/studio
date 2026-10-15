export type ProofingTextSegment = {
  id: string;
  text: string;
  language?: string | null;
};

export type FrenchSpellingIssue = {
  segmentId: string;
  start: number;
  end: number;
  kind: "spelling";
  message: string;
  replacements: string[];
  ruleId: "fr-hunspell";
};

export type FrenchDictionaryAdapter = {
  check: (word: string, normalizedWord: string) => boolean;
  suggest: (word: string, normalizedWord: string, limit: number) => string[];
};

export type FrenchAnalysisBudget = {
  remainingIssues: number;
  remainingSuggestionLookups: number;
};

type AnalyzeFrenchSegmentOptions = {
  dictionary: FrenchDictionaryAdapter;
  personalWords: ReadonlySet<string>;
  maxSuggestions: number;
  budget: FrenchAnalysisBudget;
};

const frenchWordPattern = /[\p{L}\p{M}]+/gu;
const frenchWordOnlyPattern = /^[\p{L}\p{M}]+$/u;

/**
 * Analyse le texte exact transmis par SuperDoc. Les positions retournées sont
 * des offsets UTF-16, relatifs au segment, avec une borne de fin exclusive.
 * Cette fonction ne normalise et ne reconstruit jamais le texte du segment.
 */
export function analyzeFrenchProofingSegment(
  segment: ProofingTextSegment,
  options: AnalyzeFrenchSegmentOptions,
): FrenchSpellingIssue[] {
  const issues: FrenchSpellingIssue[] = [];

  for (const match of segment.text.matchAll(frenchWordPattern)) {
    if (options.budget.remainingIssues <= 0) break;

    const word = match[0];
    const start = match.index;
    const end = start + match[0].length;
    if (word.length < 2 || /^(?:[A-ZÀ-ÖØ-Þ]\.)+$/u.test(word)) continue;

    const normalizedWord = normalizeFrenchWord(word);
    if (options.personalWords.has(normalizedWord)) continue;
    if (options.dictionary.check(word, normalizedWord)) continue;

    let replacements: string[] = [];
    if (options.budget.remainingSuggestionLookups > 0) {
      options.budget.remainingSuggestionLookups -= 1;
      replacements = sanitizeFrenchSuggestions(
        options.dictionary.suggest(word, normalizedWord, options.maxSuggestions),
        options.maxSuggestions,
      );
    }

    issues.push({
      segmentId: segment.id,
      start,
      end,
      kind: "spelling",
      message: `Orthographe : « ${word} »`,
      replacements,
      ruleId: "fr-hunspell",
    });
    options.budget.remainingIssues -= 1;
  }

  return issues;
}

/**
 * Refuse toute proposition qui inclut espaces ou ponctuation. Une suggestion
 * correspond donc toujours au mot seul, sans toucher à ses caractères voisins.
 */
export function sanitizeFrenchSuggestions(suggestions: readonly string[], limit: number) {
  const sanitized: string[] = [];
  const seen = new Set<string>();

  for (const suggestion of suggestions) {
    if (!frenchWordOnlyPattern.test(suggestion)) continue;
    const normalized = normalizeFrenchWord(suggestion);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    sanitized.push(suggestion);
    if (sanitized.length >= limit) break;
  }

  return sanitized;
}

export function normalizeFrenchWord(word: string) {
  return word.normalize("NFC").toLocaleLowerCase("fr-FR");
}
