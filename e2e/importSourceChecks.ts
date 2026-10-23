/** Shared source-step regressions for the two import pages; owns no review/save assertions or real AI calls. */
import type { Page } from '@playwright/test';
import { test, expect, overflowing, layout } from './fixtures';
import { materialPdf, tinyPng } from './materialPdf';

interface SourceChecks {
  enter: (page: Page) => Promise<void>;
  textLabel: string;
  analyze: string;
  task: 'extract' | 'transcribe';
  answer: unknown;
  review: string;
}

const chooser = (page: Page) => page.getByLabel('Choose an image or PDF');
const previews = (page: Page) => page.getByLabel('Source previews');
const pdf = { name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf(6)) };

async function pasteFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.evaluate(
    (payloads) => {
      const data = new DataTransfer();
      for (const payload of payloads) {
        const bytes = Uint8Array.from(atob(payload.data), (character) => character.charCodeAt(0));
        data.items.add(new File([bytes], payload.name, { type: payload.mimeType }));
      }
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    },
    files.map((file) => ({ name: file.name, mimeType: file.mimeType, data: file.buffer.toString('base64') })),
  );
}

async function clean(page: Page, textLabel: string) {
  await expect(page.getByLabel(textLabel)).toHaveValue('');
  await expect(previews(page).getByRole('img')).toHaveCount(0);
  await expect(page.getByLabel('Pages to send')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveText('');
  await expect(page.getByRole('status')).toHaveText('');
  await expect(page.getByRole('button', { name: 'Discard', exact: true })).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
}

export function importSourceChecks({ enter, textLabel, analyze, task, answer, review }: SourceChecks) {
  for (const phone of [false, true]) {
    test(`source clear and discard stay in place, including wrong clipboard types and unreadable PDFs ${phone ? '@phone' : ''}`, async ({
      page,
      ai,
    }) => {
      void ai;
      await enter(page);
      // The chooser is a bordered drop area with a button and one help line, plus the hidden named picker.
      await expect(page.getByRole('button', { name: 'Choose images', exact: true })).toBeVisible();
      await expect(page.getByText('or drop or paste images here, up to 5')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const before = await layout(page, 'main button.w-44');
      await page.getByLabel(textLabel).fill('Wrong pasted text.');
      await page.getByRole('button', { name: 'Clear text', exact: true }).click();
      await clean(page, textLabel);
      await page.getByLabel(textLabel).fill('Discard this text.');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      await clean(page, textLabel);
      await pasteFiles(page, [{ name: 'wrong.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }]);
      await expect(page.getByRole('alert')).toContainText('Choose a PNG, JPEG, WebP image or a PDF file.');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      await clean(page, textLabel);
      await chooser(page).setInputFiles({
        name: 'broken.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('Not a PDF'),
      });
      await expect(page.getByRole('alert')).toContainText('The PDF could not be opened.');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      await clean(page, textLabel);
      expect(await layout(page, 'main button.w-44')).toEqual(before);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      if (phone) await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await expect(page).toHaveURL(/#\/settings/);
      await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toHaveCount(0);
    });

    test(`ordered images add by chooser, clipboard and whole-page drop, cap at five, remove and send in order ${phone ? '@phone' : ''}`, async ({
      page,
      ai,
    }) => {
      ai.answer({ [task]: answer });
      await enter(page);
      // Distinct, genuinely decodable pixels let the outbound payload prove reading order, not just file names.
      const pixels = await page.evaluate(() =>
        Array.from({ length: 7 }, (_, index) => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d')!;
          context.fillStyle = `rgb(${index * 35}, 50, 100)`;
          context.fillRect(0, 0, 1, 1);
          return canvas.toDataURL('image/png').split(',')[1];
        }),
      );
      const files = pixels.map((data, index) => ({
        name: index === 0 ? `${'long-file-name-'.repeat(8)}first.png` : `page-${index + 1}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(data, 'base64'),
      }));
      await page.evaluate(() => document.fonts.ready);
      const before = await layout(page, 'main button.w-44');
      await chooser(page).setInputFiles(files.slice(0, 2));
      await expect(previews(page).getByRole('img')).toHaveCount(2);
      await expect(page.getByRole('button', { name: analyze, exact: true })).toBeEnabled();
      await pasteFiles(page, files.slice(2, 4));
      await expect(previews(page).getByRole('img')).toHaveCount(4);
      await expect(page.getByRole('button', { name: analyze, exact: true })).toBeEnabled();
      await page
        .getByRole('heading', { name: task === 'extract' ? 'Import exercises' : 'Import an article', exact: true })
        .dispatchEvent('drop', {
          dataTransfer: await page.evaluateHandle(
            (payloads) => {
              const data = new DataTransfer();
              for (const payload of payloads) {
                data.items.add(
                  new File(
                    [Uint8Array.from(atob(payload.data), (character) => character.charCodeAt(0))],
                    payload.name,
                    {
                      type: 'image/png',
                    },
                  ),
                );
              }
              return data;
            },
            files.slice(4, 6).map((file) => ({ name: file.name, data: file.buffer.toString('base64') })),
          ),
        });
      await expect(previews(page).getByRole('img')).toHaveCount(5);
      await expect(previews(page).locator('figcaption')).toHaveText(files.slice(0, 5).map((file) => file.name));
      // Intake errors, including the cap, sit on one reserved line under the thumbnails.
      await expect(page.getByRole('alert')).toContainText('At most 5 images');
      await chooser(page).setInputFiles(files[5]);
      await expect(page.getByRole('alert')).toContainText('At most 5 images');
      await expect(previews(page).getByRole('img')).toHaveCount(5);
      await chooser(page).setInputFiles(pdf);
      await expect(page.getByRole('alert')).toContainText('Remove the held material');
      await expect(previews(page).getByRole('img')).toHaveCount(5);
      const remove = page.getByRole('button', { name: `Remove image ${files[1].name}`, exact: true });
      await expect(remove).toBeVisible();
      await remove.focus();
      await page.keyboard.press('Enter');
      await expect(previews(page).getByRole('img')).toHaveCount(4);
      await chooser(page).setInputFiles(files[6]);
      const indices = [0, 2, 3, 4, 6];
      await expect(previews(page).locator('figcaption')).toHaveText(indices.map((index) => files[index].name));
      await expect(page.getByRole('alert')).toHaveText('');
      const consent = page.getByRole('region', { name: task === 'transcribe' ? 'What is sent' : 'Before you send' });
      // Consent counts what leaves the device instead of repeating the filenames above.
      await expect(consent).toContainText('5 images, pages 1 to 5');
      expect(await layout(page, 'main button.w-44')).toEqual(before);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      if (phone) {
        // Below the small breakpoint the action row is a column of full-width, equal-height buttons.
        await page.evaluate(() => document.fonts.ready);
        const boxes = await Promise.all(
          [analyze, 'Cancel', 'Discard'].map((name) => page.getByRole('button', { name, exact: true }).boundingBox()),
        );
        expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
        expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y);
        for (const box of boxes) expect(box!.width).toBeGreaterThan(300);
      }
      const sent = page.waitForRequest(
        (request) => request.url().includes('generativelanguage') && request.method() === 'POST',
      );
      await page.getByRole('button', { name: analyze, exact: true }).click();
      const body = (await sent).postDataJSON() as { contents: { parts: { inlineData?: { data: string } }[] }[] };
      expect(
        body.contents
          .flatMap((content) => content.parts)
          .flatMap((part) => (part.inlineData ? [part.inlineData.data] : [])),
      ).toEqual(indices.map((index) => pixels[index]));
      await expect(page.getByRole('heading', { name: review, exact: true })).toBeVisible();
    });
  }

  test('PDF thumbnails follow the same five-page selection as consent and sending; remove, exclusion and invalid-page discard', async ({
    page,
    ai,
  }) => {
    ai.answer({ [task]: answer });
    await enter(page);
    await chooser(page).setInputFiles(pdf);
    await expect(previews(page).getByRole('img', { name: 'Page 1 of pages.pdf', exact: true })).toBeVisible();
    await chooser(page).setInputFiles(tinyPng);
    await expect(page.getByRole('alert')).toContainText('Remove the held material');
    await expect(previews(page).getByRole('img')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove file', exact: true }).click();
    await clean(page, textLabel);
    await chooser(page).setInputFiles(pdf);
    await page.getByLabel('Pages to send').fill('5,1-4');
    await expect(previews(page).getByRole('img')).toHaveCount(5);
    expect(
      await previews(page)
        .getByRole('img')
        .evaluateAll((images) => images.map((image) => image.getAttribute('alt'))),
    ).toEqual([1, 2, 3, 4, 5].map((page) => `Page ${page} of pages.pdf`));
    await page.getByLabel('Pages to send').fill('1-6');
    await expect(page.getByRole('alert')).toContainText('at most 5 pages');
    await expect(page.getByRole('button', { name: analyze, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await clean(page, textLabel);
    await chooser(page).setInputFiles(pdf);
    await expect(page.getByLabel('Pages to send')).toHaveValue('1');
    await page.getByLabel('Pages to send').fill('5,1-4');
    await expect(previews(page).getByRole('img')).toHaveCount(5);
    await expect(page.getByText('1 PDF, pages 1, 2, 3, 4, 5', { exact: true })).toBeVisible();
    const sent = page.waitForRequest(
      (request) => request.url().includes('generativelanguage') && request.method() === 'POST',
    );
    await page.getByRole('button', { name: analyze, exact: true }).click();
    const body = (await sent).postDataJSON() as { contents: { parts: { inlineData?: unknown }[] }[] };
    expect(body.contents.flatMap((content) => content.parts).filter((part) => part.inlineData)).toHaveLength(5);
    await expect(page.getByRole('heading', { name: review, exact: true })).toBeVisible();
  });

  test('a failed analysis keeps Discard usable; source controls disable only while running', async ({ page, ai }) => {
    ai.answer({
      [task]: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        throw new Error('Source analysis test failure');
      },
    });
    await enter(page);
    await chooser(page).setInputFiles(tinyPng);
    await expect(previews(page).getByRole('img')).toHaveCount(1);
    if (task === 'extract') await page.getByLabel(textLabel).fill('Additional worksheet text.');
    await page.getByRole('button', { name: analyze, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove image tiny.png', exact: true })).toBeDisabled();
    if (task === 'extract') await expect(page.getByRole('button', { name: 'Clear text', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Source analysis test failure');
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await clean(page, textLabel);
  });
}
