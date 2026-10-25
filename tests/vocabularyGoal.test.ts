/** The opt-in goal: weekly first-attainment series, calendar days left, the dialog's input boundary and the
 *  settings boundary with backup exclusion in both directions. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { VocabularyRow, VocabularySchedule } from '../src/types/vocabulary';
import { summarizeRhythm, weeklyGained } from '../src/services/vocabulary/game/rhythm';
import { goalDaysLeft, parseGoalInput, type VocabularyGoal } from '../src/services/vocabulary/game/goal';
import { testMatureSchedule, testRow } from './fixtures/vocabulary';
import { getAppSettings, saveAppSettings } from '../src/utils/appSettings';
import { exportSettingsBackup, restoreSettingsBackup } from '../src/components/settings/backupSettings';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';

beforeEach(freshSettingsStorage);
afterEach(restoreSettingsStorage);

const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const atSept = (day: number) => new Date(2026, 8, day, 12).getTime();
const history = (entries: [number, number][]): VocabularyRow['history'] =>
  entries.map(([reviewedAt, scheduledDays], index) => ({
    operationId: `test-${index}`,
    reviewedAt,
    outcome: 'remembered',
    retentionPercent: 90,
    prior: testMatureSchedule(reviewedAt),
    next: { ...testMatureSchedule(reviewedAt), scheduledDays },
    revision: index + 1,
  }));
const row = (entries: [number, number][], schedule: VocabularySchedule | null = null) => ({
  ...testRow(),
  history: history(entries),
  schedule,
});

test('empty history gives four labelled zero weeks; the newest bucket matches gainedThisWeek', () => {
  expect(weeklyGained([], at(25), 4)).toEqual([
    { weekStart: '2026-09-28', count: 0 },
    { weekStart: '2026-10-05', count: 0 },
    { weekStart: '2026-10-12', count: 0 },
    { weekStart: '2026-10-19', count: 0 },
  ]);
  expect(weeklyGained([testRow()], at(25), 4).map((week) => week.count)).toEqual([0, 0, 0, 0]);
});

test('hand-computed series: one attainment per word, lapse and reset counted once, boundaries by local date', () => {
  const rows = [
    row([[atSept(20), 21]]), // before the four weeks: nowhere
    row([[atSept(30), 21]]), // oldest week
    row([
      [at(10), 21], // first maturity in the second week
      [at(12), 0], // lapse
      [at(24), 30], // matures again: still one attainment, in the second week
    ]),
    row([[at(12), 21]], { ...testMatureSchedule(at(25)), phase: 'new', scheduledDays: 0 }), // reset keeps history
    row([[at(18, 23, 59), 21]]), // last instant of the third week
    row([[at(19, 0, 1), 21]]), // first instant of the newest week
    row([[at(25, 0, 1), 21]]), // just after local midnight today
    row([[at(26), 21]]), // tomorrow: outside the series
    row([[at(25), 20]]), // young review: never matured
  ];
  const series = weeklyGained(rows, at(25), 4);
  expect(series.map((week) => week.weekStart)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  expect(series.map((week) => week.count)).toEqual([1, 1, 2, 2]);
  // The same first-attainment rule as VG3, not a second implementation.
  expect(series[3].count).toBe(summarizeRhythm(rows, at(25)).gainedThisWeek);
  expect(weeklyGained(rows, at(25), 1)[0].count).toBe(summarizeRhythm(rows, at(25)).gainedThisWeek);
});

test('days left is calendar days: today, tomorrow, past and a month ahead', () => {
  expect(goalDaysLeft('2026-10-25', at(25))).toBe(0);
  expect(goalDaysLeft('2026-10-26', at(25))).toBe(1);
  expect(goalDaysLeft('2026-10-24', at(25))).toBe(-1);
  expect(goalDaysLeft('2026-11-24', at(25))).toBe(30);
});

test('daylight: week boundaries and days left cross the time changes by calendar day', async () => {
  // Bun caches timezone state across test files. Keep TZ changes out of the suite's other tests.
  if (!process.env.RELIRE_TEST_GOAL_TZ) {
    const child = Bun.spawn([process.execPath, 'test', import.meta.path, '-t', 'daylight'], {
      env: { ...process.env, RELIRE_TEST_GOAL_TZ: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(child.stderr).text();
    expect(await child.exited, output).toBe(0);
    return;
  }
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/Toronto';
    const afterSpringForward = new Date(2026, 2, 9, 0, 1).getTime();
    const series = weeklyGained(
      [
        row([[new Date(2026, 2, 2, 23, 59).getTime(), 21]]), // last instant before the newest week
        row([[new Date(2026, 2, 3, 0, 1).getTime(), 21]]), // first instant of the newest week
        row([[new Date(2026, 2, 8, 1, 30).getTime(), 21]]), // the spring-forward day, before the 02:00 jump
        row([[afterSpringForward, 21]]), // just after local midnight
      ],
      afterSpringForward,
      4,
    );
    expect(series.map((week) => week.weekStart)).toEqual(['2026-02-10', '2026-02-17', '2026-02-24', '2026-03-03']);
    expect(series.map((week) => week.count)).toEqual([0, 0, 1, 3]);
    // A 23-hour day must not shorten the count; straight 24-hour division would say 9.
    expect(goalDaysLeft('2026-03-16', new Date(2026, 2, 6, 12).getTime())).toBe(10);
    // Across fall-back the 25-hour day must not lengthen it either.
    expect(goalDaysLeft('2026-11-10', new Date(2026, 10, 1, 12).getTime())).toBe(9);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('the dialog boundary refuses a missing or past date and a non-positive or fractional target', () => {
  expect(parseGoalInput('2026-11-08', '120', at(25))).toEqual({
    ok: true,
    goal: { examDate: '2026-11-08', matureTarget: 120 },
  });
  expect(parseGoalInput('2026-10-25', '1', at(25)).ok).toBe(true); // today is allowed
  expect(parseGoalInput('', '5', at(25))).toEqual({ ok: false, error: 'missingDate' });
  expect(parseGoalInput('   ', '5', at(25))).toEqual({ ok: false, error: 'missingDate' });
  const past = parseGoalInput('2026-10-24', '5', at(25));
  expect(past).toEqual({ ok: false, error: 'pastDate' });
  for (const target of ['', '0', '-3', '2.5']) {
    expect(parseGoalInput('2026-11-08', target, at(25))).toEqual({ ok: false, error: 'invalidTarget' });
  }
});

test('settings round-trip the goal, keeping other settings and a date that has since passed', () => {
  expect(getAppSettings().vocabularyGoal).toBe(null);
  const goal: VocabularyGoal = { examDate: '2026-11-08', matureTarget: 120 };
  saveAppSettings({ practiceStrictAccents: true, vocabularyGoal: goal });
  expect(getAppSettings().vocabularyGoal).toEqual(goal);
  expect(getAppSettings().practiceStrictAccents).toBe(true);
  // Storage validates shape, not "past": a stored date turning past is a real state, not a dropped goal.
  const passed: VocabularyGoal = { examDate: '2026-10-24', matureTarget: 5 };
  saveAppSettings({ vocabularyGoal: passed });
  expect(getAppSettings().vocabularyGoal).toEqual(passed);
  saveAppSettings({ vocabularyGoal: null });
  expect(getAppSettings().vocabularyGoal).toBe(null);
});

test('the storage boundary rejects malformed goals', () => {
  for (const vocabularyGoal of [
    '2026-12-01',
    {},
    { examDate: '2026-12-01' },
    { matureTarget: 5 },
    { examDate: '2026-02-30', matureTarget: 5 },
    { examDate: '2026-12-01', matureTarget: 0 },
    { examDate: '2026-12-01', matureTarget: 2.5 },
    { examDate: '2026-12-01', matureTarget: 5, mode: 'strict' },
  ]) {
    localStorage.setItem('relire_app_settings_v1', JSON.stringify({ vocabularyGoal }));
    expect(getAppSettings().vocabularyGoal).toBe(null);
  }
});

test('export omits the goal and restore ignores an imported goal while keeping this device’s goal', () => {
  const goal: VocabularyGoal = { examDate: '2026-11-08', matureTarget: 120 };
  saveAppSettings({ vocabularyGoal: goal });
  const backup = exportSettingsBackup();
  expect(JSON.stringify(backup)).not.toContain('vocabularyGoal');
  restoreSettingsBackup({ ...backup, vocabularyGoal: { examDate: '2027-01-01', matureTarget: 9 } });
  expect(getAppSettings().vocabularyGoal).toEqual(goal);
  restoreSettingsBackup(backup);
  expect(getAppSettings().vocabularyGoal).toEqual(goal);
});
