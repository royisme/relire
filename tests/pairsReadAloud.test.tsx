/** Static choice/row contracts captured before #51 changes; no playback, microphone or browser acceptance. */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import '../src/i18n';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import data from '../src/data/minimal-pairs/pairs.json';
import { emptyItems } from '../src/hooks/exerciseUnit/model';
import { emptyAnswer } from '../src/services/exercises/answer';
import { preparePairsDrills } from '../src/services/exercises/fromPairs';
import { MinimalPairsPackSchema } from '../src/types/minimalPairs';
import type { CheckedResult, ExerciseItem, ExerciseUnit } from '../src/types/exercises';
import { ChoiceSelectControl } from '../src/components/practice/controls/ChoiceSelectControl';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { ItemRow } = await import('../src/components/practice/ItemRow');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const [unit] = preparePairsDrills({
  pack: MinimalPairsPackSchema.parse(data),
  contrasts: ['e-ɛ'],
  count: 1,
  rng: () => 0,
  makeId: () => 'TEST-pairs',
  now: () => 1,
  t: i18n.getFixedT('en'),
});
const pair = unit.items[0];
const generic: ExerciseItem = {
  id: 'TEST-choice',
  itemNumber: 1,
  prompt: 'TEST {a|b}',
  expectedAnswer: 'a',
  grammarTag: 'articles',
};

/** Browser-only speech stores are read at rest for static markup, as in existing rendering tests. */
function render(node: React.ReactNode) {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    useStore(subscribe, snapshot, server ?? snapshot),
  );
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    store.mockRestore();
  }
}

function row(item: ExerciseItem, checked: CheckedResult | null = null, owner: ExerciseUnit = unit) {
  return render(
    <ItemRow
      unit={owner}
      item={item}
      runtime={{ ...emptyItems({ ...owner, items: [item] })[item.id], checked }}
      onAnswer={() => {}}
      onCheck={() => {}}
      onHint={() => {}}
      onExplain={() => {}}
      onRedo={() => {}}
      onBind={() => {}}
      onWord={() => {}}
    />,
  );
}

const listenCount = (html: string) => html.split(`aria-label="${i18n.t('practice.listen')}"`).length - 1;

for (const language of ['en', 'zh']) {
  test(`${language}: choices without audio keep the exact pre-change control and full row markup`, async () => {
    await i18n.changeLanguage(language);
    expect(
      render(
        <ChoiceSelectControl
          item={generic}
          type="CHOICE_SELECT"
          answer={emptyAnswer(generic)}
          onChange={() => {}}
          checked={null}
          disabled={false}
          registerInput={() => {}}
        />,
      ),
    ).toMatchSnapshot('pre-51 control');
    expect(row(generic)).toMatchSnapshot('pre-51 row');
  });

  test(`${language}: the shared action is the only Listen for audio choices, absent for a bare choice without audio`, async () => {
    await i18n.changeLanguage(language);
    expect(listenCount(row({ ...pair, meta: undefined, explanation: undefined }))).toBe(1);
    expect(listenCount(row({ ...pair, audioText: undefined, meta: undefined, explanation: undefined }))).toBe(0);
    // Sentence choices retain their original shared prompt playback, even without audioText.
    expect(listenCount(row(generic))).toBe(1);
    for (const correct of [true, false]) expect(listenCount(row(pair, { correct, strictAccents: true }))).toBe(1);
    const number = { ...pair, type: 'NUMBER_DICTATION' as const, meta: undefined, prompt: 'TEST' };
    expect(listenCount(row(number))).toBe(1);
  });

  test(`${language}: read aloud reserves space before checking, then offers both reviewed words with one recorder`, async () => {
    await i18n.changeLanguage(language);
    const title = i18n.t('minimalPairs.readAloud.title');
    const open = row(pair);
    expect(open).toContain('h-72 overflow-y-auto');
    expect(open).not.toContain(`aria-label="${title}"`);
    expect(open).not.toContain(i18n.t('shadowing.record'));
    for (const correct of [true, false]) {
      const html = row(pair, { correct, strictAccents: true });
      expect(html).toContain('h-72 overflow-y-auto');
      expect(html).toContain(`aria-label="${title}"`);
      const section = html.slice(html.indexOf('<section'));
      for (const word of [
        data.pairs.find((entry) => entry.id === pair.id)!.a,
        data.pairs.find((entry) => entry.id === pair.id)!.b,
      ])
        expect(section).toContain(`>${word}</button>`);
      expect((section.match(/role="radio"/g) ?? []).length).toBe(2);
      expect((section.match(/aria-checked="true"/g) ?? []).length).toBe(1);
      expect(section.split(i18n.t('shadowing.record')).length - 1).toBe(1);
      expect(section).toContain(i18n.t('minimalPairs.readAloud.guide'));
      expect(section).not.toContain('<audio');
      expect(listenCount(section)).toBe(0);
    }
    // The unchecked (also Redo) composition keeps the reserved space without a recorder.
    expect(row(pair)).toBe(open);
  });

  test(`${language}: read aloud never appears for a generic or differently sourced choice after checking`, async () => {
    await i18n.changeLanguage(language);
    for (const meta of [undefined, { source: 'TEST-other' }]) {
      const html = row({ ...pair, meta }, { correct: true, strictAccents: true });
      expect(html).not.toContain('h-72 overflow-y-auto');
      expect(html).not.toContain(`aria-label="${i18n.t('minimalPairs.readAloud.title')}"`);
      expect(html).not.toContain(i18n.t('shadowing.record'));
    }
  });
}
