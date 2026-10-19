/**
 * Settles the word sheet's pack and lexicon before the sheet draws its entry: loads the pack-backed sections, the
 * grammar pack and, when a content service is configured, the lexicon's verb lines for the tapped word when the
 * sheet opens (in parallel with the AI answer), and returns them once all have loaded or failed (undefined until
 * then), so the "Verb form" lines and the conjugation slot are in the first frame of the entry and nothing shifts
 * when they arrive. A failure is not kept: the next open tries again, and the sections show its real text themselves.
 * Starts ready on the first render when an earlier open already loaded the pack and no lexicon is to be asked.
 * Owns that waiting only; the sections, the loaders and the lexicon are dynamic imports so none of them is in
 * the main bundle.
 */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { contentServiceUrl } from '../services/grammarTopics/service';
import type { LexiconVerbLines } from '../services/lexicon/verbs';

type Sections = typeof import('../components/word/packSections');

let sections: Sections | undefined;
const loadedSections = () => (sections?.loadedGrammarPack() ? sections : undefined);

const NO_LEXICON: LexiconVerbLines = { lines: [] };

type Settled =
  | { sections: Sections; lexicon: LexiconVerbLines; error?: never }
  | { sections?: never; lexicon?: never; error: string };

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
        await sections.loadGrammarPack().catch(() => undefined);
        result = { sections, lexicon: await sections.lexiconVerbLines(word) };
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
  if (loaded && !contentServiceUrl()) return { sections: loaded, lexicon: NO_LEXICON };
  return settled?.word === word ? settled.result : undefined;
}
