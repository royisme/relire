/** Per-article reader display preferences only; annotations and readiness belong to the validated cache. */
import type { PronunciationLayers } from '../types/pronunciation';

interface PronunciationPreferences {
  enabled: boolean;
  layers: PronunciationLayers;
}
const KEY = 'relire_pronunciation_preferences_v1';
const layerNames: (keyof PronunciationLayers)[] = ['connections', 'stress', 'silent', 'syllables'];
const defaults = (): PronunciationPreferences => ({
  enabled: false, layers: { connections: true, stress: true, silent: true, syllables: true },
});
// Keep controls usable in this tab if browser storage is unavailable or full.
const unsaved = new Map<string, PronunciationPreferences>();

function read(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
