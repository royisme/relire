/** The settings block that turns the content service on, plus the localStorage stand-in app settings need. */
import { saveAppSettings } from '../../src/utils/appSettings';

const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

/** Installs the storage stand-in and starts from empty settings, as a fresh browser would. */
export function freshSettingsStorage() {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
  });
}

/** Restores whatever global localStorage was there, so no enabled service leaks into later test files. */
export function restoreSettingsStorage() {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

/** The service is on with a key, the way Settings' Test and Enable switch store it. */
export function serviceOn(url = 'http://content.test', key = 'TEST-access-key') {
  saveAppSettings({ contentService: { enabled: true, url, key } });
}

/** The service is off, so every consumer treats it as not configured. */
export function serviceOff() {
  saveAppSettings({ contentService: { enabled: false, url: '', key: '' } });
}
