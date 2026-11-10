/** Owns lazy pack validation, deep freezing and shared retryable loads; not assembly or linguistic approval. */
import { SpellingSoundsPackSchema, type SpellingSoundsPack } from '../../types/spellingSounds';
export type { SpellingSoundsPack } from '../../types/spellingSounds';

let pending: Promise<SpellingSoundsPack> | undefined;
let loaded: SpellingSoundsPack | undefined;
export const loadedSpellingSoundsPack = () => loaded;

function freeze(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child);
  }
  Object.freeze(value);
}

async function bundledPack(): Promise<unknown> {
  // A zero-match glob builds cleanly before the lead publishes the first pack.
  const loaders = import.meta.glob<{ default: unknown }>('../../data/spelling-sounds/patterns.json');
  const load = Object.values(loaders)[0];
  if (!load) throw new Error('The spelling-sounds pack is not available: no reviewed pack has been built');
  return (await load()).default;
}

export function loadSpellingSoundsPack(data?: unknown): Promise<SpellingSoundsPack> {
  pending ??= (async () => {
    const source = data === undefined ? await bundledPack() : data;
    const result = SpellingSoundsPackSchema.safeParse(source);
    if (!result.success) {
      throw new Error(
        `The spelling-sounds pack was not usable: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
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

/** Only for isolated tests; application callers share one immutable pack. */
export function resetSpellingSoundsPackForTests(): void {
  pending = undefined;
  loaded = undefined;
}
