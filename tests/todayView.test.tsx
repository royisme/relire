/** Server-rendered Today view contracts in both locales; no browser, storage reads or real learner activity. */
import { afterAll, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { readerTestWindow } from './fixtures/readerTestWindow';
import type { TodayPlan, TodayStep } from '../src/services/today/plan';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const { TodayView } = await import('../src/components/today/TodayView');
const { TodayPage } = await import('../src/components/today/TodayPage');
afterAll(restoreWindow);
const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const now = Date.UTC(2026, 9, 24, 12, 30);
const version = 'b'.repeat(64);
const frenchTitle = 'Une très longue histoire française pour apprendre à lire tranquillement';
const pending = [
  { id: 'words', done: false, due: 2, newAvailable: 1 },
  { id: 'read', done: false, readerId: 'test-reader', order: 4, title: frenchTitle, state: 'continue', version },
  { id: 'sound', done: false },
  { id: 'mistakes', done: false, unresolved: 2 },
  { id: 'grammar', done: false, topicId: 'test-one', title: 'TEST one' },
] satisfies TodayStep[];
const mixed: TodayPlan = {
  steps: pending.map((step) => ({ ...step, done: step.id === 'words' || step.id === 'mistakes' })),
  allDone: false,
  nextIndex: 1,
  doneCount: 2,
  counts: { reviews: 5, exercises: 0, readers: 1 },
};
const items = (html: string) => html.match(/<li\b[^>]*>.*?<\/li>/g) ?? [];
const links = (html: string) => html.match(/<a\b[^>]*>.*?<\/a>/g) ?? [];
const render = (plan: TodayPlan) => {
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <TodayView plan={plan} now={now} />
    </I18nextProvider>,
  ).replaceAll('&#x27;', "'");
  links(html).forEach((link) => expect(link).not.toMatch(/<a\b[^>]*>.*<(?:a|button|input|select|textarea)\b/));
  expect(links(html).filter((link) => link.includes('bg-accent-700'))).toHaveLength(
    plan.nextIndex === undefined ? 0 : 1,
  );
  expect(html).not.toMatch(/today\.[a-z]/);
  return html;
};

for (const language of ['en', 'zh']) {
  test(`${language}: one Card, ordered whole-row links, one expanded next step and real date`, async () => {
    await i18n.changeLanguage(language);
    const html = render(mixed);
    const rows = items(html);
    expect(html).toContain(i18n.t('today.title'));
    expect(html).toContain(new Intl.DateTimeFormat(language).format(now));
    expect(html.match(/rounded-lg/g)).toHaveLength(1);
    expect(html).toContain(i18n.t('today.steps.title'));
    expect(html).toContain(i18n.t('today.steps.progress', { done: 2, total: 5 }));
    expect(rows).toHaveLength(5);
    const expected = [
      ['#/study/words/review', i18n.t('today.words.status', { due: 2, newAvailable: 1 })],
      [`#/read/graded/test-reader?version=${version}`, i18n.t('today.read.continue', { order: 4 })],
      ['#/speaking', i18n.t('today.sound.status')],
      ['#/study/mistakes', i18n.t('today.mistakes.status', { count: 2 })],
      ['#/grammar/topics/test-one', i18n.t('today.grammar.status', { title: 'TEST one' })],
    ];
    expected.forEach(([href, status], index) => {
      expect(rows[index]).toContain(status);
      expect(links(rows[index]!)).toHaveLength(1);
      expect(links(rows[index]!)[0]).toContain(`href="${href}"`);
      if (index === 1) {
        expect(rows[index]).toContain('text-2xl leading-tight');
        expect(rows[index]).toContain('text-accent-900');
        expect(rows[index]).toContain(i18n.t('today.read.why'));
        expect(links(rows[index]!)[0]).toContain('h-11');
        expect(links(rows[index]!)[0]).toContain(`>${i18n.t('today.read.action')}</a>`);
        expect(links(rows[index]!)[0]).not.toContain('<h4');
        return;
      }
      expect(links(rows[index]!)[0]).toContain('<h4');
      expect(rows[index]).not.toContain('text-2xl');
      expect(rows[index].includes('text-ok-800')).toBe(index === 0 || index === 3);
      if (index === 0 || index === 3) expect(rows[index]).toContain('text-ink-500');
    });
    expect(rows[1]).toContain(frenchTitle);
    expect(html.match(/border-l border-ink-200/g)).toHaveLength(4);
    expect(html).not.toContain('bg-accent-100');
    expect(html).not.toContain('ring-');
    expect(rows.filter((row) => row.includes('<svg'))).toHaveLength(2);
  });

  test.each(pending)(`${language}: $id as next keeps its why and Start action label`, async (step) => {
    await i18n.changeLanguage(language);
    const html = render({ steps: [step], allDone: false, nextIndex: 0, doneCount: 0, counts: {} });
    const action = links(items(html)[0]!)[0];
    expect(action).toContain(`>${i18n.t(`today.${step.id}.action`)}</a>`);
    expect(html).toContain(i18n.t(`today.${step.id}.why`));
  });

  test(`${language}: guidance lists only actionable steps in order, without the French title`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ steps: pending, allDone: false, nextIndex: 0, doneCount: 0, counts: {} });
    const clauses = [
      i18n.t('today.guidance.words', { count: 3 }),
      i18n.t('today.guidance.read'),
      i18n.t('today.guidance.sound'),
      i18n.t('today.guidance.mistakes', { count: 2 }),
      i18n.t('today.guidance.grammar'),
    ];
    expect(html).toContain(
      i18n.t('today.guidance.plan', { steps: new Intl.ListFormat(language, { type: 'conjunction' }).format(clauses) }),
    );
    const mixedHtml = render({
      ...mixed,
      steps: mixed.steps.map((step) =>
        step.id === 'grammar' ? { id: 'grammar', done: false, error: 'TEST unavailable' } : step,
      ),
    });
    // A failed source never contributes a clause, even while other steps remain actionable.
    expect(mixedHtml).toContain(
      i18n.t('today.guidance.plan', {
        steps: new Intl.ListFormat(language, { type: 'conjunction' }).format([
          i18n.t('today.guidance.read'),
          i18n.t('today.guidance.sound'),
        ]),
      }),
    );
    expect(html.slice(0, html.indexOf('</header>'))).not.toContain(frenchTitle);
  });

  test.each([1, 3])(`${language}: one-step word and mistake guidance with count %s`, async (count) => {
    await i18n.changeLanguage(language);
    for (const step of [
      { id: 'words', done: false, due: count - 1, newAvailable: 1 },
      { id: 'mistakes', done: false, unresolved: count },
    ] satisfies TodayStep[]) {
      const html = render({ steps: [step], allDone: false, nextIndex: 0, doneCount: 0, counts: {} });
      expect(html).toContain(i18n.t('today.guidance.plan', { steps: i18n.t(`today.guidance.${step.id}`, { count }) }));
      if (step.id === 'mistakes') expect(html).toContain(i18n.t('today.mistakes.status', { count }));
      if (language === 'en') {
        const noun = step.id === 'words' ? 'word' : 'mistake';
        expect(html).toContain(count === 1 ? `1 ${noun}.` : `3 ${noun}s.`);
      }
    }
  });

  test.each(['start', 'continue', 'doneToday'] as const)(
    `${language}: reader state %s keeps the French title and unpinned route`,
    async (state) => {
      await i18n.changeLanguage(language);
      const done = state === 'doneToday';
      const html = render({
        steps: [{ id: 'read', done, readerId: 'test-reader', order: 2, title: frenchTitle, state }],
        allDone: done,
        nextIndex: done ? undefined : 0,
        doneCount: done ? 1 : 0,
        counts: {},
      });
      expect(html).toContain(frenchTitle);
      expect(html).toContain(i18n.t(`today.read.${state}`, { order: 2 }));
      expect(links(html)[0]).toContain('href="#/read/graded/test-reader"');
      expect(html).not.toContain('?version=');
      expect(html).not.toContain(i18n.t('today.read.noKey'));
    },
  );

  test.each([true, false])(`${language}: Reader 1 no-key line is visible when next=%s`, async (next) => {
    await i18n.changeLanguage(language);
    const html = render({
      steps: [
        { id: 'words', done: next, due: 1, newAvailable: 0 },
        { id: 'read', done: false, readerId: 'test-reader', order: 1, title: frenchTitle, state: 'start' },
      ],
      allDone: false,
      nextIndex: next ? 1 : 0,
      doneCount: next ? 1 : 0,
      counts: {},
    });
    expect(items(html)[1]).toContain(`${i18n.t('today.read.start', { order: 1 })} ${i18n.t('today.read.noKey')}`);
  });

  test.each(['words', 'read', 'sound', 'mistakes', 'grammar'] as const)(
    `${language}: failed $id is plain text and its error appears once`,
    async (id) => {
      await i18n.changeLanguage(language);
      const message = `TEST ${id} read failed`;
      const html = render({
        steps: [{ id, done: false, error: message }],
        allDone: false,
        nextIndex: undefined,
        doneCount: 0,
        counts: {},
      });
      expect(items(html)).toHaveLength(1);
      expect(links(items(html)[0]!)).toHaveLength(0);
      expect(html).toContain(i18n.t(`today.${id}.title`));
      expect(html).toContain(i18n.t('today.stepError', { msg: message }));
      expect(html.split(message)).toHaveLength(2);
      expect(html).toContain(i18n.t('today.guidance.unavailable'));
    },
  );

  test(`${language}: nextIndex skips an error and expands sound, not the failed row`, async () => {
    await i18n.changeLanguage(language);
    const html = render({
      steps: [
        { id: 'words', done: false, error: 'TEST words unavailable' },
        { id: 'sound', done: false },
      ],
      allDone: false,
      nextIndex: 1,
      doneCount: 0,
      counts: {},
    });
    expect(links(items(html)[0]!)).toHaveLength(0);
    expect(links(items(html)[1]!)[0]).toContain('bg-accent-700');
    expect(html).toContain(i18n.t('today.guidance.plan', { steps: i18n.t('today.guidance.sound') }));
    expect(html).not.toContain(i18n.t('today.guidance.unavailable'));
  });

  test(`${language}: all done keeps done rows linked and leaves only outline practice actions`, async () => {
    await i18n.changeLanguage(language);
    const html = render({
      steps: pending.map((step) => ({ ...step, done: true })),
      allDone: true,
      nextIndex: undefined,
      doneCount: 5,
      counts: {},
    });
    expect(html).toContain(i18n.t('today.guidance.allDone'));
    expect(items(html).every((row) => links(row)[0]?.includes('<h4') && row.includes('text-ok-800'))).toBe(true);
    expect(links(html)).toHaveLength(9);
    expect(html).not.toContain(i18n.t('today.read.why'));
  });

  test(`${language}: no steps has empty guidance, no progress and always four independent destinations`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ steps: [], allDone: false, nextIndex: undefined, doneCount: 0, counts: {} });
    expect(html).toContain(i18n.t('today.guidance.empty'));
    expect(items(html)).toHaveLength(0);
    expect(html).not.toContain(i18n.t('today.steps.progress', { done: 0, total: 0 }));
    const actions = links(html);
    expect(actions).toHaveLength(4);
    ['#/study/words', '#/read', '#/speaking', '#/grammar'].forEach((href, index) => {
      expect(actions[index]).toContain(`href="${href}"`);
      expect(actions[index]).toContain('border-ink-300');
      expect(actions[index]).not.toContain('<svg');
    });
  });

  test(`${language}: aside shows real counts including zero and omits a missing source`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ ...mixed, counts: { reviews: 0, readers: 7 } });
    const aside = html.match(/<aside\b.*?<\/aside>/)?.[0] ?? '';
    expect(aside).toContain(i18n.t('today.counts.title'));
    expect(aside).toContain(i18n.t('today.counts.reviews'));
    expect(aside).toContain(i18n.t('today.counts.readers'));
    expect(aside).not.toContain(i18n.t('today.counts.exercises'));
    expect(aside).toContain('<dd class="tnum text-ink-900">0</dd>');
    expect(aside).toContain('<dd class="tnum text-ink-900">7</dd>');
    expect(aside).not.toContain('rounded-');
    expect(render(mixed)).toContain(i18n.t('today.counts.exercises'));
  });

  test(`${language}: TodayPage loading has its heading and static line, without ready date`, async () => {
    await i18n.changeLanguage(language);
    const vocabulary: VocabularyModel = {
      rows: [],
      preferences: { newPerDay: 20, retentionPercent: 90 },
      day: { date: '', introducedKeys: [] },
      epoch: 0,
      now,
      ready: false,
      error: null,
      refresh: async () => undefined,
      savePreferences: async () => undefined,
    };
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <TodayPage vocabulary={vocabulary} />
      </I18nextProvider>,
    ).replaceAll('&#x27;', "'");
    expect(html).toContain('role="status"');
    expect(html).toContain(i18n.t('today.title'));
    expect(html).toContain(i18n.t('today.loading'));
    expect(html).not.toContain(new Intl.DateTimeFormat(language).format(now));
    expect(html).not.toContain('animate-');
    expect(links(html)).toHaveLength(0);
  });
}
