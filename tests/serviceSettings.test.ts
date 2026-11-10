/** The content service block: off by default with the dev prefill, device-local in backups, its own settings slice. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../src/i18n';
import { getAppSettings, saveAppSettings } from '../src/utils/appSettings';
import { contentServiceUrl } from '../src/services/grammarTopics/service';
import { exportSettingsBackup, restoreSettingsBackup } from '../src/components/settings/backupSettings';
import { saveSlice, sliceOf, withSlice } from '../src/components/settings/slices';
import { useVocabularyBook } from '../src/hooks/useVocabularyBook';
import { freshSettingsStorage, restoreSettingsStorage, serviceOn } from './fixtures/contentServiceSettings';

beforeEach(() => freshSettingsStorage());
afterEach(() => restoreSettingsStorage());

test('the default is off, with the env URL only as a prefill', () => {
  const original = process.env.VITE_CONTENT_SERVICE_URL;
  try {
    process.env.VITE_CONTENT_SERVICE_URL = 'http://content.test/';
    expect(getAppSettings().contentService).toEqual({ enabled: false, url: 'http://content.test', key: '' });
    expect(contentServiceUrl()).toBeUndefined();
  } finally {
    if (original === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
    else process.env.VITE_CONTENT_SERVICE_URL = original;
  }
});

test('storage normalizes the block: the URL through the shared base-URL check, the key trimmed', () => {
  saveAppSettings({ contentService: { enabled: true, url: ' http://content.test/ ', key: ' TEST-key ' } });
  expect(getAppSettings().contentService).toEqual({ enabled: true, url: 'http://content.test', key: 'TEST-key' });
  // Malformed blocks are written raw, as a corrupt store would hold them, and read back through the boundary.
  const storedBlock = (block: unknown) =>
    localStorage.setItem('relire_app_settings_v1', JSON.stringify({ contentService: block }));
  for (const url of ['', 'not a url', 'ftp://content.test', 'https://content.test/path?q=1', 7, null]) {
    storedBlock({ enabled: true, url, key: 'TEST-key' });
    expect(getAppSettings().contentService).toEqual({ enabled: true, url: '', key: 'TEST-key' });
    expect(contentServiceUrl()).toBeUndefined();
  }
  storedBlock({ enabled: 'yes', url: 'http://content.test', key: 'TEST-key' });
  expect(getAppSettings().contentService.enabled).toBe(false);
});

test('a backup never carries the block, and a restore keeps this device\u2019s', () => {
  serviceOn('http://content.test', 'TEST-access-key');
  const serialized = JSON.stringify({ settings: exportSettingsBackup() });
  expect(serialized).not.toContain('contentService');
  expect(serialized).not.toContain('TEST-access-key');
  const payload = JSON.parse(serialized).settings;
  payload.contentService = { enabled: true, url: 'https://imported.test', key: 'TEST-imported' };
  const next = restoreSettingsBackup(payload);
  expect(next.contentService).toEqual({ enabled: true, url: 'http://content.test', key: 'TEST-access-key' });
  expect(getAppSettings()).toEqual(next);
});

test('a service save stores only the service slice, so a draft in another slice survives it', () => {
  const stored = saveAppSettings({
    practiceStrictAccents: false,
    contentService: { enabled: false, url: '', key: '' },
  });
  // The page's draft holds an unsaved Practice edit beside the service values being saved.
  const draft = {
    ...stored,
    practiceStrictAccents: true,
    contentService: { enabled: true, url: 'http://content.test', key: 'TEST-key' },
  };
  expect(sliceOf(draft, 'service')).not.toBe(sliceOf(stored, 'service'));
  const next = saveSlice(draft, 'service');
  expect(next.contentService).toEqual({ enabled: true, url: 'http://content.test', key: 'TEST-key' });
  expect(getAppSettings().practiceStrictAccents).toBe(false);
  expect(sliceOf(next, 'practice')).toBe(sliceOf(stored, 'practice'));
  // The page keeps its unsaved Practice draft through a service save: withSlice restores only the saved slice.
  const kept = withSlice(draft, next, 'service');
  expect(kept.practiceStrictAccents).toBe(true);
  expect(kept.contentService).toEqual(next.contentService);
});

test('a service save with an unusable address is refused and stores nothing', () => {
  const base = getAppSettings();
  expect(() =>
    saveSlice({ ...base, contentService: { enabled: false, url: 'not a url', key: '' } }, 'service'),
  ).toThrow(i18n.t('serviceSettings.urlNotValid'));
  expect(getAppSettings().contentService).toEqual(base.contentService);
});

test('a Words mount after a save reads the new service state', () => {
  const configured = () => renderToStaticMarkup(createElement((): string => String(useVocabularyBook().configured)));
  expect(configured()).toBe('false');
  serviceOn('http://content.test', 'TEST-access-key');
  expect(configured()).toBe('true');
  expect(contentServiceUrl()).toBe('http://content.test');
});
