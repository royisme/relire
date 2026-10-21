/** Controlled hook state/effect regression with real fresh IndexedDB transactions; no browser/timer simulation. */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { freshDb } from './fixtures/storage';
import { testAnalysis, testCandidate, testLookup } from './fixtures/vocabulary';
import { useVocabularyReview } from '../src/hooks/useVocabularyReview';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import * as storage from '../src/storage/vocabulary';
const { introduceVocabularyCard, readVocabulary, saveVocabularyBookmark, saveVocabularyPreferences } = storage;

beforeEach(freshDb);
async function reviewModel(words: string[], now: number): Promise<VocabularyModel> {
  for (const word of words) await saveVocabularyBookmark(testLookup(word), testAnalysis(word), undefined, now);
  const model: VocabularyModel = {
    ...(await readVocabulary(now)),
    error: null,
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
  await saveVocabularyPreferences(1);
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
for (const [outcome, rating] of [
  ['forgot', 1],
  ['fuzzy', 3],
  ['remembered', 4],
] as const) {
  test(`${outcome} commits rating ${rating}; reveal and Skip never count as recall`, async () => {
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
      expect(record.rating).toBe(rating);
      expect(record.next).toMatchObject({
        phase: 'learning',
        step: rating === 4 ? 1 : 0,
        dueAt: record.timestamp + (rating === 1 ? 1 : rating === 3 ? 6 : 10) * 60_000,
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
test('failed Fuzzy retains its immutable rating and operation id; alternatives and Skip cannot replace it', async () => {
  const now = Date.now();
  const harness = reviewHarness(await reviewModel(['test-a'], now));
  const rate = storage.rateVocabularyCard;
  let failing = true;
  const attempts: { operationId: string; rating: number }[] = [];
  const submit = spyOn(storage, 'rateVocabularyCard').mockImplementation(async (...args) => {
    attempts.push({ operationId: args[2], rating: args[3] });
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
    await session.recall('fuzzy');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0].rating).toBe(3);
    expect((await readVocabulary(now)).rows[0].history.map((record) => record.rating)).toEqual([3]);
    expect(harness.render().ratings).toBe(1);
  } finally {
    submit.mockRestore();
    harness.dispose();
  }
});
