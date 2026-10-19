/** Owns Library table-foundation regression coverage; no article persistence or provider implementation tests. */
import { expect, overflowing, test } from './fixtures';
import { waitForArticle } from './practice.helpers';

for (const phone of [false, true]) {
  test(`Library retains sorting, filtering, row actions and responsive columns ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    void ai;
    await page.goto('/#/read');
    await waitForArticle(page);
    const table = page.getByRole('table');
    const titles = table.locator('tbody tr td:first-child button > span:first-child');
    await expect(titles).toHaveText([
      "L'Intelligence Artificielle et la Transition Écologique",
      "L'Art de Vivre dans un Café Parisien",
      'Le Petit Prince et le Secret du Renard',
    ]);
    const title = table.getByRole('columnheader', { name: 'Title', exact: true });
    await expect(title.getByRole('button').locator('svg')).toHaveClass(/lucide-arrow-up-down.*text-ink-400/);
    await title.getByRole('button').click();
    await expect(title.getByRole('button').locator('svg')).toHaveClass(/lucide-arrow-up/);
    await expect(title).toHaveAttribute('aria-sort', 'ascending');
    await expect(titles.first()).toHaveText("L'Art de Vivre dans un Café Parisien");
    // A no-match unmount must not reset the selected Library sort.
    const search = page.getByRole('searchbox', { name: 'Search title, source or text' });
    await search.fill('no-such-title-xyz');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(title).toHaveAttribute('aria-sort', 'ascending');
    await expect(titles.first()).toHaveText("L'Art de Vivre dans un Café Parisien");
    await search.fill('renard');
    await expect(titles).toHaveCount(1);
    const row = table.locator('tbody tr');
    const del = row.getByRole('button', { name: 'Delete', exact: true });
    await expect(del).toHaveAttribute('title', 'Delete');
    await del.click();
    const dialog = page.getByRole('dialog', { name: 'Delete this article?' });
    await expect(dialog).toContainText('Le Petit Prince et le Secret du Renard');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute('title', 'Edit');
    const level = table.locator('thead th').nth(1);
    const words = table.locator('thead th').nth(2);
    const added = table.locator('thead th').nth(3);
    if (phone) {
      await expect(level).toBeHidden();
      await expect(words).toBeHidden();
      await expect(added).toBeHidden();
      await expect(row).toContainText('B1');
    } else {
      await expect(level).toBeVisible();
      await words.getByRole('button').click();
      await expect(words).toHaveAttribute('aria-sort', 'descending');
      await added.getByRole('button').click();
      await expect(added).toHaveAttribute('aria-sort', 'descending');
    }
    await page.evaluate(() => document.fonts.ready);
    const rowBox = (await row.boundingBox())!;
    const deleteBox = (await del.boundingBox())!;
    expect(Math.abs(deleteBox.y + deleteBox.height / 2 - rowBox.y - rowBox.height / 2)).toBeLessThan(2);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await titles.click();
    await expect(page).toHaveURL(/#\/read\/petit-prince$/);
  });
}
