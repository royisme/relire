/** Hand-computed activity and first attainment, including retained history after lapses and resets. */
import { expect, test } from 'bun:test';
import type { VocabularyRow, VocabularySchedule } from '../src/types/vocabulary';
import { summarizeRhythm } from '../src/services/vocabulary/game/rhythm';
import { testMatureSchedule, testRow } from './fixtures/vocabulary';

const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
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
const row = (entries: [number, number][], schedule: VocabularySchedule | null = null): VocabularyRow => ({
  ...testRow(),
  history: history(entries),
  schedule,
});

test('empty history has seven unmarked days, real zero counts and no streak or loss state', () => {
  const result = summarizeRhythm([], at(25));
  expect(result).toEqual({
    days: ['19', '20', '21', '22', '23', '24', '25'].map((day) => ({ date: `2026-10-${day}`, rated: false })),
    ratedDays: 0,
    now: { review: 0, mature: 0 },
    gainedThisWeek: 0,
  });
  expect(Object.keys(result).sort()).toEqual(['days', 'gainedThisWeek', 'now', 'ratedDays']);
  expect(Object.keys(result.now).sort()).toEqual(['mature', 'review']);
  expect(Object.keys(result.days[0]).sort()).toEqual(['date', 'rated']);
  expect(summarizeRhythm([testRow()], at(25))).toEqual(result);
});

test('one day with multiple ratings counts once; gaps and out-of-period dates stay unmarked', () => {
  expect(
    summarizeRhythm(
      [
        row([
          [at(21), 1],
          [at(21, 18), 3],
        ]),
      ],
      at(25),
    ).ratedDays,
  ).toBe(1);
  const result = summarizeRhythm(
    [
      row([
        [at(18), 21],
        [at(19), 22],
        [at(21), 23],
        [at(21, 18), 24],
        [at(26), 25],
      ]),
      row([
        [at(23), 21],
        [at(25), 22],
      ]),
    ],
    at(25),
  );
  expect(result.days.map((day) => day.rated)).toEqual([true, false, true, false, true, false, true]);
  expect(result.ratedDays).toBe(4);
  // The first row first matured before the period; its later ratings do not earn another attainment.
  expect(result.gainedThisWeek).toBe(1);
});

test('now reads current schedules, while first maturity survives a lapse, re-maturing and a schedule reset', () => {
  const mature = { ...testMatureSchedule(at(25)), scheduledDays: 21 };
  const result = summarizeRhythm(
    [
      row(
        [
          [at(18), 21],
          [at(20), 0],
          [at(24), 30],
        ],
        mature,
      ), // re-matured, first outside week
      row(
        [
          [at(19), 21],
          [at(20), 0],
          [at(24), 30],
        ],
        mature,
      ), // first in week, counted once
      row([[at(21), 21]], { ...mature, phase: 'new', scheduledDays: 0 }), // reset keeps history
      row(
        [
          [at(22), 21],
          [at(24), 0],
        ],
        { ...mature, phase: 'relearning', scheduledDays: 0 },
      ),
      row([[at(25), 20]], { ...mature, scheduledDays: 20 }), // young review, not mature
      testRow(),
    ],
    at(25),
  );
  expect(result.now).toEqual({ review: 3, mature: 2 });
  expect(result.gainedThisWeek).toBe(3);
  expect(result.ratedDays).toBe(6); // 19, 20, 21, 22, 24, 25
});

test('local midnight and a DST-change week use calendar days, also when the device timezone changes', async () => {
  // Bun caches timezone state across test files. Keep TZ changes out of the suite's scheduler tests.
  if (!process.env.RELIRE_TEST_RHYTHM_TZ) {
    const child = Bun.spawn([process.execPath, 'test', import.meta.path, '-t', 'local midnight'], {
      env: { ...process.env, RELIRE_TEST_RHYTHM_TZ: '1' },
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
    const midnight = new Date(2026, 2, 9, 0, 1).getTime();
    const result = summarizeRhythm(
      [
        row([
          [new Date(2026, 2, 2, 23, 59).getTime(), 21], // before the seven-day window
          [new Date(2026, 2, 3, 0, 1).getTime(), 22],
          [new Date(2026, 2, 8, 0, 1).getTime(), 23], // before spring-forward
          [midnight, 24], // just after local midnight, not the previous day
        ]),
      ],
      midnight,
    );
    expect(result.days.map((day) => day.date)).toEqual([
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);
    expect(result.days.map((day) => day.rated)).toEqual([true, false, false, false, false, true, true]);
    expect(result.ratedDays).toBe(3);
    expect(result.gainedThisWeek).toBe(0);
    const firstAfterMidnight = summarizeRhythm([row([[midnight, 21]])], midnight);
    expect(firstAfterMidnight.days.at(-1)).toEqual({ date: '2026-03-09', rated: true });
    expect(firstAfterMidnight.gainedThisWeek).toBe(1);
    const fall = summarizeRhythm([], new Date(2026, 10, 3, 0, 1).getTime());
    expect(fall.days.map((day) => day.date)).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    // Like the queue, timestamps are interpreted in the device's current local timezone, not UTC.
    const travel = row([[Date.parse('2026-03-09T03:01:00Z'), 21]]);
    expect(summarizeRhythm([travel], midnight).days.at(-2)?.rated).toBe(true);
    process.env.TZ = 'Asia/Shanghai';
    expect(summarizeRhythm([travel], midnight).days.at(-1)?.rated).toBe(true);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
