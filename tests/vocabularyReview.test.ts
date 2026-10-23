/** Controlled hook state/effect regression with real fresh IndexedDB transactions; no browser/timer simulation. */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { freshDb } from './fixtures/storage';
import { testAnalysis, testCandidate, testLookup } from './fixtures/vocabulary';
import { useVocabularyReview } from '../src/hooks/useVocabularyReview';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import * as storage from '../src/storage/vocabulary';
import '../src/i18n';
const { introduceVocabularyCard, readVocabulary, saveVocabularyBookmark, saveVocabularyPreferences } = storage;

beforeEach(freshDb);
async function reviewModel(words: string[], now: number): Promise<VocabularyModel> {
  for (const word of words) await saveVocabularyBookmark(testLookup(word), testAnalysis(word), undefined, now);
  const model: VocabularyModel = {
    ...(await readVocabulary(now)),
    error: null,
    ready: true,
    async refresh() {
      Object.assign(model, await readVocabulary(now));
    },
    savePreferences: saveVocabularyPreferences,
  };
  return model;
}
function reviewHarness(model: VocabularyModel) {
  // Drive the hook's state and selection effect only; do not install browser wake/focus listeners.
  const slots: unknown[] = [];
  let index = 0;
  let effects: React.EffectCallback[] = [];
  const selection: { cleanup?: () => void } = {};
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[slot],
      (next: unknown) => {
        slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;
      },
    ];
  }) as typeof React.useState);
  const ref = spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = { current: initial };
    return slots[slot];
  }) as typeof React.useRef);
  const effect = spyOn(React, 'useEffect').mockImplementation((callback) => {
    effects.push(callback);
  });
  let current!: ReturnType<typeof useVocabularyReview>;
  function Probe() {
    const session = useVocabularyReview(model);
    React.useEffect(() => {
      current = session;
    });
    return null;
  }
  const render = () => {
    selection.cleanup?.();
    index = 0;
    effects = [];
    renderToStaticMarkup(React.createElement(Probe));
    effects[2]();
    const dispose = effects[1]();
    selection.cleanup = typeof dispose === 'function' ? dispose : undefined;
    return current;
  };
  return {
    render,
    async settled() {
      let result = render();
      for (let attempt = 0; attempt < 20 && !result.active; attempt++) {
        await Bun.sleep(1);
        result = render();
      }
      return result;
    },
    dispose() {
      selection.cleanup?.();
      effect.mockRestore();
      ref.mockRestore();
      state.mockRestore();
    },
  };
}
test('a quota-losing reveal keeps the answer unmounted and still selects an available due card without retry', async () => {
  const now = Date.now();
  await saveVocabularyPreferences({ newPerDay: 1, retentionPercent: 90 });
  const harness = reviewHarness(await reviewModel(['test-a', 'test-b'], now));
  try {
    let session = await harness.settled();
    expect(session.active?.candidate.key).toBe('test-a');
    await introduceVocabularyCard(testCandidate('test-b'), { epoch: 0, resetToken: 0, revision: 0 }, now);
    await session.reveal();
    session = await harness.settled();
    expect(session.revealed).toBe(false);
    expect((await readVocabulary(now)).rows.find((row) => row.key === 'test-a')!.introducedAt).toBeNull();
    expect(session.active?.candidate.key).toBe('test-b');
    expect(session.error).toBeNull();
  } finally {
    harness.dispose();
  }
});
for (const [outcome, minutes] of [
  ['forgot', 1],
  ['fuzzy', 6],
  ['remembered', 10],
] as const) {
  test(`${outcome} commits a semantic observation; reveal and Skip never count as recall`, async () => {
    const now = Date.now();
    const harness = reviewHarness(await reviewModel(['test-a', 'test-b'], now));
    try {
      let session = await harness.settled();
      await session.recall(outcome);
      expect((await readVocabulary(now)).rows[0].history).toHaveLength(0);
      await session.reveal();
      session = harness.render();
      expect(session.introductions).toBe(1);
      expect(session.ratings).toBe(0);
      expect((await readVocabulary(now)).rows[0].history).toHaveLength(0);
      await session.recall(outcome);
      session = await harness.settled();
      expect(session.ratings).toBe(1);
      const record = (await readVocabulary(now)).rows[0].history[0];
      expect(record.outcome).toBe(outcome);
      expect(record.next).toMatchObject({
        phase: 'learning',
        learningSteps: outcome === 'remembered' ? 1 : 0,
        dueAt: record.reviewedAt + minutes * 60_000,
      });
      session.skip();
      session = harness.render();
      expect(session.ratings).toBe(1);
      expect((await readVocabulary(now)).rows[1]).toMatchObject({ introducedAt: null, schedule: null, history: [] });
    } finally {
      harness.dispose();
    }
  });
}
test('a repeated reveal and Skip after introduction keep one quota charge, New memory and no review history', async () => {
  const now = Date.now(),
    harness = reviewHarness(await reviewModel(['test-a'], now));
  try {
    let session = await harness.settled();
    await session.reveal();
    session = harness.render();
    const introduced = (await readVocabulary(now)).rows[0];
    expect(introduced.schedule).toMatchObject({ phase: 'new', repetitions: 0, lastReviewedAt: null });
    await session.reveal();
    session.skip();
    session = harness.render();
    expect(session.active).toBeNull();
    const saved = await readVocabulary(now);
    expect(saved.rows[0]).toEqual(introduced);
    expect(saved.rows[0].history).toHaveLength(0);
    expect(saved.day.introducedKeys).toEqual(['test-a']);
    expect(session.introductions).toBe(1);
    expect(session.ratings).toBe(0);
  } finally {
    harness.dispose();
  }
});

test('a backward clock clears the invalid pending observation and permits a fresh submission after correction', async () => {
  const now = Date.now();
  const first = await introduceVocabularyCard(
    testCandidate('test-a'),
    { epoch: 0, resetToken: 0, revision: 0 },
    now - 20 * 86400_000,
  );
  const one = await storage.rateVocabularyCard('test-a', first.tokens, 'prior-1', 'remembered', now - 20 * 86400_000);
  await storage.rateVocabularyCard('test-a', one.tokens, 'prior-2', 'remembered', now - 19 * 86400_000);
  const harness = reviewHarness(await reviewModel([], now));
  const rate = storage.rateVocabularyCard;
  const attempts: string[] = [];
  const submit = spyOn(storage, 'rateVocabularyCard').mockImplementation((...args) => {
    attempts.push(args[2]);
    return rate(...args);
  });
  try {
    let session = await harness.settled();
    await session.reveal();
    session = harness.render();
    const clock = spyOn(Date, 'now').mockReturnValue(now - 19 * 86400_000 - 1);
    try {
      await session.recall('fuzzy');
    } finally {
      clock.mockRestore();
    }
    session = harness.render();
    expect(session.error).toContain('Correct this device');
    expect(session.pending).toBeNull();
    expect(session.revealed).toBe(true);
    expect((await readVocabulary(now)).rows[0].history).toHaveLength(2);
    await session.recall('remembered');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).not.toBe(attempts[0]);
    expect((await readVocabulary(now)).rows[0].history).toHaveLength(3);
    expect(harness.render().ratings).toBe(1);
  } finally {
    submit.mockRestore();
    harness.dispose();
  }
});

test('failed Fuzzy retains its immutable rating and operation id; alternatives and Skip cannot replace it', async () => {
  const now = Date.now();
  const harness = reviewHarness(await reviewModel(['test-a'], now));
  const rate = storage.rateVocabularyCard;
  let failing = true;
  const attempts: { operationId: string; outcome: string; reviewedAt: number }[] = [];
  const submit = spyOn(storage, 'rateVocabularyCard').mockImplementation(async (...args) => {
    attempts.push({ operationId: args[2], outcome: args[3], reviewedAt: args[4] });
    if (failing) throw new Error('TEST rating disk refused');
    return rate(...args);
  });
  try {
    let session = await harness.settled();
    await session.reveal();
    session = harness.render();
    await session.recall('fuzzy');
    session = harness.render();
    expect(session.pending).toEqual({ outcome: 'fuzzy' });
    expect(session.error).toBe('TEST rating disk refused');
    expect(session.ratings).toBe(0);
    expect((await readVocabulary(now)).rows[0].history).toHaveLength(0);
    await session.recall('forgot');
    await session.recall('remembered');
    session.skip();
    session = harness.render();
    expect(attempts).toHaveLength(1);
    expect(session.active?.candidate.key).toBe('test-a');
    expect(session.revealed).toBe(true);
    failing = false;
    const clock = spyOn(Date, 'now').mockReturnValue(now + 3600_000);
    try {
      await session.recall('fuzzy');
    } finally {
      clock.mockRestore();
    }
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0].outcome).toBe('fuzzy');
    expect((await readVocabulary(now)).rows[0].history.map((record) => record.outcome)).toEqual(['fuzzy']);
    expect(harness.render().ratings).toBe(1);
  } finally {
    submit.mockRestore();
    harness.dispose();
  }
});
