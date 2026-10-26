/**
 * The run's end screens as the app builds them: the real counts, when the next card really comes back, the way back
 * to Words. No browser, no visual acceptance: the look at 360 px and the three themes stay owner-manual.
 */
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { formatAvailableAt } from '../src/utils/srs';

// The run's link and settings modules read `window` and `localStorage` when they load; the end screens are
// rendered as static markup, so these browser stand-ins live only around the import.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
const run = await import('../src/components/vocabulary/game/VocabularyRun');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
Reflect.deleteProperty(globalThis, 'localStorage');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const now = new Date(2026, 9, 24, 12, 30).getTime();
const next = new Date(2026, 9, 25, 15).getTime();
const done = (due: number, remaining: number, nextDue: number | null) =>
  render(
    <run.RunDone
      ratings={6}
      rows={[]}
      now={now}
      due={due}
      remaining={remaining}
      nextDue={nextDue}
      onContinue={() => {}}
      heading={{ current: null }}
    />,
  );

for (const language of ['en', 'zh'] as const) {
  test(`${language}: the done screen names the next time only with nothing due and no new word left`, async () => {
    await i18n.changeLanguage(language);
    const shortTime = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(next);
    const line = i18n.t('vocab.game.nextDue', { time: '\u0000' }).split('\u0000')[0];
    const html = done(0, 0, next);
    expect(html).toContain(i18n.t('vocab.game.doneTitle'));
    expect(html).toContain(i18n.t('vocab.game.doneCounts', { ratings: 6, due: 0 }));
    expect(html).toContain(i18n.t('vocab.game.nextDue', { time: formatAvailableAt(next, language) }));
    expect(html).toContain(i18n.t('vocab.game.continueRun'));
    expect(html).toContain('href="#/words"');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(done(0, 0, null)).toContain(i18n.t('vocab.game.nothingWaiting'));
    // A new word is served right now, so the next-time line would be false; cards still due wait for a card, not
    // for new words. Neither state shows the line, and neither claims that nothing waits.
    for (const [due, remaining] of [
      [0, 3],
      [4, 0],
      [4, 3],
    ] as const) {
      const blocked = done(due, remaining, next);
      expect(blocked).toContain(i18n.t('vocab.game.doneCounts', { ratings: 6, due }));
      expect(blocked).not.toContain(line);
      expect(blocked).not.toContain(shortTime);
      expect(blocked).not.toContain(i18n.t('vocab.game.nothingWaiting'));
      expect(blocked).toContain(i18n.t('vocab.game.continueRun'));
      expect(blocked).toContain('href="#/words"');
    }
  });
}

test('the queue-cleared screen always states the next time, date alone at local midnight, or that nothing waits', async () => {
  await i18n.changeLanguage('en');
  const due = new Date(2026, 9, 25, 9, 5).getTime();
  const html = render(<run.RunCleared nextDue={due} />);
  expect(html).toContain(i18n.t('vocab.game.queueCleared'));
  expect(html).toContain(i18n.t('vocab.game.nextDue', { time: formatAvailableAt(due, 'en') }));
  expect(html).toContain('href="#/words"');
  // A review card returns from local midnight, so its line carries no time part.
  const midnight = new Date(2026, 9, 26).getTime();
  const dateOnly = render(<run.RunCleared nextDue={midnight} />);
  expect(dateOnly).toContain(new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(midnight));
  expect(dateOnly).not.toMatch(/\d:\d\d/);
  expect(render(<run.RunCleared nextDue={null} />)).toContain(i18n.t('vocab.game.nothingWaiting'));
});
