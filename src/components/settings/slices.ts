/** AI selections and shared provider credentials save together, independently of Practice. */
import i18n from '../../i18n';
import { getAppSettings, saveAppSettings, type AppSettings } from '../../utils/appSettings';

export type SettingsSlice = 'ai' | 'practice';

export function sliceOf(settings: AppSettings, slice: SettingsSlice): string {
  if (slice === 'practice')
    return JSON.stringify([
      settings.practiceStrictAccents,
      settings.practiceDictationSpeed,
      settings.practiceSpeakAfterCheck,
    ]);
  const providers = [...new Set([settings.textProvider, settings.ocrProvider, settings.speechProvider])].sort();
  return JSON.stringify([
    settings.textProvider,
    settings.textModel,
    settings.ocrProvider,
    settings.ocrModel,
    settings.speechProvider,
    settings.speechModel,
    settings.speechVoice,
    providers.map((id) => [id, settings.apiKeys[id] ?? '']),
  ]);
}

export function withSlice(base: AppSettings, from: AppSettings, slice: SettingsSlice): AppSettings {
  if (slice === 'practice')
    return {
      ...base,
      practiceStrictAccents: from.practiceStrictAccents,
      practiceDictationSpeed: from.practiceDictationSpeed,
      practiceSpeakAfterCheck: from.practiceSpeakAfterCheck,
    };
  const providers = [from.textProvider, from.ocrProvider, from.speechProvider];
  return {
    ...base,
    textProvider: from.textProvider,
    textModel: from.textModel,
    ocrProvider: from.ocrProvider,
    ocrModel: from.ocrModel,
    speechProvider: from.speechProvider,
    speechModel: from.speechModel,
    speechVoice: from.speechVoice,
    apiKeys: { ...base.apiKeys, ...Object.fromEntries(providers.map((id) => [id, from.apiKeys[id] ?? ''])) },
  };
}

/** Read back because saveAppSettings catches storage errors. Never mark a failed write as saved. */
export function saveSlice(draft: AppSettings, slice: SettingsSlice): AppSettings {
  const intended = withSlice(getAppSettings(), draft, slice);
  const next = saveAppSettings(intended);
  if (sliceOf(getAppSettings(), slice) !== sliceOf(intended, slice)) throw new Error(i18n.t('settings.notStored'));
  return next;
}
