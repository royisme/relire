/** Owns lazy whole-pack validation, promise memoisation and the resolved value; not generation, lookup or UI state. */
import { GrammarPackSchema, type GrammarPack } from '../../types/grammarPack';

let pending: Promise<GrammarPack> | undefined;
// The resolved value beside its promise, so a caller that mounts after the load can start ready, not "loading".
let loaded: GrammarPack | undefined;

/** The pack once a load has succeeded, else undefined (never loading, never failed). */
export const loadedGrammarPack = () => loaded;

export function loadGrammarPack(): Promise<GrammarPack> {
  pending ??= (async () => {
    const { default: data } = await import('../../data/grammar-pack/pack.json');
    const result = GrammarPackSchema.safeParse(data);
    if (!result.success) {
      throw new Error(
        `The grammar pack was not usable: ${result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    loaded = result.data;
    return result.data;
  })().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

/** Only for isolated loader tests; application callers share the immutable pack. */
export function resetGrammarPackForTests(): void {
  pending = undefined;
  loaded = undefined;
}
