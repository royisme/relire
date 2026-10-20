/** Controlled hook state/effect regression with real fresh IndexedDB transactions; no browser/timer simulation. */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { freshDb } from './fixtures/storage';
import { testAnalysis, testCandidate, testLookup } from './fixtures/vocabulary';
import { useVocabularyReview } from '../src/hooks/useVocabularyReview';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import {
  introduceVocabularyCard,
  readVocabulary,
  saveVocabularyBookmark,
  saveVocabularyPreferences,
} from '../src/storage/vocabulary';

beforeEach(freshDb);
test('a quota-losing reveal keeps the answer unmounted and still selects an available due card without retry', async () => {
  const now = Date.now();
  await saveVocabularyPreferences(1);
  for (const word of ['test-a', 'test-b'])
    await saveVocabularyBookmark(testLookup(word), testAnalysis(word), undefined, now);
  const model: VocabularyModel = {
    ...(await readVocabulary(now)),
    error: null,
    async refresh() {
      Object.assign(model, await readVocabulary(now));
    },
    savePreferences: saveVocabularyPreferences,
  };
  // Drive the hook's state and selection effect only. Wake/focus lifecycle is covered by Playwright.
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
  const settled = async () => {
    let result = render();
    for (let attempt = 0; attempt < 20 && !result.active; attempt++) {
      await Bun.sleep(1);
      result = render();
    }
    return result;
  };
  try {
    let session = await settled();
    expect(session.active?.candidate.key).toBe('test-a');
    // The second tab wins the last quota slot after this front was captured.
    await introduceVocabularyCard(testCandidate('test-b'), { epoch: 0, resetToken: 0, revision: 0 }, now);
    await session.reveal();
    session = await settled();
    expect(session.revealed).toBe(false);
    expect((await readVocabulary(now)).rows.find((row) => row.key === 'test-a')!.introducedAt).toBeNull();
    expect(session.active?.candidate.key).toBe('test-b');
    expect(session.error).toBeNull();
  } finally {
    selection.cleanup?.();
    effect.mockRestore();
    ref.mockRestore();
    state.mockRestore();
  }
});
