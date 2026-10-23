/**
 * Settles the word sheet's pack and lexicon before the sheet draws its entry: loads the pack-backed sections, the
 * conjugation and noun-gender packs and, when a content service is configured, the lexicon's verb lines for the
 * tapped word when the sheet opens (in parallel with the AI answer), and returns them once all have loaded or
 * failed (undefined until then), so noun tendencies, "Verb form" lines and the conjugation slot are in the first
 * entry frame. Noun failures stay independent of conjugation/lexicon results; the next open tries again.
 * Starts ready on the first render when an earlier open loaded both packs and no lexicon is to be asked.
 * Owns that waiting only; the sections, the loaders and the lexicon are dynamic imports so none of them is in
 * the main bundle.
 */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { contentServiceUrl } from '../services/grammarTopics/service';
import type { LexiconVerbLines } from '../services/lexicon/verbs';
import type { NounGenderPack } from '../types/nounGender';

type Sections = typeof import('../components/word/packSections');

let sections: Sections | undefined;
const loadedSections = () => (sections?.loadedGrammarPack() && sections.loadedNounGenderPack() ? sections : undefined);

const NO_LEXICON: LexiconVerbLines = { lines: [] };

export type NounPackResult = { pack: NounGenderPack; error?: never } | { pack?: never; error: string };

type Settled =
  | { sections: Sections; lexicon: LexiconVerbLines; nounGender: NounPackResult; error?: never }
  | { sections?: never; lexicon?: never; nounGender?: never; error: string };

export function useWordSheetPack(isOpen: boolean, word: string | null): Settled | undefined {
  // The result of this open's attempt, with the word it was for.
  const [settled, setSettled] = useState<{ word: string; result: Settled }>();
  useEffect(() => {
    if (!isOpen || !word || (loadedSections() && !contentServiceUrl())) return;
    let live = true;
    void (async () => {
      let result: Settled;
      try {
        sections = await import('../components/word/packSections');
        const [, nounGender, lexicon] = await Promise.all([
          sections.loadGrammarPack().catch(() => undefined),
          sections.loadNounGenderPack().then(
            (pack): NounPackResult => ({ pack }),
            (error: unknown): NounPackResult => ({ error: errorMessage(error) }),
          ),
          sections.lexiconVerbLines(word),
        ]);
        result = { sections, lexicon, nounGender };
      } catch (error) {
        result = { error: errorMessage(error) };
      }
      if (live) setSettled({ word, result });
    })();
    return () => {
      live = false;
      setSettled(undefined);
    };
  }, [isOpen, word]);
  const loaded = loadedSections();
  if (!isOpen || !word) return undefined;
  if (loaded && !contentServiceUrl())
    return { sections: loaded, lexicon: NO_LEXICON, nounGender: { pack: loaded.loadedNounGenderPack()! } };
  return settled?.word === word ? settled.result : undefined;
}
