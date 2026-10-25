/**
 * The run's write seam: it drives `useVocabularyReview` exactly as the plain review does, so a card gets one
 * introduction and one rating carrying the learner's own outcome, a failed rating retries under its operation
 * id, and the staleness and quota paths advance without inventing writes. Real fresh IndexedDB transactions;
 * no browser or timer simulation (in the app the storage notification refreshes the model after every write;
 * these tests call the same refresh where the queue's next card matters).
 */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import type { EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { freshDb } from './fixtures/storage';
import { testCandidate, testDefinition, testLookup } from './fixtures/vocabulary';
import { useVocabularyReview } from '../src/hooks/useVocabularyReview';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { gradeChoice } from '../src/services/vocabulary/game/challenge';
const storage = await import('../src/storage/vocabulary');
const React = await import('react');
import '../src/i18n';
const { getVocabularySnapshot, readVocabulary, saveVocabularyBookmark, saveVocabularyPreferences } = storage;

beforeEach(freshDb);
async function reviewModel(words: string[], now: number): Promise<VocabularyModel> {
  for (const word of words) await saveVocabularyBookmark(testLookup(word), testDefinition(word), undefined, now);
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
  let effects: EffectCallback[] = [];
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

test('a run writes exactly one introduction and one rating per card, carrying the learner’s own outcome', async () => {
  const now = Date.now();
  const model = await reviewModel(['test-a', 'test-b', 'test-c'], now);
  const harness = reviewHarness(model);
  const introduced = spyOn(storage, 'introduceVocabularyCard');
  const rated = spyOn(storage, 'rateVocabularyCard');
  try {
    // Two cards, each the run's own way round: reveal (the challenge and its answer change nothing), then rate.
    let session = await harness.settled();
    expect(session.active?.candidate.key).toBe('test-a');
    await session.reveal();
    session = harness.render();
    expect(session.introductions).toBe(1);
    await session.recall('forgot');
    await model.refresh();
    session = await harness.settled();
    expect(session.active?.candidate.key).toBe('test-b');
    // Answering a retrieval challenge incorrectly writes nothing and does not affect the rating:
    const grade = gradeChoice({ kind: 'recognize', prompt: 'test-b', options: ['wrong', 'right'], answerIndex: 1 }, 0);
    expect(grade.correct).toBe(false);
    expect(introduced).toHaveBeenCalledTimes(1);
    expect(rated).toHaveBeenCalledTimes(1);
    // The learner reveals and rates 'remembered'; the self-rating is stored directly:
    await session.reveal();
    session = harness.render();
    await session.recall('remembered');
    await model.refresh();
    session = harness.render();
    expect(session.ratings).toBe(2);
    // Nothing else was written: one introduction and one rating per played card, and the third card untouched.
    expect(introduced).toHaveBeenCalledTimes(2);
    expect(rated).toHaveBeenCalledTimes(2);
    expect(rated.mock.calls.map((call) => call[3])).toEqual(['forgot', 'remembered']);
    const rows = (await readVocabulary(now)).rows;
    expect(rows.map((row) => row.history.map((record) => record.outcome))).toEqual([['forgot'], ['remembered'], []]);
    expect(rows[2]).toMatchObject({ introducedAt: null, schedule: null });
  } finally {
    rated.mockRestore();
    introduced.mockRestore();
    harness.dispose();
  }
});

test('a failed rating keeps the run’s operation id and outcome; the retry repeats the same operation once', async () => {
  const now = Date.now();
  const harness = reviewHarness(await reviewModel(['test-a'], now));
  const rate = storage.rateVocabularyCard;
  let failing = true;
  const attempts: { operationId: string; outcome: string }[] = [];
  const submit = spyOn(storage, 'rateVocabularyCard').mockImplementation(async (...args) => {
    attempts.push({ operationId: args[2], outcome: args[3] });
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
    expect(session.ratings).toBe(0);
    // A different outcome cannot replace the pending one, so nothing more is written.
    await session.recall('remembered');
    expect(attempts).toHaveLength(1);
    failing = false;
    const clock = spyOn(Date, 'now').mockReturnValue(now + 3_600_000);
    try {
      await session.recall('fuzzy');
    } finally {
      clock.mockRestore();
    }
    session = harness.render();
    expect(session.ratings).toBe(1);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect((await readVocabulary(now)).rows[0].history.map((record) => record.outcome)).toEqual(['fuzzy']);
  } finally {
    submit.mockRestore();
    harness.dispose();
  }
});

test('a rating against a card that changed underneath refreshes and advances with no write and no error', async () => {
  const now = Date.now();
  const model = await reviewModel(['test-a', 'test-b'], now);
  const harness = reviewHarness(model);
  try {
    let session = await harness.settled();
    await session.reveal();
    session = harness.render();
    // The card was rated out-of-band after the run loaded it: its revision moved under the pending rating.
    const snapshot = await getVocabularySnapshot('test-a');
    await storage.rateVocabularyCard('test-a', snapshot.tokens, 'out-of-band', 'remembered', now + 60_000);
    await session.recall('forgot');
    session = await harness.settled();
    expect(session.ratings).toBe(0);
    expect(session.error).toBeNull();
    expect(session.active?.candidate.key).toBe('test-b');
    // The run's own attempt was refused as stale: only the out-of-band rating exists in the card's history.
    const rows = (await readVocabulary(now)).rows;
    expect(rows[0].history.map((record) => record.outcome)).toEqual(['remembered']);
    expect(rows[0].history).toHaveLength(1);
    expect(rows[1]).toMatchObject({ introducedAt: null, schedule: null });
  } finally {
    harness.dispose();
  }
});

test('a quota-losing reveal keeps the card unmounted and reports the allowance without rating anything', async () => {
  const now = Date.now();
  await saveVocabularyPreferences({ newPerDay: 1, retentionPercent: 90 });
  const harness = reviewHarness(await reviewModel(['test-a', 'test-b'], now));
  const rated = spyOn(storage, 'rateVocabularyCard');
  try {
    let session = await harness.settled();
    expect(session.active?.candidate.key).toBe('test-a');
    await storage.introduceVocabularyCard(testCandidate('test-b'), { epoch: 0, resetToken: 0, revision: 0 }, now);
    await session.reveal();
    session = await harness.settled();
    expect(session.quotaReached).toBe(true);
    expect(session.error).toBeNull();
    expect((await readVocabulary(now)).rows.find((row) => row.key === 'test-a')!.introducedAt).toBeNull();
    expect(rated).toHaveBeenCalledTimes(0);
  } finally {
    rated.mockRestore();
    harness.dispose();
  }
});
