/**
 * The noun-gender round as the app builds it: one saved twelve-item GENDER_CHECK unit whose first answers are
 * recorded once, the card and end-screen contracts, and the key guard. No browser, no real keyboard, no visual
 * acceptance: the look at 360 px and in the three themes stays manual.
 */
import { beforeEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import data from '../src/data/noun-gender/pack.json';
import { NounGenderPackSchema } from '../src/types/nounGender';
import { emptyAnswer } from '../src/services/exercises/answer';
import type { GenderKeyFacts } from '../src/components/study/grammar/GenderGame';
import { prepareGenderDrills } from '../src/services/exercises/fromGender';
import { answerCard, createDeck, summaryOf } from '../src/services/nounGender/deck';
import { checkItem, getResetToken, listAttempts, listMistakes, saveUnits } from '../src/storage/exercises';
import { freshDb } from './fixtures/storage';

// The game's link, settings and key modules read `window` and `localStorage` when they load; the round itself
// is rendered as static markup, so this browser stand-in lives only around the import.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
const { GenderCard, GenderRecap, ROUND_SIZE, commitPick, genderKey, showPick, unitToOpen } =
  await import('../src/components/study/grammar/GenderGame');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
Reflect.deleteProperty(globalThis, 'localStorage');

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const pack = NounGenderPackSchema.parse(data);
// `plage` is a reviewed A1 feminine exception to the -age tendency, so both feedback lines have data.
const [everything] = prepareGenderDrills({ pack, count: pack.nouns.length, t });
const plage = everything.items.find((item) => item.id === 'plage')!;
const summary = summaryOf(createDeck(Array.from({ length: ROUND_SIZE }, (_, index) => `noun-${index}`)));

beforeEach(freshDb);

test('a round saves one twelve-item GENDER_CHECK unit and writes only each card first answer', async () => {
  const [unit] = prepareGenderDrills({ pack, count: ROUND_SIZE, t });
  await saveUnits([unit]);
  expect(unit.type).toBe('GENDER_CHECK');
  expect(unit.learningArea).toBe('grammar');
  expect(unit.grammarTags).toEqual(['gender-number']);
  expect(unit.items).toHaveLength(ROUND_SIZE);

  const item = unit.items[0];
  const resetToken = await getResetToken(unit.id);
  const first = await checkItem({
    unitId: unit.id,
    itemId: item.id,
    resetToken,
    answer: { ...emptyAnswer(item), singleAnswer: item.expectedAnswer === 'M' ? 'F' : 'M' },
    result: { correct: false, strictAccents: false },
  });
  expect(first.created).toBe(true);
  expect(await listAttempts()).toHaveLength(1);
  expect((await listMistakes()).map((entry) => entry.resolved)).toEqual([false]);

  // The same card comes back later in the round: a right answer writes nothing and the mistake stays open.
  const later = await checkItem({
    unitId: unit.id,
    itemId: item.id,
    resetToken,
    answer: { ...emptyAnswer(item), singleAnswer: String(item.expectedAnswer) },
    result: { correct: true, strictAccents: false },
  });
  expect(later.created).toBe(false);
  expect(await listAttempts()).toHaveLength(1);
  expect((await listMistakes()).map((entry) => entry.resolved)).toEqual([false]);
});

const card = (pick: 'M' | 'F' | null) => (
  <GenderCard
    item={plage}
    summary={summary}
    pick={pick}
    saving={false}
    error={null}
    onPick={() => {}}
    onNext={() => {}}
    onRetry={() => {}}
    onEnd={() => {}}
  />
);

for (const language of ['en', 'zh'] as const) {
  test(`${language}: the first card shows the bare lemma, both choices with their key hints and a reserved feedback slot`, async () => {
    await i18n.changeLanguage(language);
    const html = render(card(null));
    expect(html).toContain('plage');
    expect(html).not.toContain('la plage');
    expect(html).toContain('lang="fr"');
    expect(html).toContain(t('nounGender.game.le'));
    expect(html).toContain(t('nounGender.game.la'));
    expect(html).toContain(t('nounGender.game.next'));
    // The key hints sit in the buttons, and the choices and Next share one fixed row.
    expect(html).toContain('>1</span>');
    expect(html).toContain('>2</span>');
    expect(html).toContain('grid-cols-3');
    // The feedback slot is reserved before any answer, and it is the only live region.
    expect(html).toContain('h-24');
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).toContain(t('nounGender.game.counter', { right: 0, total: ROUND_SIZE }));
  });

  test(`${language}: an answer names its verdict in words, brings the noun with its article and the ending line`, async () => {
    await i18n.changeLanguage(language);
    const wrong = render(card('M'));
    expect(wrong).toContain(t('nounGender.game.notQuite'));
    expect(wrong).toContain('la plage');
    expect(wrong).toContain(t('nounGender.rules.age'));
    expect(wrong).toContain(t('nounGender.exception'));
    expect(wrong).toContain('text-bad-700');
    expect(wrong).toContain('h-24');
    const right = render(card('F'));
    expect(right).toContain(t('nounGender.game.right'));
    expect(right).toContain('text-ok-800');
  });
}

test('the end screen states the real counts, the guessing line, Mistakes and the way back', async () => {
  await i18n.changeLanguage('en');
  const deck = answerCard(answerCard(answerCard(createDeck(['a', 'b', 'c']), 'a', true), 'b', false), 'b', true);
  const html = render(<GenderRecap summary={summaryOf(deck)} onPlayAgain={() => {}} onBack={() => {}} />);
  // Two cards were answered, one of them right on its first try; the round's totals are never invented.
  expect(html).toContain(t('nounGender.game.summary', { total: 2, right: 1 }));
  expect(html).toContain(t('nounGender.game.chance'));
  expect(html).toContain('href="#/study/mistakes"');
  expect(html).toContain(t('nounGender.game.playAgain'));
  expect(html).toContain(t('nounGender.game.back'));
  // The counts and the guessing line carry no French: the nouns and articles are data, not copy.
  expect(t('nounGender.game.summary', { total: 2, right: 1 })).not.toMatch(/\b(le|la|les|un|une)\b/i);
  expect(t('nounGender.game.chance')).not.toMatch(/\b(le|la|les|un|une)\b/i);
});

test('the round keys answer and advance; guarded keys and open overlays never click the round buttons', () => {
  const quiet: GenderKeyFacts = {
    repeated: false,
    composing: false,
    foreignControl: false,
    overlayOpen: false,
    answered: false,
    choice: null,
    onRoundButton: false,
  };
  expect(genderKey('1', quiet)).toEqual({ action: 'le', preventDefault: true });
  expect(genderKey('ArrowLeft', quiet)).toEqual({ action: 'le', preventDefault: true });
  expect(genderKey('2', quiet)).toEqual({ action: 'la', preventDefault: true });
  expect(genderKey('ArrowRight', quiet)).toEqual({ action: 'la', preventDefault: true });
  expect(genderKey('Enter', quiet)).toEqual({ action: 'next', preventDefault: true });
  expect(genderKey(' ', quiet)).toEqual({ action: 'next', preventDefault: true });
  expect(genderKey('3', quiet)).toEqual({ action: null, preventDefault: false });
  // Enter/Space on a focused choice button is that button's own pick, never a no-op "next".
  expect(genderKey('Enter', { ...quiet, choice: 'M', onRoundButton: true })).toEqual({
    action: 'le',
    preventDefault: true,
  });
  expect(genderKey(' ', { ...quiet, choice: 'F', onRoundButton: true })).toEqual({
    action: 'la',
    preventDefault: true,
  });
  // A repeated or held key (the component reads its set from a ref, so a round update cannot clear it), an
  // IME composition or an open overlay anywhere in the document never acts, but on the round's own buttons
  // the native activation is still cancelled, so a held Enter cannot answer le or click Next.
  const heldOnLe: GenderKeyFacts = { ...quiet, repeated: true, choice: 'M', onRoundButton: true };
  expect(genderKey('Enter', heldOnLe)).toEqual({ action: null, preventDefault: true });
  expect(genderKey('Enter', { ...heldOnLe, onRoundButton: false, choice: null })).toEqual({
    action: null,
    preventDefault: false,
  });
  expect(genderKey('Enter', { ...quiet, composing: true, onRoundButton: true })).toEqual({
    action: null,
    preventDefault: true,
  });
  expect(genderKey('1', { ...quiet, overlayOpen: true })).toEqual({ action: null, preventDefault: false });
  expect(genderKey('1', { ...quiet, overlayOpen: true, onRoundButton: true })).toEqual({
    action: null,
    preventDefault: true,
  });
  expect(genderKey('Enter', { ...quiet, foreignControl: true })).toEqual({ action: null, preventDefault: false });
  // An answered card advances with Enter, Space and the right arrow only; the answer keys, including 2, do nothing.
  const answered = { ...quiet, answered: true };
  expect(genderKey('Enter', answered)).toEqual({ action: 'next', preventDefault: true });
  expect(genderKey(' ', answered)).toEqual({ action: 'next', preventDefault: true });
  expect(genderKey('ArrowRight', answered)).toEqual({ action: 'next', preventDefault: true });
  expect(genderKey('2', answered)).toEqual({ action: null, preventDefault: false });
  expect(genderKey('1', answered)).toEqual({ action: null, preventDefault: false });
  expect(genderKey('ArrowLeft', answered)).toEqual({ action: null, preventDefault: false });
});

test('a first answer leaves the deck untouched until its write commits, so a failed write changes nothing', () => {
  const fresh = {
    unit: everything,
    token: 1,
    deck: createDeck(['a', 'b']),
    shown: 'a',
    pick: null,
    saving: false,
    error: null,
  };
  // The pick is shown with its verdict, but the deck waits for the write.
  const shown = showPick(fresh, 'M', false);
  expect(shown).toEqual({ ...fresh, pick: 'M', saving: true });
  // A failed write keeps the real message and the deck exactly as it was.
  const failed = { ...shown, saving: false, error: 'TEST write refused' };
  expect(failed.deck.queue).toEqual(['a', 'b']);
  expect(failed.deck.firstTry).toEqual({});
  // The retry commits the same pick: only now does the miss go to the end of the queue.
  expect(commitPick(failed, false).deck.queue).toEqual(['b', 'a']);
  // A returning card writes nothing, so it advances at once; a first answer on 'b' would wait instead.
  const returning = showPick({ ...commitPick(failed, false), pick: null }, 'F', true);
  expect(returning.deck.queue).toEqual(['b']);
  expect(returning.saving).toBe(false);
});

test('a token-read retry reuses the kept unit instead of saving a second set', async () => {
  const [unit] = prepareGenderDrills({ pack, count: ROUND_SIZE, t });
  // After a successful save and a failed token read, the kept unit wins and no new batch is even consulted.
  expect(unitToOpen(unit, undefined)).toBe(unit);
  expect(unitToOpen(null, [unit])).toBe(unit);
  expect(unitToOpen(null, undefined)).toBeUndefined();
});
