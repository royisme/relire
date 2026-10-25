/** BackupControls excludes device-only credentials, service configuration and the run log in both directions. */
import { getAppSettings, saveAppSettings, type AppSettings } from '../../utils/appSettings';

export function exportSettingsBackup(): Omit<
  AppSettings,
  'apiKeys' | 'providerRegions' | 'contentService' | 'vocabularyRunLog'
> {
  const {
    apiKeys: _keys,
    providerRegions: _regions,
    contentService: _service,
    vocabularyRunLog: _runs,
    ...settings
  } = getAppSettings();
  return settings;
}

export function restoreSettingsBackup(settings: Partial<AppSettings>): AppSettings {
  const local = getAppSettings();
  return saveAppSettings({
    ...settings,
    apiKeys: local.apiKeys,
    providerRegions: local.providerRegions,
    contentService: local.contentService,
    vocabularyRunLog: local.vocabularyRunLog,
  });
}
