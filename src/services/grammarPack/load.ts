/** Owns lazy whole-pack validation and promise memoisation; not generation, lookup or UI state. */
import { GrammarPackSchema, type GrammarPack } from '../../types/grammarPack';

let pending: Promise<GrammarPack> | undefined;

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
}
