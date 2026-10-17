/** Same-item action serialization and reading context on exercise sheets; AI is mocked. */
import { expect, test } from './fixtures';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

type Db = typeof import('../src/storage/db');

const QUESTION = 'Que veut le renard';

test.beforeEach(async ({ page, ai }) => {
  void ai;
  await seedUnits(page);
});

test('a pending hint blocks every check entry point until it finishes', async ({ page, ai }) => {
  const pending = Promise.withResolvers<{ hint: string; grammarRule: string }>();
  ai.answer({ hint: () => pending.promise });
  await openUnit(page, 'u4', 'Questions ouvertes');
  const item = row(page, QUESTION);
  const field = item.getByRole('textbox');
  await field.fill('Il veut un ami.');
  await item.getByRole('button', { name: 'Hint' }).click();
  await expect.poll(() => ai.calls.hint).toBe(1);
  await expect(checkButton(item)).toBeDisabled();
  await field.press('Enter');
  await page.getByRole('button', { name: 'Check all' }).click();
  expect(ai.calls.grade).toBe(0);
  expect((await stored(page)).attempts).toEqual([]);

  pending.resolve({ hint: 'Think about friendship.', grammarRule: 'Answer in a full sentence.' });
  await expect(item.getByText('Think about friendship.')).toBeVisible();
  await expect(checkButton(item)).toBeEnabled();
  await field.fill('Il veut des liens.');
  await checkButton(item).click();
  await expect(item.getByText('AI feedback.')).toBeVisible();
  expect((await stored(page)).attempts[0].userAnswer).toBe('Il veut des liens.');
});

test('a supplied reading passage appears before the questions', async ({ page }) => {
  await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const unit = (await d.get('units', 'u4'))!;
    await d.put('units', {
      ...unit,
      readingPassage: {
        title: 'Le souhait du renard',
        content: 'Le renard veut un ami.\nIl demande au petit prince de l’apprivoiser.',
      },
    });
  });
  await openUnit(page, 'u4', 'Questions ouvertes');
  const passage = page.getByText('Le renard veut un ami.', { exact: false });
  await expect(page.getByRole('heading', { name: 'Le souhait du renard' })).toBeVisible();
  await expect(passage).toBeVisible();
  expect((await passage.boundingBox())!.y).toBeLessThan((await row(page, QUESTION).boundingBox())!.y);
  await page.screenshot({ path: test.info().outputPath('unit-reading-passage.png'), fullPage: true });
});
