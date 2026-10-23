/** Complete TEST-only workbench, with actual current counts and retained attempts, never real teaching content. */
import { expect, settled, test } from './fixtures';
import { stored } from './practice.helpers';
import { TOPIC, setup, workbench, index, geometry } from './grammar-topic-learning.fixture';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import zh from '../src/i18n/locales/zh.json' with { type: 'json' };

test('Check retains focus after committing instead of losing it during the save', async ({ page }) => {
  await setup(page);
  await page.goto(TOPIC);
  await expect(workbench(page)).toBeVisible();
  await workbench(page).getByRole('button', { name: 'été', exact: true }).click();
  await workbench(page).getByRole('button', { name: 'Check', exact: true }).click();
  await expect(workbench(page).getByRole('status')).toHaveText('Right');
  await expect(workbench(page).locator('[data-topic-actions] button').nth(2)).toBeFocused();
});

for (const phone of [false, true]) {
  const suffix = phone ? ' @phone' : '';

  test(`an open character bar inserts at the same bound cursor after Check and Redo${suffix}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('relire_onboarded', '1');
      localStorage.setItem('relire_lang', 'en');
    });
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === 'http://localhost:5174' ? route.fallback() : route.abort(),
    );
    await page.goto('/');
    await page.evaluate(async () => {
      const { mountCharacterWorkbench }: typeof import('./grammar-topic-learning-characters.fixture') = await import(
        /* @vite-ignore */ '/e2e/grammar-topic-learning-characters.fixture.tsx' as string
      );
      mountCharacterWorkbench();
    });
    await expect(workbench(page)).toBeVisible();
    await index(page).getByRole('button').nth(1).click();
    const input = workbench(page).getByRole('textbox');
    await input.fill('école');
    const boundInput = await input.elementHandle();
    await page.getByRole('button', { name: en.practice.chars.toggle, exact: true }).click();
    const characters = page.getByRole('group', { name: en.practice.chars.label, exact: true });
    const accent = characters.getByRole('button', { name: 'é', exact: true });
    await expect(accent).toBeEnabled();
    await input.press('Enter');
    await expect(workbench(page).getByRole('status')).toHaveText('Right');
    await expect(accent).toBeDisabled();
    // Keep the bar open; keyboard activation avoids the floating grid covering Redo on phones.
    await workbench(page).getByRole('button', { name: 'Redo', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(input).toBeEditable();
    expect(await input.evaluate((element, bound) => element === bound, boundInput)).toBe(true);
    await expect(accent).toBeEnabled();
    await input.focus();
    await expect(accent).toBeEnabled();
    await expect(characters).toContainText(en.practice.chars.hint);
    await input.fill('cole');
    await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(0, 0));
    await accent.click();
    await expect(input).toHaveValue('école');
    await expect(input).toBeFocused();
    expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
  });

  test(`an open character bar is disabled while Check holds the bound input read-only${suffix}`, async ({ page }) => {
    const { forbidden } = await setup(page);
    await page.goto(TOPIC);
    await expect(workbench(page)).toBeVisible();
    await index(page).getByRole('button').nth(1).click();
    const input = workbench(page).getByRole('textbox');
    await input.fill('école');
    await page.getByRole('button', { name: en.practice.chars.toggle, exact: true }).click();
    const characters = page.getByRole('group', { name: en.practice.chars.label, exact: true });
    const accent = characters.getByRole('button', { name: 'é', exact: true });
    await expect(accent).toBeEnabled();
    await expect.poll(async () => (await stored(page)).itemStates.length).toBe(1);
    // Hold storage, not a timer: the real check stays pending until explicitly released.
    await page.evaluate(async () => {
      const { db }: typeof import('../src/storage/db') = await import(
        /* @vite-ignore */ '/src/storage/db.ts' as string
      );
      const tx = (await db()).transaction(['units', 'meta'], 'readwrite');
      let held = true;
      Object.assign(window, { releaseCharacterCheck: () => (held = false) });
      void (async () => {
        while (held) await tx.objectStore('meta').get('started');
        await tx.done;
      })();
    });
    try {
      await input.press('Enter');
      await expect(workbench(page).getByRole('button', { name: 'Check', exact: true })).toHaveAttribute(
        'aria-busy',
        'true',
      );
      await expect(input).toHaveAttribute('readonly', '');
      await expect(input).toBeFocused();
      await expect(workbench(page).getByRole('status')).toBeEmpty();
      await expect(accent).toBeDisabled();
      await expect(characters).toContainText(en.practice.chars.none);
      await expect(input).toHaveValue('école');
    } finally {
      await page.evaluate(() => (window as unknown as { releaseCharacterCheck(): void }).releaseCharacterCheck());
    }
    await expect(workbench(page).getByRole('status')).toHaveText('Right');
    expect((await stored(page)).attempts).toHaveLength(1);
    expect(forbidden).toEqual([]);
  });
}

for (const language of ['en', 'zh'] as const) {
  for (const theme of ['light', 'sepia', 'dark']) {
    for (const phone of [false, true]) {
      test(`complete and review six questions, ${language} ${theme}${phone ? ' @phone' : ''}`, async ({ page }) => {
        const { topic, secondTopic, referenceTopic, forbidden } = await setup(page, language, theme);
        const locale = language === 'en' ? en : zh;
        const strings = locale.grammarTopics.learning;
        await page.goto(TOPIC);
        await expect(workbench(page)).toBeVisible();
        await settled(page);
        const selectors = index(page, language).getByRole('button');
        await expect(workbench(page)).toContainText(
          strings.progress.initial.replace('{{checked}}', '0').replace('{{total}}', '6'),
        );
        await expect(
          workbench(page).getByRole('button', { name: strings.actions.previous, exact: true }),
        ).toBeDisabled();
        await expect(page.getByRole('button', { name: locale.practice.chars.toggle, exact: true })).toHaveCount(1);
        expect(await stored(page)).toEqual({ units: [], itemStates: [], attempts: [] });
        // Leaving an unchecked question records neither a skip nor a wrong answer; the draft alone survives.
        await selectors.nth(1).click();
        await expect(workbench(page).locator('#topic-instruction')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(workbench(page).getByRole('textbox')).toBeFocused();
        await workbench(page).getByRole('textbox').fill('TEST learner draft');
        await selectors.nth(5).click();
        await page.goto(`/#/grammar/topics/${referenceTopic.id}`);
        await expect(page.getByRole('heading', { name: referenceTopic.title[language], exact: true })).toBeVisible();
        await expect.poll(async () => (await stored(page)).itemStates.length).toBe(1);
        const draft = await stored(page);
        expect(draft.attempts).toEqual([]);
        expect(draft.itemStates[0].answer.singleAnswer).toBe('TEST learner draft');
        await page.goto(TOPIC);
        await expect(selectors.first()).toHaveAttribute('aria-current', 'step');
        await selectors.nth(1).click();
        const draftInput = workbench(page).getByRole('textbox');
        await expect(draftInput).toHaveValue('TEST learner draft');
        await draftInput.focus();
        for (const nextLanguage of [language === 'en' ? 'zh' : 'en', language] as const) {
          await page.evaluate(async (nextLanguage) => {
            const { setAppLanguage }: typeof import('../src/i18n') = await import(
              /* @vite-ignore */ '/src/i18n/index.ts' as string
            );
            setAppLanguage(nextLanguage);
          }, nextLanguage);
          await expect(
            workbench(page).getByRole('heading', { name: topic.title[nextLanguage], exact: true }),
          ).toBeVisible();
          await expect(draftInput).toHaveValue('TEST learner draft');
          await expect(draftInput).toBeFocused();
        }
        expect(await stored(page)).toEqual(draft);
        for (let at = 0; at < 6; at++) {
          await selectors.nth(at).click();
          await expect(selectors.nth(at)).toHaveAttribute('aria-current', 'step');
          const checkpoint = topic.learning.checkpoints[Math.floor(at / 2)];
          await expect(workbench(page).locator('#topic-checkpoint')).toHaveText(checkpoint.title[language]);
          const teaching = checkpoint.teaching[0];
          if (teaching.type !== 'paragraph') throw new Error('TEST fixture requires paragraph teaching');
          await expect(workbench(page).getByText(teaching.text[language], { exact: true })).toBeVisible();
          if (at % 2 === 0) {
            await workbench(page).getByRole('button', { name: 'été', exact: true }).click();
          } else {
            const input = workbench(page).getByRole('textbox');
            await input.fill('');
            await expect(
              workbench(page).getByRole('button', { name: strings.actions.check, exact: true }),
            ).toBeDisabled();
            if (at === 1) {
              await input.fill('cole');
              // Home does not move the caret in phone emulation; establish the insertion precondition explicitly.
              await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(0, 0));
              const readSelection = () =>
                input.evaluate((element: HTMLInputElement) => ({
                  start: element.selectionStart,
                  end: element.selectionEnd,
                  inputFocused: document.activeElement === element,
                }));
              expect(await readSelection()).toEqual({ start: 0, end: 0, inputFocused: true });
              await page.getByRole('button', { name: locale.practice.chars.toggle, exact: true }).click();
              expect(await readSelection()).toEqual({ start: 0, end: 0, inputFocused: true });
              await page
                .getByRole('group', { name: locale.practice.chars.label, exact: true })
                .getByRole('button', { name: 'é', exact: true })
                .click();
              await expect(input).toHaveValue('école');
              expect(await readSelection()).toEqual({ start: 1, end: 1, inputFocused: true });
              await expect(input).toBeFocused();
              await input.press('Escape');
            } else await input.fill(at === 3 ? 'ecole' : 'collège');
          }
          await settled(page);
          const before = await geometry(page);
          const check = workbench(page).getByRole('button', { name: strings.actions.check, exact: true });
          await check.click();
          await expect(workbench(page).getByRole('status')).toHaveText(
            at === 3 ? strings.result.wrong : strings.result.right,
          );
          expect(await geometry(page)).toEqual(before);
          await expect(selectors.nth(at)).toHaveAccessibleName(
            new RegExp(at === 3 ? strings.index.wrong : strings.index.right),
          );
          if (at === 3) await expect(workbench(page).locator('[data-topic-result]')).toContainText('école');
          if (at < 5) {
            await workbench(page).getByRole('button', { name: strings.actions.next, exact: true }).click();
            await expect(workbench(page).locator('#topic-instruction')).toBeFocused();
          }
        }
        await expect(workbench(page)).toContainText(
          strings.progress.summary.replace('{{checked}}', '6').replace('{{right}}', '5'),
        );
        await expect(workbench(page).getByRole('button', { name: strings.actions.next, exact: true })).toBeDisabled();
        for (let at = 0; at < 6; at++) {
          await selectors.nth(at).click();
          await expect(workbench(page).getByRole('status')).toHaveText(
            at === 3 ? strings.result.wrong : strings.result.right,
          );
        }
        const beforeRedo = await geometry(page);
        await workbench(page).getByRole('button', { name: strings.actions.redo, exact: true }).click();
        await expect(workbench(page).getByRole('textbox')).toHaveValue('');
        await expect(workbench(page).getByRole('textbox')).toBeEditable();
        expect(await geometry(page)).toEqual(beforeRedo);
        expect((await stored(page)).attempts).toHaveLength(6);
        await workbench(page).getByRole('button', { name: strings.actions.reset, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: locale.practice.resetTitle, exact: true });
        await dialog.getByRole('button', { name: locale.common.cancel, exact: true }).click();
        expect((await stored(page)).itemStates).toHaveLength(5);
        await workbench(page).getByRole('button', { name: strings.actions.reset, exact: true }).click();
        await dialog.getByRole('button', { name: locale.practice.reset, exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(selectors.first()).toHaveAttribute('aria-current', 'step');
        const reset = await stored(page);
        expect(reset.itemStates).toEqual([]);
        expect(reset.attempts).toHaveLength(6);
        await expect(workbench(page)).toContainText(
          strings.progress.initial.replace('{{checked}}', '0').replace('{{total}}', '6'),
        );
        // A reference-only topic keeps its existing reader and never touches exercise stores.
        await page.goto(`/#/grammar/topics/${referenceTopic.id}`);
        await expect(page.getByRole('heading', { name: referenceTopic.title[language], exact: true })).toBeVisible();
        await expect(workbench(page)).toHaveCount(0);
        expect(await stored(page)).toEqual(reset);
        await page.goto(`/#/grammar/topics/${secondTopic.id}`);
        await expect(
          workbench(page).getByRole('heading', { name: secondTopic.title[language], exact: true }),
        ).toBeVisible();
        expect(await stored(page)).toEqual(reset);
        await workbench(page).getByRole('button', { name: 'une lampe', exact: true }).click();
        await workbench(page).getByRole('button', { name: strings.actions.check, exact: true }).click();
        await expect(workbench(page).getByRole('status')).toHaveText(strings.result.right);
        await workbench(page).getByRole('button', { name: strings.actions.next, exact: true }).click();
        await workbench(page).getByRole('textbox').fill('mes cahiers');
        await workbench(page).getByRole('textbox').press('Enter');
        await expect(workbench(page).getByRole('status')).toHaveText(strings.result.right);
        const pilots = await stored(page);
        expect(pilots.units).toHaveLength(2);
        expect(pilots.attempts).toHaveLength(8);
        expect(new Set(pilots.units.map((unit) => unit.topicOrigin!.topicId))).toEqual(
          new Set([topic.id, secondTopic.id]),
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(forbidden).toEqual([]);
      });
    }
  }
}
