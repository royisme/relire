/** Static bilingual form/entry and existing pair-note rendering contracts, not visual or browser acceptance. */
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import '../src/i18n';
import { FRENCH_IPA } from '../src/data/frenchIpa';
import data from '../src/data/minimal-pairs/pairs.json';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { loadMinimalPairsPack } from '../src/services/minimalPairs/load';
import { preparePairsDrills } from '../src/services/exercises/fromPairs';
import { emptyItems } from '../src/hooks/exerciseUnit/model';
import { ItemNotes } from '../src/components/practice/ItemNotes';
import { dialogBody } from './fixtures/dialogBody';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { PairsDrillForm } = await import('../src/components/practice/PairsDrillForm');
const { AddExercisesDialog } = await import('../src/components/practice/AddExercisesDialog');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const pack = await loadMinimalPairsPack(data);

for (const language of ['en', 'zh']) {
  test(`${language}: form labels use the real chart examples, with permanent reviewed tips and bounded status`, async () => {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <PairsDrillForm />
      </I18nextProvider>,
    );
    const symbols = new Set(pack.pairs.flatMap((pair) => pair.contrast.split('-')));
    for (const { symbol, word } of Object.values(FRENCH_IPA)
      .flat()
      .filter((sound) => symbols.has(sound.symbol))) {
      expect(html).toContain(i18n.t('minimalPairs.drill.sound', { symbol, word }));
    }
    expect((html.match(/role="checkbox"/g) ?? []).length).toBe(7);
    for (const contrast of ['y-u', 'b-p']) expect(html).toContain(i18n.t(`minimalPairs.drill.tips.${contrast}`));
    expect(html).toContain('h-64 overflow-y-auto');
    expect(html).toContain('id="pairs-save-status"');
    expect(html).toContain('h-16 overflow-y-auto');
    expect(html).toContain(i18n.t('minimalPairs.drill.pickContrast'));
  });

  test(`${language}: add choices expose Sound pairs in Grammar beside Gender, and directly in Listening only`, async () => {
    await i18n.changeLanguage(language);
    // The Dialog portals on the client only, so its content is rendered without the wrapper.
    const render = (area: 'grammar' | 'listening' | 'reading' | 'writing') => {
      const Body = dialogBody(AddExercisesDialog, {
        area,
        articles: [],
        initialChoice: null,
        onMissingKey: () => {},
        onClose: () => {},
      });
      return renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <Body />
        </I18nextProvider>,
      );
    };
    expect(render('grammar')).toContain(i18n.t('nounGender.drill.title'));
    for (const area of ['grammar', 'listening'] as const)
      expect(render(area)).toContain(i18n.t('minimalPairs.drill.title'));
    for (const area of ['reading', 'writing'] as const)
      expect(render(area)).not.toContain(i18n.t('minimalPairs.drill.title'));
  });

  test(`${language}: the saved reviewed pair note is hidden before check and shown after either verdict`, async () => {
    await i18n.changeLanguage(language);
    const [unit] = preparePairsDrills({ pack, contrasts: ['e-ɛ'], count: 1, t: i18n.getFixedT(language) });
    const item = unit.items[0];
    const runtime = emptyItems(unit)[item.id];
    const render = (checked: boolean | null) =>
      renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ItemNotes
            item={item}
            runtime={{ ...runtime, checked: checked === null ? null : { correct: checked, strictAccents: true } }}
            onWord={() => {}}
          />
        </I18nextProvider>,
      );
    const text = (checked: boolean | null) => render(checked).replace(/<[^>]*>/g, '');
    expect(text(null)).not.toContain(i18n.t('minimalPairs.notes.tendency'));
    expect(text(true)).toContain(i18n.t('minimalPairs.notes.tendency'));
    expect(text(false)).toContain(i18n.t('minimalPairs.notes.tendency'));
  });
}
