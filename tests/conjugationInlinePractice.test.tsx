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
  } finally {
    session.mockRestore();
    saver.mockRestore();
  }
});
