/** Per-article reader display preferences and skipped-sentence notes; annotations belong to the validated cache. */
import type { PronunciationLayers } from '../types/pronunciation';

interface PronunciationPreferences {
  enabled: boolean;
  layers: PronunciationLayers;
}
const KEY = 'relire_pronunciation_preferences_v1';
const layerNames: (keyof PronunciationLayers)[] = ['connections', 'stress', 'silent', 'syllables'];
const defaults = (): PronunciationPreferences => ({
  enabled: false,
  layers: { connections: true, stress: true, silent: true, syllables: true },
});
// Keep controls usable in this tab if browser storage is unavailable or full.
const unsaved = new Map<string, PronunciationPreferences>();

function read(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getPronunciationPreferences(articleId: string): PronunciationPreferences {
  const pending = unsaved.get(articleId);
  if (pending) return pending;
  const values = read();
  const value = Object.hasOwn(values, articleId) ? values[articleId] : undefined;
  const result = defaults();
  if (!value || typeof value !== 'object') return result;
  const raw = value as Partial<PronunciationPreferences>;
  if (typeof raw.enabled === 'boolean') result.enabled = raw.enabled;
  if (raw.layers && typeof raw.layers === 'object') {
    for (const layer of layerNames) {
      if (typeof raw.layers[layer] === 'boolean') result.layers[layer] = raw.layers[layer];
    }
  }
  return result;
}

export function savePronunciationPreferences(articleId: string, preferences: PronunciationPreferences): void {
  unsaved.set(articleId, preferences);
  try {
    const values = Object.fromEntries([...Object.entries(read()), ...unsaved]);
    localStorage.setItem(KEY, JSON.stringify(values));
    unsaved.clear();
  } catch {
    // The tab retains its choice; no annotation or generated-state flag is persisted here.
  }
}

/**
 * Sentences whose AI answers failed validation and were skipped, per article,
 * so a finished article reopens ready without paying for them again. Bound to
 * the language/prompt identity they failed under; Generate retries them.
 */
const SKIPPED_KEY = 'relire_pronunciation_skipped_v1';

export function getSkippedSentences(articleId: string, identity: string): Record<string, string> {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(SKIPPED_KEY) || '{}');
    const entry = all && typeof all === 'object' ? (all as Record<string, unknown>)[articleId] : undefined;
    if (!entry || typeof entry !== 'object') return {};
    const { identity: saved, sentences } = entry as { identity?: unknown; sentences?: unknown };
    if (saved !== identity || !sentences || typeof sentences !== 'object') return {};
    return Object.fromEntries(
      Object.entries(sentences).filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export function saveSkippedSentences(articleId: string, identity: string, sentences: Record<string, string>): void {
  try {
    const all = JSON.parse(localStorage.getItem(SKIPPED_KEY) || '{}') as Record<string, unknown>;
    if (Object.keys(sentences).length) all[articleId] = { identity, sentences };
    else delete all[articleId];
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(all));
  } catch {
    // Without storage, skipped sentences are requested again on the next Generate.
  }
}
