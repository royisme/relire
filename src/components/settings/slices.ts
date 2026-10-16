/**
 * Settings sections save on their own, so each one owns a slice of AppSettings. A slice is the
 * handful of fields one section edits: reading it (for "unsaved changes"), and copying it from a
 * draft onto saved settings (so saving Speech never writes a half-typed text key).
 */
import i18n from '../../i18n';
import { getAppSettings, saveAppSettings, type AppSettings } from '../../utils/appSettings';

export type SettingsSlice = 'text' | 'speech';

/** The fields a section shows, as a comparable string. */
export function sliceOf(settings: AppSettings, slice: SettingsSlice): string {
  if (slice === 'text') {
    return JSON.stringify([settings.textProvider, settings.textModel, settings.apiKeys[settings.textProvider] ?? '']);
  }
  const keyed = settings.speechProvider !== settings.textProvider;
  return JSON.stringify([
    settings.speechProvider,
    settings.speechModel,
    settings.speechVoice,
    keyed ? (settings.apiKeys[settings.speechProvider] ?? '') : '',
  ]);
}

/** `base` with the fields of `slice` taken from `from`. */
export function withSlice(base: AppSettings, from: AppSettings, slice: SettingsSlice): AppSettings {
  if (slice === 'text') {
    return {
      ...base,
      textProvider: from.textProvider,
      textModel: from.textModel,
      apiKeys: { ...base.apiKeys, [from.textProvider]: from.apiKeys[from.textProvider] ?? '' },
    };
  }
  const keyed = from.speechProvider !== from.textProvider;
  return {
    ...base,
    speechProvider: from.speechProvider,
    speechModel: from.speechModel,
    speechVoice: from.speechVoice,
    apiKeys: keyed ? { ...base.apiKeys, [from.speechProvider]: from.apiKeys[from.speechProvider] ?? '' } : base.apiKeys,
  };
}

/**
 * Saves one slice of the draft on top of what is stored. `saveAppSettings` swallows storage errors,
 * so the result is read back; a value that did not stick is reported instead of shown as saved.
 */
export function saveSlice(draft: AppSettings, slice: SettingsSlice): AppSettings {
  const next = saveAppSettings(withSlice(getAppSettings(), draft, slice));
  if (sliceOf(getAppSettings(), slice) !== sliceOf(next, slice)) throw new Error(i18n.t('settings.notStored'));
  return next;
}
