/**
 * The Conjugation page's drills drawn in place: a tense's practice button exists only where that tense has a cell
 * that can be asked and calls its handler, and a saved unit is drawn by the real `UnitSheet` inside the bordered
 * region with the link to its set in Practice. Static composition only; no browser geometry or e2e.
 */
import { afterAll, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import * as translations from 'react-i18next';
import i18n from '../src/i18n';
import type { ExerciseUnit } from '../src/types/exercises';
import type { Tense } from '../src/types/grammarPack';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    location: { hash: '' },
    relireHistory: { read: () => 0 },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'TEST' },
  }),
});
const { TenseSection } = await import('../src/components/study/grammar/TenseSection');
const { ConjugationPractice } = await import('../src/components/study/grammar/ConjugationPractice');
const unitHook = await import('../src/hooks/useExerciseUnit');
const saverHook = await import('../src/hooks/useUnitSaver');
const packHook = await import('../src/hooks/useGrammarPack');
const storage = await import('../src/storage/exercises');
const { emptyItems, sheetProgress } = await import('../src/hooks/exerciseUnit/model');
const { verifyAnswer, verifyPackVerb } = await import('../src/services/conjugation/verify');
const { GOLDEN } = await import('./fixtures/grammarPackGolden');
const { parlerAnswer } = await import('./fixtures/conjugationAnswer');
const { unitOf } = await import('./fixtures/units');
afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

/** Static rendering has no server snapshot for the speech and viewport stores. */
const render = (node: ReactNode) => {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    useStore(subscribe, snapshot, server ?? snapshot),
  );
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    store.mockRestore();
  }
};

/** Whether a control's own children include this text (a button holds its spinner slot and its label). */
const hasLabel = (element: ReactElement<Record<string, unknown>>, label: string) =>
  React.Children.toArray(element.props.children as ReactNode).includes(label);

/** Every element in a component's tree, so a button can be found and pressed without a browser. */
function elements(tree: ReactNode) {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (node: ReactNode) => {
    if (!React.isValidElement<Record<string, unknown>>(node)) return;
    found.push(node);
    React.Children.forEach(node.props.children as ReactNode, visit);
  };
  visit(tree);
  return found;
}

const packVerb = verifyPackVerb({
  ...GOLDEN.aller,
  prov: {
    origin: 'human',
    checkedAgainst: ['human'],
    status: 'reviewed',
    checkedAt: '2026-10-18',
    reviewedBy: 'TEST ONLY',
  },
});

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The tense of every saved unit, in the order the saves happened. */
const tensesOf = (units: ExerciseUnit[]) =>
  units.map((unit) => String((unit.items[0].meta as { tense?: string } | undefined)?.tense));

/** Renders the practice region with stepped hooks, so its saver runs outside a renderer. */
function steppedPractice() {
  const slots: unknown[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [
      slots[index],
      (next: unknown) => {
        slots[index] = typeof next === 'function' ? (next as (current: unknown) => unknown)(slots[index]) : next;
      },
    ];
  }) as typeof React.useState);
  const ref = spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    return (slots[index] ??= { current: initial });
  }) as typeof React.useRef);
  const effect = spyOn(React, 'useEffect').mockImplementation((next) => {
    effects.push(next);
  });
  const restore = [state, ref, effect];
  const render = () => {
    cursor = 0;
    const tree = ConjugationPractice({
      result: { verb: packVerb },
      onWord: () => {},
      onMissingKey: () => {},
    }) as ReactElement;
    const pending = effects;
    effects = [];
    pending.forEach((run) => run());
    return tree as ReactNode;
  };
  return { render, restore };
}

test('a press after a failed save makes the tense that was pressed, not the retained batch', async () => {
  const saves: string[][] = [];
  const save = spyOn(storage, 'saveUnits').mockImplementation((async (units: ExerciseUnit[]) => {
    saves.push(tensesOf(units));
    if (saves.length === 1) throw new Error('TEST storage down');
    return units;
  }) as typeof storage.saveUnits);
  const pack = spyOn(packHook, 'useGrammarPack').mockReturnValue({ status: 'loading' } as never);
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: (key: string, options?: Record<string, unknown>) => i18n.t(key, options as never),
  } as never);
  const { render, restore } = steppedPractice();
  try {
    const press = (tree: ReactNode, tense: Tense) => {
      const result = elements(tree).find((element) => typeof element.props.onPractiseTense === 'function');
      (result!.props.onPractiseTense as (tense: Tense) => void)(tense);
    };
    press(render(), 'present');
    for (let i = 0; i < 100 && saves.length < 1; i++) await tick();
    await tick();
    // The real error is on screen, and the failed batch is still held by the saver.
    const failed = render();
    expect(elements(failed).find((element) => element.props.role === 'alert')?.props.children).toBe(
      'TEST storage down',
    );

    press(failed, 'imparfait');
    for (let i = 0; i < 100 && saves.length < 2; i++) await tick();
    expect(saves).toEqual([['present'], ['imparfait']]);
  } finally {
    save.mockRestore();
    pack.mockRestore();
    translation.mockRestore();
    restore.forEach((spy) => spy.mockRestore());
  }
});

test('a tense practice button renders only for a gradable tense and calls its handler', () => {
  const label = i18n.t('conjugation.page.practiseTense');
  const noop = () => {};
  expect(render(<TenseSection tense="present" verb={packVerb} onPractise={noop} />)).toContain(label);
  // The AI's compound tenses have no gradable cell, so their section offers no drill.
  const aiOnly = verifyAnswer(parlerAnswer());
  expect(render(<TenseSection tense="plusQueParfait" verb={aiOnly} onPractise={noop} />)).not.toContain(label);
  expect(render(<TenseSection tense="present" verb={aiOnly} onPractise={noop} />)).toContain(label);
  // No handler, no button: the word sheet's table form shows none.
  expect(render(<TenseSection tense="present" verb={packVerb} />)).not.toContain(label);

  // Pressed without a renderer, so the hook the section needs comes from the stub.
  const t = spyOn(translations, 'useTranslation').mockReturnValue({ t: (key: string) => key } as never);
  try {
    let calls = 0;
    const tree = TenseSection({ tense: 'present', verb: packVerb, onPractise: () => (calls += 1) });
    const practise = elements(tree).find((element) => hasLabel(element, 'conjugation.page.practiseTense'));
    (practise!.props.onClick as () => void)();
    expect(calls).toBe(1);
  } finally {
    t.mockRestore();
  }
});

test('the inline region draws the saved unit sheet and links to its set, without navigating', () => {
  const unit = unitOf('WORD_TRANSFORM') as ExerciseUnit;
  const items = emptyItems(unit);
  const session = spyOn(unitHook, 'useExerciseUnit').mockReturnValue({
    status: 'ready',
    unit,
    items,
    progress: sheetProgress(unit, items),
  } as never);
  const saver = spyOn(saverHook, 'useUnitSaver').mockReturnValue({
    status: { kind: 'done', units: [unit] },
    save: async () => undefined,
    drop: () => {},
  } as never);
  try {
    const html = render(<ConjugationPractice result={{ verb: packVerb }} onWord={() => {}} onMissingKey={() => {}} />);
    expect(html).toContain(i18n.t('conjugation.page.practiseTitle'));
    expect(html).toContain(unit.title);
    expect(html).toContain(`href="#/grammar/exercises/set/${unit.setId}"`);
    expect(html).toContain(i18n.t('conjugation.page.practiseOpen'));
    // One unit needs no tense navigation.
    expect(html).not.toContain(i18n.t('conjugation.page.practiseNext'));
    // The region's one bounded status line announces the sheet that arrived.
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(i18n.t('conjugation.drill.made', { count: unit.items.length }));
  } finally {
    session.mockRestore();
    saver.mockRestore();
  }
});
