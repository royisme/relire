/**
 * Static contracts of the authored word and sentence bodies: both locales, the meaning/gender lines, the
 * controlled save cells and their reserved status slot, and the single translation slot. Not browser geometry,
 * not a real lookup, save, AI call or speech.
 */
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { AuthoredEntry } from '../src/components/word/AuthoredEntry';
import { SentenceAuthored } from '../src/components/SentenceAuthored';
import type { ReaderGlossaryEntry } from '../src/types/gradedReader';

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const buttons = (markup: string) => [...markup.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => match[0]);
const buttonWith = (markup: string, label: string) => buttons(markup).find((button) => button.includes(label));
// The `disabled:` utility class is not the attribute; only a real attribute disables a cell.
const disabled = (button: string | undefined) => /\sdisabled(?=[\s>=])/.test(button ?? '');

// TEST content: invented and labelled, never real reader copy.
const noun: ReaderGlossaryEntry = {
  id: 'test-noun',
  lemma: 'lumière',
  pos: 'noun',
  sense: 'test-sense',
  forms: ['lumière'],
  gloss: { en: 'TEST light', zh: '测试光' },
  gender: 'feminine',
};
const verb: ReaderGlossaryEntry = {
  id: 'test-verb',
  lemma: 'ouvrir',
  pos: 'verb',
  sense: 'test-sense',
  forms: ['ouvre', 'ouvrir'],
  gloss: { en: 'TEST to open', zh: '测试打开' },
};
const sentence = {
  fr: 'Elle ouvre la lumière.',
  translation: { en: 'TEST she turns on the light.', zh: '测试她开灯。' },
};
const entry = (overrides: Partial<Parameters<typeof AuthoredEntry>[0]> = {}) => (
  <AuthoredEntry
    spelling="lumière"
    entry={noun}
    sentence={sentence}
    saved="unsaved"
    onSave={() => {}}
    onRemove={() => {}}
    {...overrides}
  />
);

test('the word sheet shows the clicked spelling, the authored entry and the sentence in English', async () => {
  await i18n.changeLanguage('en');
  const markup = render(entry());
  expect(markup).toContain('lumière');
  expect(markup).toContain('Noun');
  expect(markup).toContain('feminine');
  expect(markup).toContain('TEST light');
  expect(markup).toContain('« Elle ouvre la lumière. »');
  expect(markup).toContain('TEST she turns on the light.');
  expect(markup).toContain('Authored');
  expect(markup).not.toContain('AI');
});

test('the same entry and sentence render in Chinese, with the lemma only when it differs from the spelling', async () => {
  await i18n.changeLanguage('zh');
  const markup = render(entry());
  expect(markup).toContain('名词');
  expect(markup).toContain('阴性');
  expect(markup).toContain('测试光');
  expect(markup).toContain('测试她开灯。');
  expect(markup).not.toContain('原型');
  // A verb form shows the lemma it belongs to, because the tapped spelling is not the lemma.
  const inflected = render(entry({ spelling: 'ouvre', entry: verb }));
  expect(inflected).toContain('原型');
  expect(inflected).toContain('ouvrir');
  await i18n.changeLanguage('en');
});

test('gender appears for nouns only, and an empty gloss falls back to the other language', async () => {
  await i18n.changeLanguage('en');
  const verbMarkup = render(entry({ entry: verb }));
  expect(verbMarkup).not.toContain('masculine');
  expect(verbMarkup).not.toContain('feminine');
  const fallback = render(entry({ entry: { ...noun, gloss: { en: '', zh: '测试回退' } } }));
  expect(fallback).toContain('测试回退');
});

test('each save state draws its own cells and keeps the reserved status slot', async () => {
  await i18n.changeLanguage('en');
  const unsaved = render(entry());
  expect(buttonWith(unsaved, 'Save word')).toBeDefined();
  expect(disabled(buttonWith(unsaved, 'Remove bookmark'))).toBe(true);
  expect(unsaved).toContain('h-12');

  const saved = render(entry({ saved: 'saved' }));
  expect(buttonWith(saved, 'Save this context')).toBeDefined();
  expect(disabled(buttonWith(saved, 'Remove bookmark'))).toBe(false);

  const contextSaved = render(entry({ saved: 'contextSaved' }));
  expect(disabled(buttonWith(contextSaved, 'Context saved'))).toBe(true);
  expect(disabled(buttonWith(contextSaved, 'Remove bookmark'))).toBe(false);

  const pending = render(entry({ saved: 'saved', pending: true }));
  expect(disabled(buttonWith(pending, 'Save this context'))).toBe(true);
  expect(disabled(buttonWith(pending, 'Remove bookmark'))).toBe(true);
  expect(pending).toContain(en.vocab.saving);
  expect(pending).toContain('h-12');
});

test('a failed save shows the real error with Retry in the reserved slot', async () => {
  await i18n.changeLanguage('en');
  const markup = render(entry({ error: 'TEST quota exceeded' }));
  expect(markup).toContain('TEST quota exceeded');
  expect(buttonWith(markup, en.common.retry)).toBeDefined();
  expect(markup).toContain('h-12');
});

test('the sentence sheet keeps one translation slot whether the translation is hidden or shown', async () => {
  const hidden = render(<SentenceAuthored sentence={sentence} revealed={false} onToggle={() => {}} />);
  const shown = render(<SentenceAuthored sentence={sentence} revealed onToggle={() => {}} />);
  for (const markup of [hidden, shown]) {
    expect(markup.split('h-24')).toHaveLength(2);
    expect(markup).toContain('« Elle ouvre la lumière. »');
  }
  expect(hidden).not.toContain('TEST she turns on the light.');
  expect(buttonWith(hidden, 'Show translation')).toContain('aria-expanded="false"');
  expect(shown).toContain('TEST she turns on the light.');
  expect(buttonWith(shown, 'Hide translation')).toContain('aria-expanded="true"');

  await i18n.changeLanguage('zh');
  const chinese = render(<SentenceAuthored sentence={sentence} revealed onToggle={() => {}} />);
  expect(chinese).toContain('测试她开灯。');
  expect(buttonWith(chinese, '隐藏译文')).toBeDefined();
  await i18n.changeLanguage('en');
});

test('neither authored body imports AI, lexicon or speech', async () => {
  for (const file of ['src/components/word/AuthoredEntry.tsx', 'src/components/SentenceAuthored.tsx']) {
    const source = await Bun.file(file).text();
    expect(source).not.toMatch(/(?:from|import\()\s*['"][^'"]*(?:\/ai(?:\/|['"])|\/lexicon|\/speech)/);
  }
});
