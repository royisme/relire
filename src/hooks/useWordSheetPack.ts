/**
 * Settles the word sheet's pack before the sheet draws its entry: loads the pack-backed sections and the grammar
 * pack when the sheet opens and returns them once the pack has loaded or failed (undefined until then), so the
 * "Verb form" line and the conjugation slot are in the first frame of the entry and nothing shifts when they
 * arrive. A failure is not kept: the next open tries again, and the sections show its real text themselves.
 * Starts ready on the first render when an earlier open already loaded the pack. Owns that waiting only; the
 * sections and the loader are dynamic imports so none of them is in the main bundle.
 */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';

type Sections = typeof import('../components/word/packSections');

let sections: Sections | undefined;
const loadedSections = () => (sections?.loadedGrammarPack() ? sections : undefined);

type Settled = { sections: Sections; error?: never } | { sections?: never; error: string };

export function useWordSheetPack(isOpen: boolean): Settled | undefined {
  // The sections or import error once an attempt of this open has finished.
  const [settled, setSettled] = useState<Settled>();
  useEffect(() => {
    if (!isOpen || loadedSections()) return;
    let live = true;
    void import('../components/word/packSections').then(
      async (module) => {
        sections = module;
        await module.loadGrammarPack().catch(() => undefined);
        if (live) setSettled({ sections: module });
      },
      (error: unknown) => {
        if (live) setSettled({ error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
      setSettled(undefined);
    };
  }, [isOpen]);
  const loaded = loadedSections();
  return loaded ? { sections: loaded } : isOpen ? settled : undefined;
}
