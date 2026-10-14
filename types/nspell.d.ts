declare module "nspell" {
  export type NSpellDictionary = {
    aff: Uint8Array | string;
    dic: Uint8Array | string;
  };

  export type NSpell = {
    correct: (word: string) => boolean;
    suggest: (word: string) => string[];
    add: (word: string, model?: string) => NSpell;
  };

  export default function nspell(dictionary: NSpellDictionary): NSpell;
}
