import { expect, spyOn, test } from 'bun:test';
import type { EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useRunLog } from '../src/components/vocabulary/game/useRunLog';
import type { RunChunk } from '../src/components/vocabulary/game/runModel';
import { getAppSettings } from '../src/utils/appSettings';
import { freshSettingsStorage, restoreSettingsStorage } from './fixtures/contentServiceSettings';

const React = await import('react');
const now = new Date(2026, 9, 25, 12).getTime();

function logHarness() {
  freshSettingsStorage();
  const refs: unknown[] = [];
  let index = 0;
  const effects: { callback: EffectCallback; mount: boolean }[] = [];
  let dispose: (() => void) | undefined;
  const ref = spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const slot = index++;
    if (!(slot in refs)) refs[slot] = { current: initial };
    return refs[slot];
  }) as typeof React.useRef);
  const effect = spyOn(React, 'useEffect').mockImplementation((callback, dependencies) => {
    effects.push({ callback, mount: dependencies?.length === 0 });
  });
  function Probe({ chunk, ratings, empty }: { chunk: RunChunk; ratings: number; empty: boolean }) {
    useRunLog(chunk, ratings, now, empty);
    return null;
  }
  return {
    paint(chunk: RunChunk, ratings: number, empty = false) {
      index = 0;
      effects.length = 0;
      renderToStaticMarkup(<Probe chunk={chunk} ratings={ratings} empty={empty} />);
      for (const entry of effects) {
        if (!entry.mount) {
          entry.callback();
          entry.callback();
          continue;
        }
        if (!dispose) {
          const cleanup = entry.callback();
          if (typeof cleanup === 'function') dispose = cleanup;
        }
      }
    },
    unmount() {
      dispose?.();
    },
    close() {
      effect.mockRestore();
      ref.mockRestore();
      restoreSettingsStorage();
    },
  };
}

test('short cleared queues log only new ratings; unmount/replayed effects do not duplicate them', () => {
  const harness = logHarness();
  try {
    const chunk = { size: 20 as const, baseline: 0 };
    harness.paint(chunk, 0, true);
    expect(getAppSettings().vocabularyRunLog).toEqual([]);
    harness.paint(chunk, 2);
    expect(getAppSettings().vocabularyRunLog).toEqual([]);
    harness.paint(chunk, 3, true);
    harness.paint(chunk, 3, true);
    harness.unmount();
    expect(getAppSettings().vocabularyRunLog).toEqual([
      { date: '2026-10-25', mode: 'game', chunkSize: 20, ratings: 3 },
    ]);
  } finally {
    harness.close();
  }
});

test('leaving an unfinished run logs its partial ratings with the selected chunk size', () => {
  const harness = logHarness();
  try {
    harness.paint({ size: 10, baseline: 0 }, 4);
    expect(getAppSettings().vocabularyRunLog).toEqual([]);
    harness.unmount();
    expect(getAppSettings().vocabularyRunLog).toEqual([
      { date: '2026-10-25', mode: 'game', chunkSize: 10, ratings: 4 },
    ]);
  } finally {
    harness.close();
  }
});

test('finishing five then changing to twenty without Continue records subsequent ratings, not the first five twice', () => {
  const harness = logHarness();
  try {
    harness.paint({ size: 5, baseline: 0 }, 5);
    harness.paint({ size: 20, baseline: 0 }, 5);
    harness.paint({ size: 20, baseline: 0 }, 20);
    harness.unmount();
    expect(getAppSettings().vocabularyRunLog.map(({ chunkSize, ratings }) => ({ chunkSize, ratings }))).toEqual([
      { chunkSize: 5, ratings: 5 },
      { chunkSize: 20, ratings: 15 },
    ]);
  } finally {
    harness.close();
  }
});

test('a mid-run size change flushes the old size; Continue starts a fresh logging baseline', () => {
  const harness = logHarness();
  try {
    harness.paint({ size: 20, baseline: 0 }, 3);
    harness.paint({ size: 5, baseline: 0 }, 3);
    harness.paint({ size: 5, baseline: 0 }, 5);
    harness.paint({ size: 5, baseline: 5 }, 5);
    harness.paint({ size: 5, baseline: 5 }, 7);
    harness.unmount();
    expect(getAppSettings().vocabularyRunLog.map(({ chunkSize, ratings }) => ({ chunkSize, ratings }))).toEqual([
      { chunkSize: 20, ratings: 3 },
      { chunkSize: 5, ratings: 2 },
      { chunkSize: 5, ratings: 2 },
    ]);
  } finally {
    harness.close();
  }
});
