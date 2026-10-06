/**
 * The colour theme: the user's preference (system, light, sepia, dark), what it resolves to, and
 * applying it to <html data-theme>. index.html runs the same resolution before first paint, so the
 * page never flashes the wrong theme; keep the two in step (storage key and values).
 */

export type ThemePreference = 'system' | 'light' | 'sepia' | 'dark';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'sepia', 'dark'];

const STORAGE_KEY = 'relire_theme';
/** Browser chrome colour per theme: the page background (`ink-50`). */
const CHROME: Record<ResolvedTheme, string> = { light: '#F7F6F3', sepia: '#F3EBD9', dark: '#161513' };

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return THEME_PREFERENCES.includes(v as ThemePreference) ? (v as ThemePreference) : 'system';
  } catch {
    return 'system';
  }
}

let preference: ThemePreference = read();

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref !== 'system') return pref;
  return media?.matches ? 'dark' : 'light';
}

function apply() {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[resolved]);
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
  apply();
  listeners.forEach((l) => l());
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Following the system means reacting when it changes while the app is open.
media?.addEventListener('change', () => {
  if (preference !== 'system') return;
  apply();
  listeners.forEach((l) => l());
});

if (typeof document !== 'undefined') apply();
