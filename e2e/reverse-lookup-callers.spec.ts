/** Reverse lookup from exercise rows, both passage views and notebook snapshots; all AI answers are test fixtures. */
import type { Page } from '@playwright/test';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { defaultAnswers, expect, layout, overflowing, settled, test } from './fixtures';
import { checkButton, openUnit, row, seedUnits } from './practice.helpers';

const UNIT = 'unit-fill-blanks';
const TITLE = 'Conjuguer au présent et au futur';
const PROMPT = 'Je vais au jardin et je [___] du pain (manger).';
const PASSAGE_UNIT = 'unit-reading-cloze';
const PASSAGE_TITLE = 'Une promenade au jardin';
const PASSAGE = 'Je vais au jardin. Elle va au marché.';
const sheet = (page: Page) => page.getByRole('dialog', { name: 'vais', exact: true });

/** The entry's first complete frame must already contain both pack sections, with no late movement. */
const anchors = (page: Page) =>
  sheet(page).evaluate((dialog) => {
    const top = (el: Element | null) => Math.round(el?.getBoundingClientRect().top ?? NaN);
    const heading = (name: string) => [...dialog.querySelectorAll('h4')].find((h) => h.textContent === name) ?? null;
    const button = (name: string) =>
      [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes(name)) ?? null;
    const box = dialog.getBoundingClientRect();
    return {
      sheet: { x: box.x, y: box.y, width: box.width, height: box.height },
      title: top(dialog.querySelector('h2')),
      verbForm: top(heading('Verb form')),
      conjugation: top(heading('Conjugation')),
      disclosure: top(button('all tenses')),
      save: top(button('Save word')),
    };
  });

for (const phone of [false, true]) {
  for (const caller of ['exercise row', 'inline passage', 'passage reader', 'mistake notebook']) {
    test(`${caller}: tapping vais names aller and the word sheet does not shift ${phone ? '@phone' : ''}`, async ({
      page,
      ai,
    }) => {
      ai.answer({
        word: {
          ...(defaultAnswers.word as object),
          word: 'vais',
          lemma: 'aller',
          partOfSpeech: 'verbe',
          translation: 'I go to the garden, then to the market to buy bread. '.repeat(3),
          usageExamples: [],
        },
      });
      const units = structuredClone(CATALOG_EXERCISES.units).filter((unit) => [UNIT, PASSAGE_UNIT].includes(unit.id));
      units.find((unit) => unit.id === UNIT)!.items[0].prompt = PROMPT;
      units.find((unit) => unit.id === PASSAGE_UNIT)!.readingPassage = {
        title: PASSAGE_TITLE,
        content: PASSAGE,
      };
      await seedUnits(page, units);
      await openUnit(page, UNIT, TITLE);
      // The exercise replaces [___] with an input, so match only the prompt's visible prefix.
      const item = row(page, 'Je vais au jardin');
      let token = item.getByRole('button', { name: 'vais', exact: true });
      if (caller === 'mistake notebook') {
        await item.getByRole('textbox').fill('mangez');
        await checkButton(item).click();
        await expect(item.getByText('Incorrect', { exact: true })).toBeAttached();
        await page.goto('/#/mistakes');
        await expect(page.getByRole('heading', { name: 'Mistakes', exact: true })).toBeVisible();
      } else if (caller === 'inline passage' || caller === 'passage reader') {
        await openUnit(page, PASSAGE_UNIT, 'Compléter le passage');
        if (caller === 'passage reader') {
          await page.getByRole('link', { name: 'Open in the reader' }).click();
          await expect(page).toHaveURL(/#\/passage\/unit-reading-cloze$/);
          token = page.locator('article [data-reader-word]').filter({ hasText: /^vais$/ });
        } else {
          token = page
            .locator('section')
            .filter({ has: page.getByRole('heading', { name: PASSAGE_TITLE, exact: true }) })
            .last()
            .getByRole('button', { name: 'vais', exact: true });
        }
      }

      // Hold the pack until the sheet has stopped sliding: no half-drawn entry may precede its reverse hit.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route(/grammar-pack\/pack\.json/, async (route) => {
        await gate;
        await route.continue();
      });
      await token.scrollIntoViewIfNeeded();
      await settled(page);
      const beforePage = await layout(page);
      await token.click();
      await expect(sheet(page).getByText('Looking up the word…')).toBeVisible();
      await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
      await page.evaluate(() => document.fonts.ready);
      release();
      await expect(sheet(page).getByRole('heading', { name: 'vais', exact: true })).toBeVisible();
      const before = await anchors(page);
      expect(
        Object.values(before)
          .filter((value) => typeof value === 'number')
          .every(Number.isFinite),
      ).toBe(true);
      const verbForm = sheet(page)
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Verb form', exact: true }) });
      await expect(verbForm.getByRole('listitem')).toHaveText(['aller : présent, je']);
      await expect(sheet(page).getByRole('button', { name: 'Show all tenses' })).toBeVisible();
      await page.waitForTimeout(300);
      expect(await anchors(page)).toEqual(before);
      expect(await layout(page)).toEqual(beforePage);
      expect(await overflowing(sheet(page))).toEqual([]);

      const disclosure = sheet(page).getByRole('button', { name: 'Show all tenses' });
      const beforeDisclosure = (await disclosure.boundingBox())!;
      await disclosure.click();
      await expect(sheet(page).locator('[aria-current="true"]')).toHaveText(['je vais']);
      const afterDisclosure = (await sheet(page).getByRole('button', { name: 'Hide all tenses' }).boundingBox())!;
      expect({ width: afterDisclosure.width, height: afterDisclosure.height }).toEqual({
        width: beforeDisclosure.width,
        height: beforeDisclosure.height,
      });
      // Expanding the table can grow a phone sheet; its heading-to-disclosure gap must stay unchanged.
      const expanded = await anchors(page);
      expect(expanded.disclosure - expanded.conjugation).toBe(before.disclosure - before.conjugation);
      expect(await overflowing(sheet(page))).toEqual([]);
      expect(ai.calls.word).toBe(1);
      expect(ai.calls.conjugate).toBe(0);
      expect(ai.prompts.word[0]).toContain(caller.includes('passage') ? PASSAGE : PROMPT);
      await page.keyboard.press('Escape');
      await expect(sheet(page)).toHaveCount(0);
      expect(await layout(page)).toEqual(beforePage);
    });
  }
}
