declare module "typo-js" {
  export type TypoSettings = {
    asyncLoad?: boolean;
    loadedCallback?: (dictionary: Typo) => void;
  };

  export default class Typo {
    constructor(dictionary: string, affData: string, wordsData: string, settings?: TypoSettings);
    check(word: string): boolean;
    suggest(word: string, limit?: number): string[];
  }
}
