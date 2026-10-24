/** Server-rendered Today checklist contracts with hand-built plans; no storage, browser or real learner activity. */
import { afterAll, expect, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { readerTestWindow } from './fixtures/readerTestWindow';
import type { TodayPlan } from '../src/services/today/plan';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const { TodayView } = await import('../src/components/today/TodayView');
afterAll(restoreWindow);
const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const version = 'b'.repeat(64);
const mixed: TodayPlan = {
  steps: [
    { id: 'words', done: true, due: 0, newAvailable: 0 },
    { id: 'read', done: false, readerId: 'test-service-reader', order: 4, state: 'continue', version },
    { id: 'sound', done: false },
    { id: 'mistakes', done: true, unresolved: 2 },
  ],
  allDone: false,
};
const render = (plan: TodayPlan) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <TodayView plan={plan} />
    </I18nextProvider>,
  );
const items = (html: string) => html.match(/<li\b[^>]*>.*?<\/li>/g) ?? [];
const links = (html: string) => html.match(/<a\b[^>]*>.*?<\/a>/g) ?? [];

for (const language of ['en', 'zh']) {
  test(`${language}: four ordered steps keep exact statuses, destinations and only the first pending link primary`, async () => {
    await i18n.changeLanguage(language);
    const html = render(mixed);
    const rows = items(html);
    const actions = links(html);
    expect(html).toContain(`<h1 class="font-serif text-2xl font-semibold">${i18n.t('today.title')}</h1>`);
    expect(html).toContain(i18n.t('today.intro'));
    expect(html).toContain('<ol');
    expect(rows).toHaveLength(4);
    expect(actions).toHaveLength(4);
    const expected = [
      ['words', '#/study/words/review', i18n.t('today.words.status', { due: 0, newAvailable: 0 })],
      ['read', `#/read/graded/test-service-reader?version=${version}`, i18n.t('today.read.continue', { order: 4 })],
      ['sound', '#/speaking', i18n.t('today.sound.status')],
      ['mistakes', '#/study/mistakes', i18n.t('today.mistakes.status', { count: 2 })],
    ];
    expected.forEach(([id, href, status], index) => {
      expect(rows[index]).toContain(`<h2 class="font-serif text-lg font-semibold">${i18n.t(`today.${id}.title`)}</h2>`);
      expect(rows[index]).toContain(status);
      expect(actions[index]).toContain(`href="${href}"`);
      expect(actions[index]).toContain(`>${i18n.t(`today.${id}.action`)}</a>`);
      if (index === 1) {
        expect(actions[index]).toContain('bg-accent-700');
        expect(actions[index]).toContain('text-on-fill');
      } else {
        expect(actions[index]).toContain('border-ink-300');
        expect(actions[index]).not.toContain('bg-accent-700');
      }
      expect(rows[index].includes('text-ok-800')).toBe(index === 0 || index === 3);
      expect(rows[index].includes(i18n.t('today.done'))).toBe(index === 0 || index === 3);
    });
    expect(html).not.toContain(i18n.t('today.allDone'));
    expect(html).not.toContain('<svg');
  });

  test(`${language}: due and new counts come from the plan, and the words link can be primary`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ steps: [{ id: 'words', done: false, due: 7, newAvailable: 3 }], allDone: false });
    expect(html).toContain(i18n.t('today.words.status', { due: 7, newAvailable: 3 }));
    expect(links(html)[0]).toContain('bg-accent-700');
    expect(html).not.toContain(i18n.t('today.done'));
  });

  test.each(['start', 'continue', 'doneToday'] as const)(
    `${language}: reader state %s keeps its status and unpinned link`,
    async (state) => {
      await i18n.changeLanguage(language);
      const html = render({
        steps: [{ id: 'read', done: state === 'doneToday', readerId: 'test-bundled-reader', order: 2, state }],
        allDone: state === 'doneToday',
      });
      expect(html).toContain(i18n.t(`today.read.${state}`, { order: 2 }));
      expect(links(html)[0]).toContain('href="#/read/graded/test-bundled-reader"');
      expect(html).not.toContain('?version=');
    },
  );

  test.each(['words', 'read', 'sound', 'mistakes'] as const)(
    `${language}: a failed %s step shows the real error without an action`,
    async (id) => {
      await i18n.changeLanguage(language);
      const message = `TEST ${id} read failed`;
      const html = render({ steps: [{ id, done: false, error: message }], allDone: false });
      expect(items(html)).toHaveLength(1);
      expect(html).toContain(i18n.t(`today.${id}.title`));
      expect(html).toContain(i18n.t('today.stepError', { msg: message }));
      expect(links(html)).toHaveLength(0);
      expect(html).not.toContain('<button');
      expect(html).not.toContain(i18n.t('today.done'));
      expect(html).not.toContain(i18n.t('today.allDone'));
    },
  );

  test(`${language}: a failed source leaves other step statuses and links intact`, async () => {
    await i18n.changeLanguage(language);
    const html = render({
      steps: [
        { id: 'words', done: false, error: 'TEST words unavailable' },
        { id: 'sound', done: false },
      ],
      allDone: false,
    });
    expect(items(html)).toHaveLength(2);
    expect(links(items(html)[0]!)).toHaveLength(0);
    expect(links(items(html)[1]!)).toHaveLength(1);
    expect(links(html)[0]).toContain('href="#/speaking"');
    expect(html).toContain(i18n.t('today.sound.status'));
    expect(html).not.toContain('bg-accent-700');
  });

  test(`${language}: all done closes below the list with no primary link`, async () => {
    await i18n.changeLanguage(language);
    const html = render({
      steps: [
        { id: 'words', done: true, due: 0, newAvailable: 0 },
        { id: 'read', done: true, readerId: 'test-reader', order: 4, state: 'doneToday' },
        { id: 'sound', done: true },
        { id: 'mistakes', done: true, unresolved: 0 },
      ],
      allDone: true,
    });
    expect(links(html)).toHaveLength(4);
    expect(items(html).every((row) => row.includes(i18n.t('today.done')))).toBe(true);
    expect(html).not.toContain('bg-accent-700');
    expect(html).toContain(i18n.t('today.allDone'));
    expect(html.indexOf(i18n.t('today.allDone'))).toBeGreaterThan(html.indexOf('</ol>'));
  });

  test(`${language}: saved mistake counts use the locale's singular and plural forms`, async () => {
    await i18n.changeLanguage(language);
    for (const count of [1, 2]) {
      const html = render({ steps: [{ id: 'mistakes', done: false, unresolved: count }], allDone: false });
      expect(html).toContain(i18n.t('today.mistakes.status', { count }));
      expect(html).not.toContain('today.mistakes.status');
      if (language === 'en') expect(html).toContain(count === 1 ? '1 saved mistake</p>' : '2 saved mistakes</p>');
    }
  });

  test(`${language}: an empty plan renders the title without invented steps or completion`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ steps: [], allDone: false });
    expect(html).toContain(i18n.t('today.title'));
    expect(items(html)).toHaveLength(0);
    expect(links(html)).toHaveLength(0);
    expect(html).not.toContain(i18n.t('today.allDone'));
  });
}
