/** Recognition-only vertical journey with complete TEST-only 3x2 content; never a real content/provider call. */
import type { Page } from '@playwright/test';
import { expect, settled, test } from './fixtures';
import { stored } from './practice.helpers';
import { mockTopics, CONTENT_ORIGIN } from './contentService.helpers';
import { learningFixture } from '../tests/fixtures/grammarLearning';
import { topicsFixture } from '../tests/fixtures/grammarTopics';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import zh from '../src/i18n/locales/zh.json' with { type: 'json' };

const TOPIC = '/#/study/grammar/test-only';
type Storage = typeof import('../src/storage/exercises');
type Database = typeof import('../src/storage/db');

async function setup(page: Page, language: 'en' | 'zh' = 'en', theme = 'light') {
  await page.addInitScript(
    ({ language, theme }) => {
      localStorage.setItem('relire_onboarded', '1');
      localStorage.setItem('relire_lang', language);
      localStorage.setItem('relire_theme', theme);
      // No AI settings/key: unexpected requests are rejected, not answered with plausible content.
    },
    { language, theme },
  );
  const topic = learningFixture();
  topic.blocks.push({ type: 'note', text: { ...topic.title, en: 'TEST full reference' } });
  const pack = { ...topicsFixture(), topics: [topic] };
  await mockTopics(page, pack);
  const forbidden: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === 'GET' &&
      url.origin === CONTENT_ORIGIN &&
      ['/v1/topics', '/v1/topics/test-only', '/v1/tag-index'].includes(url.pathname)
    )
      return route.fallback();
    if (request.method() === 'GET' && url.origin === 'http://localhost:5174' && !url.pathname.startsWith('/v1/'))
      return route.fallback();
    if (request.method() === 'GET' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname))
      return route.fulfill({ contentType: 'text/css', body: '' });
    forbidden.push(`${request.method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  return { topic, forbidden };
}

const workbench = (page: Page) => page.locator('[data-topic-workbench]');
const index = (page: Page, language: 'en' | 'zh' = 'en') =>
  workbench(page).getByRole('group', {
    name: (language === 'en' ? en : zh).grammarTopics.learning.index.label,
    exact: true,
  });
const geometry = (page: Page) =>
  page
    .locator('#topic-instruction, [aria-labelledby="topic-instruction"], [data-topic-actions], [data-topic-result]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top + scrollY, left: rect.left, height: rect.height, width: rect.width };
      }),
    );

for (const language of ['en', 'zh'] as const) {
  for (const theme of ['light', 'sepia', 'dark']) {
    for (const phone of [false, true]) {
      test(`recognition shares one saved revision and retained authored feedback, ${language} ${theme}${phone ? ' @phone' : ''}`, async ({
        page,
      }) => {
        const { topic, forbidden } = await setup(page, language, theme);
        const strings = (language === 'en' ? en : zh).grammarTopics.learning;
        await page.goto(TOPIC);
        await expect(workbench(page).getByRole('heading', { name: topic.title[language], exact: true })).toBeVisible();
        await settled(page);
        expect(await stored(page)).toEqual({ units: [], itemStates: [], attempts: [] });
        await expect(index(page, language).getByRole('button')).toHaveCount(6);
        await expect(workbench(page).getByRole('button', { name: strings.actions.reset, exact: true })).toBeDisabled();
        await expect(workbench(page).getByText('TEST winter distractor', { exact: true })).toHaveCount(0);
        await expect(workbench(page).locator('[data-reader-word]')).toHaveCount(0);
        await expect(workbench(page).locator('input')).toHaveCount(0);
        await index(page, language).getByRole('button').nth(2).click();
        await expect(workbench(page).locator('h4')).toBeFocused();
        await index(page, language).getByRole('button').first().click();
        expect((await stored(page)).units).toEqual([]);
        const reference = workbench(page).getByRole('button', { name: strings.reference.fullReference, exact: true });
        await expect(workbench(page).locator('[data-slot="collapsible-content"]')).not.toBeVisible();
        await reference.click();
        await expect(workbench(page).locator('[data-slot="collapsible-content"]')).toBeVisible();
        expect((await stored(page)).units).toEqual([]);
        await reference.click();
        await settled(page);
        const before = await geometry(page);
        // Native Enter selects a choice but never checks it.
        await workbench(page).getByRole('button', { name: 'hiver', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(workbench(page).getByRole('button', { name: 'hiver', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        expect((await stored(page)).attempts).toEqual([]);
        await workbench(page).getByRole('button', { name: strings.actions.check, exact: true }).click();
        await expect(workbench(page).getByRole('status')).toHaveText(strings.result.wrong);
        expect(await geometry(page)).toEqual(before);
        const checked = await stored(page);
        expect(checked.units).toHaveLength(1);
        expect(checked.attempts).toHaveLength(1);
        const unit = checked.units[0];
        const unitHref = `#/practice/${encodeURIComponent(unit.id)}`;
        const original = await page.evaluate(async () => {
          const db: Database = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
          return db.exportData();
        });
        const feedbackButton = workbench(page).getByRole('button', { name: strings.result.readFeedback, exact: true });
        await feedbackButton.click();
        const sheet = page.getByRole('dialog', { name: strings.result.feedbackTitle, exact: true });
        await expect(sheet).toContainText(
          topic.learning.checkpoints[0].questions[0].feedback.byAnswer![0].message.summary[language],
        );
        await expect(sheet.locator('[data-reader-word]')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(feedbackButton).toBeFocused();
        expect(await geometry(page)).toEqual(before);
        // Change language in-place: no new identity, reset or input change.
        await page.evaluate(
          async (language) => {
            const { setAppLanguage }: typeof import('../src/i18n') = await import(
              /* @vite-ignore */ '/src/i18n/index.ts' as string
            );
            setAppLanguage(language);
          },
          language === 'en' ? ('zh' as const) : ('en' as const),
        );
        await expect(
          workbench(page).getByRole('heading', { name: topic.title[language === 'en' ? 'zh' : 'en'], exact: true }),
        ).toBeVisible();
        expect((await stored(page)).units).toEqual(checked.units);
        expect((await stored(page)).itemStates).toEqual(checked.itemStates);
        await page.evaluate(async (language) => {
          const { setAppLanguage }: typeof import('../src/i18n') = await import(
            /* @vite-ignore */ '/src/i18n/index.ts' as string
          );
          setAppLanguage(language);
        }, language);
        // All subsequent entry points must work even when the topic service fails.
        await page.route(`${CONTENT_ORIGIN}/v1/topics**`, (route) =>
          route.fulfill({ status: 500, json: { error: 'TEST unavailable' } }),
        );
        await page.goto('/#/practice');
        await page.locator('main a').filter({ hasText: topic.title[language] }).first().click();
        await expect(page.locator('main')).toContainText(unit.topicOrigin!.exerciseRevision.slice(0, 8));
        await page.locator(`main a[href="${unitHref}"]`).click();
        await expect(workbench(page)).toBeVisible();
        // Resume uses first unchecked, not a persisted cursor. Typed UI remains deferred.
        await expect(index(page, language).getByRole('button').nth(1)).toHaveAttribute('aria-current', 'step');
        await index(page, language).getByRole('button').first().click();
        await expect(workbench(page).getByRole('status')).toHaveText(strings.result.wrong);
        await workbench(page).getByRole('button', { name: strings.actions.redo, exact: true }).click();
        await expect(workbench(page).getByRole('button', { name: strings.actions.reset, exact: true })).toBeDisabled();
        await workbench(page).getByRole('button', { name: 'été', exact: true }).click();
        await workbench(page).getByRole('button', { name: strings.actions.check, exact: true }).click();
        await expect(workbench(page).getByRole('status')).toHaveText(strings.result.right);
        expect((await stored(page)).attempts).toHaveLength(2);
        await page.goto('/#/study/mistakes');
        await page.getByRole('button', { name: strings.result.readFeedback, exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText(
          topic.learning.checkpoints[0].questions[0].feedback.byAnswer![0].message.summary[language],
        );
        await page.keyboard.press('Escape');
        await page.evaluate(async (id) => {
          const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
          await storage.deleteUnit(id);
        }, unit.id);
        await page.reload();
        await expect(page.locator(`a[href="${unitHref}"]`)).toHaveCount(0);
        await page.getByRole('button', { name: strings.result.readFeedback, exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText(
          topic.learning.checkpoints[0].questions[0].feedback.byAnswer![0].message.summary[language],
        );
        await page.keyboard.press('Escape');
        await page.evaluate(async (backup) => {
          const db: Database = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
          await db.importData(backup);
        }, original);
        await page.goto(`/${unitHref}`);
        await expect(workbench(page)).toBeVisible();
        await index(page, language).getByRole('button').first().click();
        await expect(workbench(page).getByRole('status')).toHaveText(strings.result.wrong);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(forbidden).toEqual([]);
      });
    }
  }
}

test('typed blank checks with Enter, ignores IME and keeps correction geometry stable', async ({ page }) => {
  const { forbidden } = await setup(page);
  await page.goto(TOPIC);
  await expect(workbench(page)).toBeVisible();
  await index(page).getByRole('button').nth(1).click();
  const input = workbench(page).getByRole('textbox');
  await expect(input).toBeVisible();
  const check = workbench(page).getByRole('button', { name: 'Check', exact: true });
  await expect(check).toBeDisabled();
  await input.press('Enter');
  expect((await stored(page)).attempts).toEqual([]);
  await input.fill('ecole');
  for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
    await input.dispatchEvent('keydown', { key: 'Enter', bubbles: true, ...composition });
    expect((await stored(page)).attempts).toEqual([]);
  }
  await settled(page);
  const before = await geometry(page);
  await input.press('Enter');
  await expect(workbench(page).getByRole('status')).toHaveText('Wrong');
  await expect(input).toHaveAttribute('readonly', '');
  await expect(input).toBeFocused();
  await expect(workbench(page).locator('[data-topic-result]')).toContainText('école');
  await expect(workbench(page).locator('.select-all')).toHaveCount(0);
  expect(await geometry(page)).toEqual(before);
  await input.press('Enter');
  expect((await stored(page)).attempts).toHaveLength(1);
  await expect(index(page).getByRole('button').nth(1)).toHaveAttribute('aria-current', 'step');
  await workbench(page).getByRole('button', { name: 'Redo', exact: true }).click();
  await input.fill('collège');
  await input.press('Enter');
  await expect(workbench(page).getByRole('status')).toHaveText('Right');
  expect((await stored(page)).attempts).toHaveLength(2);
  expect(forbidden).toEqual([]);
});

test('an initial save failure keeps the choice editable, shows the real error and retries locally @phone', async ({
  page,
}) => {
  const { forbidden } = await setup(page);
  await page.goto(TOPIC);
  await expect(workbench(page)).toBeVisible();
  await settled(page);
  const before = await geometry(page);
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Restored and invoked with its store below.
    const original = IDBObjectStore.prototype.add;
    Object.assign(window, {
      restoreTopicWrites: () => {
        IDBObjectStore.prototype.add = original;
      },
    });
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'units') {
        throw new DOMException('TEST storage denied', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
  await workbench(page).getByRole('button', { name: 'hiver', exact: true }).click();
  await workbench(page).getByRole('button', { name: 'Check', exact: true }).click();
  await expect(workbench(page)).toContainText('TEST storage denied');
  expect(await geometry(page)).toEqual(before);
  expect((await stored(page)).attempts).toEqual([]);
  await expect(workbench(page).getByRole('button', { name: 'hiver', exact: true })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.evaluate(() => (window as unknown as { restoreTopicWrites(): void }).restoreTopicWrites());
  await workbench(page).getByRole('button', { name: 'Check', exact: true }).click();
  await expect(workbench(page).getByRole('status')).toHaveText('Wrong');
  expect(await geometry(page)).toEqual(before);
  expect(forbidden).toEqual([]);
});

test('pending storage has no provisional verdict and keeps the action row fixed @phone', async ({ page }) => {
  const { forbidden } = await setup(page);
  await page.goto(TOPIC);
  await expect(workbench(page)).toBeVisible();
  await workbench(page).getByRole('button', { name: 'hiver', exact: true }).click();
  await settled(page);
  const before = await geometry(page);
  // Hold the write stores with reads only; the real ensure/check must wait for release.
  await page.evaluate(async () => {
    const { db }: Database = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const tx = (await db()).transaction(['units', 'meta'], 'readwrite');
    let held = true;
    Object.assign(window, {
      releaseTopicStorage: () => {
        held = false;
      },
    });
    void (async () => {
      while (held) await tx.objectStore('meta').get('started');
      await tx.done;
    })();
  });
  try {
    await workbench(page).getByRole('button', { name: 'Check', exact: true }).click();
    await expect(workbench(page).getByRole('button', { name: 'Check', exact: true })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(workbench(page).getByRole('status')).toBeEmpty();
    expect(await geometry(page)).toEqual(before);
  } finally {
    await page.evaluate(() => (window as unknown as { releaseTopicStorage(): void }).releaseTopicStorage());
  }
  await expect(workbench(page).getByRole('status')).toHaveText('Wrong');
  expect(await geometry(page)).toEqual(before);
  expect((await stored(page)).attempts).toHaveLength(1);
  expect(forbidden).toEqual([]);
});

test('a stale prepared tab cannot resurrect a deleted snapshot', async ({ page, context }) => {
  const first = await setup(page);
  await page.goto(TOPIC);
  await expect(workbench(page)).toBeVisible();
  const other = await context.newPage();
  const second = await setup(other);
  await other.goto(TOPIC);
  await expect(workbench(other)).toBeVisible();
  await workbench(other).getByRole('button', { name: 'hiver', exact: true }).click();
  await expect.poll(async () => (await stored(other)).units.length).toBe(1);
  const [unit] = (await stored(other)).units;
  await other.evaluate(async (id) => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await storage.deleteUnit(id);
  }, unit.id);
  await workbench(page).getByRole('button', { name: 'hiver', exact: true }).click();
  await workbench(page).getByRole('button', { name: 'Check', exact: true }).click();
  await expect(workbench(page)).toHaveCount(0);
  await expect(page.getByText(en.notFound.unit, { exact: true })).toBeVisible();
  expect((await stored(page)).units).toEqual([]);
  expect((await stored(page)).attempts).toEqual([]);
  expect(first.forbidden).toEqual([]);
  expect(second.forbidden).toEqual([]);
  await other.close();
});
