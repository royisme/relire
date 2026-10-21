/** Owns lazy whole-pack validation and immutable memoisation; failed loads retry on a later opening. */
import { NounGenderPackSchema, type NounGenderPack } from '../../types/nounGender';

let pending: Promise<NounGenderPack> | undefined;
let loaded: NounGenderPack | undefined;

export const loadedNounGenderPack = () => loaded;

function freeze(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child);
  }
  Object.freeze(value);
}

export function loadNounGenderPack(data?: unknown): Promise<NounGenderPack> {
  pending ??= (async () => {
    const source = data === undefined ? (await import('../../data/noun-gender/pack.json')).default : data;
    const result = NounGenderPackSchema.safeParse(source);
    if (!result.success) {
      throw new Error(
        `The noun-gender pack was not usable: ${result.error.issues
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
export function resetNounGenderPackForTests(): void {
  pending = undefined;
  loaded = undefined;
}
