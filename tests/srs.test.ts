/** Pinned FSRS-6 parity, semantic grades and explicit instant/local-day policy; no storage or browser. */
import { expect, test } from 'bun:test';
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  date_diff,
  dateDiffInDays,
  FSRSVersion,
  type Card,
} from 'ts-fsrs';
import { VocabularyScheduleSchema, type VocabularyOutcome, type VocabularySchedule } from '../src/types/vocabulary';
import {
  formatAvailableAt,
  formatDate,
  initialVocabularySchedule,
  nextVocabularySchedule,
  vocabularyDue,
  vocabularyAvailableAt,
  VocabularyClockError,
} from '../src/utils/srs';
import { testMatureSchedule } from './fixtures/vocabulary';
const now = new Date('2026-10-20T12:00:00.123Z').getTime();
const preferences = { newPerDay: 20, retentionPercent: 90 };
const outcomes = ['forgot', 'fuzzy', 'remembered'] as const;
const grades = { forgot: Rating.Again, fuzzy: Rating.Hard, remembered: Rating.Good } as const;
const phases = ['new', 'learning', 'review', 'relearning'] as const;
function libraryCard(s: VocabularySchedule): Card {
  return {
    state: phases.indexOf(s.phase),
    due: new Date(s.dueAt),
    ...(s.lastReviewedAt === null ? {} : { last_review: new Date(s.lastReviewedAt) }),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.repetitions,
    lapses: s.lapses,
  };
}
function saved(card: Card): VocabularySchedule {
  return {
    phase: phases[card.state],
    dueAt: card.due.getTime(),
    lastReviewedAt: card.last_review?.getTime() ?? null,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    repetitions: card.reps,
    lapses: card.lapses,
  };
}
test('published 5.4.2 FSRS-6 defaults are exactly policy1; introduction is New with no observation', () => {
  expect(FSRSVersion).toBe('v5.4.2 using FSRS-6.0');
  const params = generatorParameters();
  expect(params).toMatchObject({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  });
  expect(params.w).toHaveLength(21);
  const fresh = initialVocabularySchedule(now);
  expect(fresh).toEqual(saved(createEmptyCard(new Date(now))));
  expect(fresh).toMatchObject({
    phase: 'new',
    repetitions: 0,
    lapses: 0,
    lastReviewedAt: null,
    stability: 0,
    difficulty: 0,
  });
  expect(VocabularyScheduleSchema.safeParse(fresh).success).toBe(true);
});
test('all phases and semantic outcomes match library next, deterministically without mutating inputs', () => {
  const fresh = initialVocabularySchedule(now);
  const learning = nextVocabularySchedule(fresh, 'remembered', now, preferences);
  const learning0 = nextVocabularySchedule(fresh, 'fuzzy', now, preferences);
  const mature = testMatureSchedule(now);
  const relearning = nextVocabularySchedule(mature, 'forgot', now, preferences);
  expect(relearning.phase).toBe('relearning');
  expect(relearning.lapses).toBe(mature.lapses + 1);
  for (const prior of [fresh, learning0, learning, mature, relearning]) {
    const before = structuredClone({ prior, preferences });
    for (const outcome of outcomes) {
      const reviewedAt = now + 10 * 60_000;
      const expected = fsrs({ request_retention: 0.9, enable_fuzz: false }).next(
        libraryCard(prior),
        new Date(reviewedAt),
        grades[outcome],
      );
      const next = nextVocabularySchedule(prior, outcome, reviewedAt, preferences);
      expect(next).toEqual(saved(expected.card));
      expect(next).toEqual(nextVocabularySchedule(prior, outcome, reviewedAt, preferences));
      expect(next.lastReviewedAt).toBe(reviewedAt);
      expect(next.repetitions).toBe(prior.repetitions + 1);
      expect(VocabularyScheduleSchema.safeParse(JSON.parse(JSON.stringify(next))).success).toBe(true);
    }
    expect({ prior, preferences }).toEqual(before);
  }
});
test('first three grades really wait 1/6/10 minutes; an introduced New is immediately due', () => {
  const fresh = initialVocabularySchedule(now);
  expect(vocabularyDue(fresh, now)).toBe(true);
  for (const [index, outcome] of outcomes.entries()) {
    const next = nextVocabularySchedule(fresh, outcome, now, preferences);
    expect(next).toMatchObject({
      phase: 'learning',
      dueAt: now + [1, 6, 10][index] * 60_000,
      learningSteps: outcome === 'remembered' ? 1 : 0,
      scheduledDays: 0,
      repetitions: 1,
    });
    expect(vocabularyDue(next, next.dueAt - 1)).toBe(false);
    expect(vocabularyDue(next, next.dueAt)).toBe(true);
  }
});
test('higher retention shortens the mature interval; changed preferences never mutate an existing due date', () => {
  const prior = testMatureSchedule(now);
  const before = structuredClone(prior);
  const results = [85, 90, 95].map((retentionPercent) =>
    nextVocabularySchedule(prior, 'remembered', now, { ...preferences, retentionPercent }),
  );
  expect(results.map((s) => s.scheduledDays)).toEqual([113, 59, 24]);
  expect(prior).toEqual(before);
});
test('preserve published cap-edge output rather than adding an application clamp or rejecting valid model facts', () => {
  const prior = { ...testMatureSchedule(now), stability: 36500, difficulty: 1, scheduledDays: 36500 };
  for (const outcome of outcomes) {
    const expected = fsrs().next(libraryCard(prior), new Date(now), grades[outcome]).card;
    expect(nextVocabularySchedule(prior, outcome, now, preferences)).toEqual(saved(expected));
  }
});

test('actual instants reach published next: its UTC-day difference differs from the elapsed-ms date_diff utility', () => {
  const prior = testMatureSchedule(now);
  for (const elapsed of [23 * 3600_000, 25 * 3600_000, 30 * 86400_000]) {
    const reviewedAt = prior.lastReviewedAt! + elapsed;
    const result = nextVocabularySchedule(prior, 'remembered', reviewedAt, preferences);
    expect(date_diff(new Date(reviewedAt), new Date(prior.lastReviewedAt!), 'days')).toBe(
      Math.floor(elapsed / 86400_000),
    );
    expect(result.elapsedDays).toBe(dateDiffInDays(new Date(prior.lastReviewedAt!), new Date(reviewedAt)));
    expect(result).toEqual(saved(fsrs().next(libraryCard(prior), new Date(reviewedAt), Rating.Good).card));
  }
});
test('one minute across UTC midnight can change the next interval by more than one day with pinned library parity', () => {
  const before = Date.parse('2026-10-20T23:59:30Z');
  const after = before + 60_000;
  const prior = { ...testMatureSchedule(before), lastReviewedAt: Date.parse('2026-10-20T12:00:00Z') };
  const results = [before, after].map((reviewedAt) => {
    const next = nextVocabularySchedule(prior, 'remembered', reviewedAt, preferences);
    expect(date_diff(new Date(reviewedAt), new Date(prior.lastReviewedAt), 'days')).toBe(0);
    expect(next).toEqual(saved(fsrs().next(libraryCard(prior), new Date(reviewedAt), Rating.Good).card));
    expect(next.lastReviewedAt).toBe(reviewedAt);
    return next;
  });
  expect(results.map((next) => next.elapsedDays)).toEqual([0, 1]);
  expect(results.map((next) => next.scheduledDays)).toEqual([21, 23]);
  expect(results[1].scheduledDays - results[0].scheduledDays).toBeGreaterThan(1);
});
test('local Review day is available before its time; intraday phases require the exact instant across DST/timezones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/Toronto', 'Europe/Paris', 'Asia/Shanghai']) {
      process.env.TZ = zone;
      for (const [month, day] of [
        [2, 8],
        [10, 1],
      ]) {
        const dueAt = new Date(2026, month, day, 18).getTime();
        const midnight = new Date(2026, month, day).getTime();
        const review = { ...testMatureSchedule(dueAt), dueAt };
        expect(vocabularyAvailableAt(review)).toBe(midnight);
        expect(vocabularyDue(review, midnight - 1)).toBe(false);
        expect(vocabularyDue(review, midnight)).toBe(true);
        expect(vocabularyDue(review, dueAt)).toBe(true);
        for (const phase of ['new', 'learning', 'relearning'] as const) {
          const schedule = phase === 'new' ? initialVocabularySchedule(dueAt) : { ...review, phase };
          expect(vocabularyAvailableAt(schedule)).toBe(dueAt);
          expect(vocabularyDue(schedule, dueAt - 1)).toBe(false);
          expect(vocabularyDue(schedule, dueAt)).toBe(true);
        }
      }
    }
    process.env.TZ = 'America/Toronto';
    for (const [month, day, hours] of [
      [2, 7, 23],
      [9, 31, 25],
    ]) {
      const last = new Date(2026, month, day, 12).getTime();
      const time = new Date(2026, month, day + 1, 12).getTime();
      expect(time - last).toBe(hours * 3600_000);
      const prior = { ...testMatureSchedule(time), lastReviewedAt: last };
      expect(date_diff(new Date(time), new Date(last), 'days')).toBe(Math.floor(hours / 24));
      expect(nextVocabularySchedule(prior, 'fuzzy', time, preferences).elapsedDays).toBe(
        dateDiffInDays(new Date(last), new Date(time)),
      );
    }
    const instant = new Date('2026-10-20T00:30:00Z').getTime();
    const review = { ...testMatureSchedule(instant), dueAt: instant };
    process.env.TZ = 'America/Toronto';
    expect(formatDate(new Date(review.dueAt))).toBe('2026-10-19');
    process.env.TZ = 'Asia/Shanghai';
    expect(formatDate(new Date(review.dueAt))).toBe('2026-10-20');
    expect(review.dueAt).toBe(instant);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  expect(vocabularyDue(null, now)).toBe(false);
});
test('a review due tomorrow at 15:00 becomes available at local midnight, exactly when vocabularyDue changes', () => {
  const today = new Date(2026, 9, 24, 12, 30).getTime();
  const dueAt = new Date(2026, 9, 25, 15).getTime();
  const midnight = new Date(2026, 9, 25).getTime();
  const schedule = testMatureSchedule(dueAt);
  const before = structuredClone(schedule);
  expect(vocabularyAvailableAt(schedule)).toBe(midnight);
  expect(vocabularyDue(schedule, today)).toBe(false);
  expect(vocabularyDue(schedule, midnight - 1)).toBe(false);
  expect(vocabularyDue(schedule, midnight)).toBe(true);
  expect(vocabularyDue(schedule, new Date(2026, 9, 25, 10).getTime())).toBe(true);
  expect(schedule).toEqual(before);
});

test.each(['new', 'learning', 'relearning'] as const)(
  '%s becomes available at exact dueAt, not local midnight',
  (phase) => {
    const dueAt = new Date(2026, 9, 25, 10, 15, 30, 123).getTime();
    const schedule = { ...initialVocabularySchedule(dueAt), phase };
    expect(vocabularyAvailableAt(schedule)).toBe(dueAt);
    expect(vocabularyDue(schedule, new Date(2026, 9, 25).getTime())).toBe(false);
    expect(vocabularyDue(schedule, dueAt - 1)).toBe(false);
    expect(vocabularyDue(schedule, dueAt)).toBe(true);
  },
);

test('available-at times show the date alone at local midnight and the date with a short time otherwise', () => {
  const midnight = new Date(2026, 9, 26, 0, 0, 0, 0).getTime();
  const justAfter = new Date(2026, 9, 26, 0, 0, 0, 1).getTime();
  const afternoon = new Date(2026, 9, 26, 15, 0).getTime();
  const dateOnly = (language: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(midnight);
  const withTime = (language: string, time: number) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(time);
  for (const language of ['en', 'zh']) {
    expect(formatAvailableAt(midnight, language)).toBe(dateOnly(language));
    // Date only means no time part at all: no clock digits, no AM/PM and no Chinese day-half marker.
    expect(dateOnly(language)).not.toContain(':');
    expect(dateOnly(language)).not.toMatch(/AM|PM|\u4e0a\u5348|\u4e0b\u5348/);
    for (const time of [justAfter, afternoon]) {
      expect(formatAvailableAt(time, language)).toBe(withTime(language, time));
      expect(withTime(language, time)).toContain(dateOnly(language));
      expect(withTime(language, time)).toMatch(/\d:\d\d/);
    }
  }
});

test('one instant is local midnight in one timezone and midday in another', async () => {
  // Bun caches timezone state across test files. Keep TZ changes out of the suite's other tests.
  if (!process.env.RELIRE_TEST_SRS_TZ) {
    const child = Bun.spawn([process.execPath, 'test', import.meta.path, '-t', 'one instant is local midnight'], {
      env: { ...process.env, RELIRE_TEST_SRS_TZ: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(child.stderr).text();
    expect(await child.exited, output).toBe(0);
    return;
  }
  const original = process.env.TZ;
  try {
    // 2026-10-26 04:00 UTC is Toronto's (EDT, UTC-4) local midnight and Shanghai's (UTC+8) midday.
    const instant = Date.UTC(2026, 9, 26, 4);
    process.env.TZ = 'America/Toronto';
    expect(formatAvailableAt(instant, 'en')).toBe(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(instant),
    );
    expect(formatAvailableAt(instant, 'zh')).toBe(
      new Intl.DateTimeFormat('zh', { dateStyle: 'medium' }).format(instant),
    );
    process.env.TZ = 'Asia/Shanghai';
    const shortTime = { dateStyle: 'medium', timeStyle: 'short' } as const;
    expect(formatAvailableAt(instant, 'en')).toBe(new Intl.DateTimeFormat('en', shortTime).format(instant));
    expect(formatAvailableAt(instant, 'zh')).toBe(new Intl.DateTimeFormat('zh', shortTime).format(instant));
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('bad inputs and backward clocks fail instead of forging elapsed time or accepting q codes', () => {
  const prior = testMatureSchedule(now);
  for (const time of [NaN, Infinity, -1, now + 0.5, 8_640_000_000_000_001, prior.lastReviewedAt! - 1])
    expect(() => nextVocabularySchedule(prior, 'remembered', time, preferences)).toThrow(VocabularyClockError);
  for (const outcome of [1, 3, 4, 5, 'easy', 'Good'])
    expect(() => nextVocabularySchedule(prior, outcome as VocabularyOutcome, now, preferences)).toThrow();
  expect(() => nextVocabularySchedule(prior, 'remembered', now, { ...preferences, retentionPercent: 96 })).toThrow();
  expect(() => nextVocabularySchedule({ ...prior, stability: NaN }, 'remembered', now, preferences)).toThrow();
});
