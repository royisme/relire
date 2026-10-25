/** The run log is bounded, validated at settings storage and excluded from backup in both directions. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { appendRunLog, type VocabularyRunRecord } from '../src/services/vocabulary/game/runLog';
import { getAppSettings, saveAppSettings } from '../src/utils/appSettings';
import { exportSettingsBackup, restoreSettingsBackup } from '../src/components/settings/backupSettings';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';

beforeEach(freshSettingsStorage);
afterEach(restoreSettingsStorage);
const record: VocabularyRunRecord = { date: '2026-10-25', mode: 'game', chunkSize: 5, ratings: 5 };

test('append keeps the last 90 records in order and never mutates its input', () => {
  expect(appendRunLog([], record)).toEqual([record]);
  const previous = Array.from({ length: 90 }, (_, index) => ({ ...record, ratings: index }));
  const result = appendRunLog(previous, record);
  expect(result).toHaveLength(90);
  expect(result).toEqual([...previous.slice(1), record]);
  expect(previous).toHaveLength(90);
  expect(previous[0].ratings).toBe(0);
});

test('settings round-trip the device log without changing other settings', () => {
  expect(getAppSettings().vocabularyRunLog).toEqual([]);
  saveAppSettings({ practiceStrictAccents: true, vocabularyRunLog: [record] });
  saveAppSettings({
    vocabularyRunLog: appendRunLog(getAppSettings().vocabularyRunLog, { ...record, chunkSize: 10, ratings: 10 }),
  });
  expect(getAppSettings().vocabularyRunLog).toEqual([record, { ...record, chunkSize: 10, ratings: 10 }]);
  expect(getAppSettings().practiceStrictAccents).toBe(true);
});

test('the storage boundary rejects malformed records and an unbounded log', () => {
  for (const vocabularyRunLog of [
    null,
    {},
    [{ ...record, mode: 'plain' }],
    [{ ...record, date: '2026-02-30' }],
    [{ ...record, chunkSize: 7 }],
    [{ ...record, ratings: -1 }],
    Array(91).fill(record),
  ]) {
    localStorage.setItem('relire_app_settings_v1', JSON.stringify({ vocabularyRunLog }));
    expect(getAppSettings().vocabularyRunLog).toEqual([]);
  }
});

test('export omits the log and restore ignores an imported log while keeping this device’s records', () => {
  saveAppSettings({ vocabularyRunLog: [record] });
  const backup = exportSettingsBackup();
  expect(JSON.stringify(backup)).not.toContain('vocabularyRunLog');
  restoreSettingsBackup({ ...backup, vocabularyRunLog: [{ ...record, date: '2026-10-24' }] });
  expect(getAppSettings().vocabularyRunLog).toEqual([record]);
  restoreSettingsBackup(backup);
  expect(getAppSettings().vocabularyRunLog).toEqual([record]);
});
