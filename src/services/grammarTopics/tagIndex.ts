/** Owns lazy tag-index validation and its retryable cache; never imports topic content or schemas. */
import { GrammarTagIndexSchema, type GrammarTagIndex } from '../../types/grammarTagIndex';

let indexPending: Promise<GrammarTagIndex> | undefined;
let indexLoaded: GrammarTagIndex | undefined;

export const loadedGrammarTagIndex = () => indexLoaded;

export function loadGrammarTagIndex(): Promise<GrammarTagIndex> {
  indexPending ??= (async () => {
    const { default: data } = await import('../../data/grammar/tag-index.json');
    indexLoaded = GrammarTagIndexSchema.parse(data);
    return indexLoaded;
  })().catch((error: unknown) => {
    indexPending = undefined;
    throw error;
  });
  return indexPending;
}

/** Only for isolated loader tests; application callers share immutable artifacts. */
export function resetGrammarTagIndexForTests(): void {
  indexPending = undefined;
  indexLoaded = undefined;
}
