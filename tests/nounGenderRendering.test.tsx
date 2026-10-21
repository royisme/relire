/** Static noun-reference, hint and post-check feedback contracts; not browser geometry or visual acceptance. */
import { expect, spyOn, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { loadNounGenderPack } from '../src/services/nounGender/load';
import * as packHook from '../src/hooks/useNounGenderPack';
import { prepareGenderDrills } from '../src/services/exercises/fromGender';
import { GenderCheckControl } from '../src/components/practice/controls/GenderCheckControl';
import { NounGenderHint } from '../src/components/word/NounGenderHint';
import { emptyAnswer } from '../src/services/exercises/answer';
import type { ExerciseItem } from '../src/types/exercises';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { default: GenderPage } = await import('../src/components/study/grammar/GenderPage');
const { default: GrammarSection } = await import('../src/components/study/grammar/GrammarSection');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const pack = await loadNounGenderPack();
const [unit] = prepareGenderDrills({ pack, t: i18n.t.bind(i18n), count: pack.nouns.length });
const plage = unit.items.find((item) => item.id === 'plage')!;
const control = (item: ExerciseItem, checked: boolean | null) =>
  render(
    <GenderCheckControl
      item={item}
      type="GENDER_CHECK"
      answer={emptyAnswer(item)}
      onChange={() => {}}
      checked={checked === null ? null : { correct: checked, strictAccents: false }}
      disabled={checked !== null}
      registerInput={() => {}}
    />,
  );

for (const language of ['en', 'zh'] as const) {
  test(`${language}: rule and exception feedback stays hidden until checked, then appears for both verdicts from saved metadata`, async () => {
    await i18n.changeLanguage(language);
    const caption = i18n.t('nounGender.rules.age');
    const exception = i18n.t('nounGender.exception');
    expect(control(plage, null)).not.toContain(caption);
    expect(control(plage, null)).not.toContain(exception);
    for (const correct of [true, false]) {
      const html = control(JSON.parse(JSON.stringify(plage)) as ExerciseItem, correct);
      expect(html).toContain(caption);
      expect(html).toContain(exception);
      expect(html).toContain('99.5');
      expect(html).toContain('3105');
    }
    // Unchecked and checked source items reserve the same feedback region; no answer text leaks into it.
    expect(control(plage, null)).toContain('h-20');
    expect(control(plage, true)).toContain('h-20');
    const generic = { ...plage, meta: undefined };
    expect(control(generic, true)).not.toContain(caption);
    expect(control({ ...plage, meta: { source: 'noun-gender', rules: 'broken' } }, true)).not.toContain(caption);
    const noRule = unit.items.find((item) => item.id === 'maison')!;
    expect(control(noRule, true)).not.toContain(exception);
  });

  test(`${language}: the noun hint uses the supplied lemma, labels known exceptions and preserves real pack failures`, async () => {
    await i18n.changeLanguage(language);
    const hint = render(<NounGenderHint lemma=" PLAGE " result={{ pack }} />);
    expect(hint).toContain(i18n.t('nounGender.rules.age'));
    expect(hint).toContain(i18n.t('nounGender.exception'));
    const unknown = render(<NounGenderHint lemma="TEST-inconnu-age" result={{ pack }} />);
    expect(unknown).toContain(i18n.t('nounGender.rules.age'));
    expect(unknown).not.toContain(i18n.t('nounGender.exception'));
    expect(render(<NounGenderHint lemma="maison" result={{ pack }} />)).toBe('');
    expect(render(<NounGenderHint lemma="plage" result={{ error: 'TEST noun pack chunk unavailable' }} />)).toContain(
      'TEST noun pack chunk unavailable',
    );
  });

  test(`${language}: the reference includes all 17 rules and honest ure figures, French lemmas and sample-scoped empty exceptions`, async () => {
    await i18n.changeLanguage(language);
    const html = render(<GenderPage />);
    for (const rule of pack.rules) expect(html).toContain(`data-rule="${rule.id}"`);
    expect(html.match(/data-rule=/g)).toHaveLength(17);
    expect(html).toContain('902/1216');
    expect(html).toContain('74.1');
    expect(html).toContain('12/12');
    expect(html).toContain('100');
    expect(html).toContain('télévision');
    expect(html).toContain('été');
    expect(html).toContain(i18n.t('nounGender.noExceptions'));
    expect(html).not.toContain('nounGender.rules.');
    expect(html).not.toContain('bg-accent-100');
  });
}

test('reference loading and real errors occupy one bounded reserved region', () => {
  const state = spyOn(packHook, 'useNounGenderPack').mockReturnValue({ status: 'loading' });
  try {
    const loading = render(<GenderPage />);
    expect(loading).toContain(i18n.t('nounGender.loading'));
    expect(loading).toContain('h-96 overflow-y-auto');
    expect(loading).toContain('aria-busy="true"');
    state.mockReturnValue({ status: 'error', error: 'TEST noun chunk unavailable' });
    const error = render(<GenderPage />);
    expect(error).toContain('TEST noun chunk unavailable');
    expect(error).toContain('role="alert"');
    expect(error).toContain('h-96 overflow-y-auto');
    expect(error).not.toContain('data-rule=');
  } finally {
    state.mockRestore();
  }
});

test('Grammar offers Gender and Conjugation without a service and Topics only with one', () => {
  const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;
  try {
    for (const hasService of [false, true]) {
      if (hasService) process.env.VITE_CONTENT_SERVICE_URL = 'https://TEST.invalid';
      else delete process.env.VITE_CONTENT_SERVICE_URL;
      const html = render(<GrammarSection section="gender" />);
      expect(html).toContain(i18n.t('nounGender.title'));
      expect(html).toContain(i18n.t('conjugation.page.title'));
      expect(html.includes(`>${i18n.t('grammarTopics.title')}<`)).toBe(hasService);
      expect(html.match(/role="radio"/g)).toHaveLength(hasService ? 3 : 2);
    }
  } finally {
    if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
    else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
  }
});
