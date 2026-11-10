/** Owns lazy whole-pack validation and immutable memoisation; failed loads retry on a later opening. */
import { MinimalPairsPackSchema, type MinimalPairsPack } from '../../types/minimalPairs';

let pending: Promise<MinimalPairsPack> | undefined;
let loaded: MinimalPairsPack | undefined;

export const loadedMinimalPairsPack = () => loaded;

function freeze(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child);
  }
  Object.freeze(value);
}

/**
 * The committed pack as its own lazy chunk. Reached through a glob, not a literal import:
 * until the owner's review is recorded the generated file does not exist, and a literal
 * import of a missing file fails the vite build while a zero-match glob builds cleanly.
 */
async function bundledPack(): Promise<unknown> {
  const loaders = import.meta.glob<{ default: unknown }>('../../data/minimal-pairs/pairs.json');
  const load = Object.values(loaders)[0];
  if (!load) throw new Error('The minimal-pairs pack is not available: no reviewed pack has been built');
  return (await load()).default;
}

export function loadMinimalPairsPack(data?: unknown): Promise<MinimalPairsPack> {
  pending ??= (async () => {
    const source = data === undefined ? await bundledPack() : data;
    const result = MinimalPairsPackSchema.safeParse(source);
    if (!result.success) {
      throw new Error(
        `The minimal-pairs pack was not usable: ${result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    freeze(result.data);
    loaded = result.data;
    return loaded;
  })().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

/** Only for isolated loader tests; application callers share one immutable pack. */
export function resetMinimalPairsPackForTests(): void {
  pending = undefined;
  loaded = undefined;
}
