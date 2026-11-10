/** BackupControls excludes device-only credentials, service configuration, the run log and the goal in both directions. */
import { getAppSettings, saveAppSettings, type AppSettings } from '../../utils/appSettings';

export function exportSettingsBackup(): Omit<
  AppSettings,
  'apiKeys' | 'providerRegions' | 'contentService' | 'vocabularyRunLog' | 'vocabularyGoal'
> {
  const {
    apiKeys: _keys,
    providerRegions: _regions,
    contentService: _service,
    vocabularyRunLog: _runs,
    vocabularyGoal: _goal,
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
    vocabularyGoal: local.vocabularyGoal,
  });
}
