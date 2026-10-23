/** Settings payload used by BackupControls: credentials and regions never leave or enter this browser. */
import { getAppSettings, saveAppSettings, type AppSettings } from '../../utils/appSettings';

export function exportSettingsBackup(): Omit<AppSettings, 'apiKeys' | 'providerRegions'> {
  const { apiKeys: _keys, providerRegions: _regions, ...settings } = getAppSettings();
  return settings;
}

export function restoreSettingsBackup(settings: Partial<AppSettings>): AppSettings {
  const local = getAppSettings();
  return saveAppSettings({ ...settings, apiKeys: local.apiKeys, providerRegions: local.providerRegions });
}
