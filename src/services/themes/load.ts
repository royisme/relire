/** Owns lazy taxonomy validation and immutable memoisation; failed loads retry on a later opening. */
import { ThemesSchema, type Theme } from '../../types/themes';

let pending: Promise<Theme[]> | undefined;
let loaded: Theme[] | undefined;

export const loadedThemes = () => loaded;

function freeze(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child);
  }
  Object.freeze(value);
}

export function loadThemes(data?: unknown): Promise<Theme[]> {
  pending ??= (async () => {
    const source = data === undefined ? (await import('../../data/themes/themes.json')).default : data;
    const result = ThemesSchema.safeParse(source);
    if (!result.success) {
      throw new Error(
        `The theme taxonomy was not usable: ${result.error.issues
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

/** Only for isolated loader tests; application callers share one immutable taxonomy. */
export function resetThemesForTests(): void {
  pending = undefined;
  loaded = undefined;
}
