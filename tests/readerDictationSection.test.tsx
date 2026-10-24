/** Reader dictation button rendering and committed-save navigation with TEST content and disposable IndexedDB, no browser. */
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { freshDb } from './fixtures/storage';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { readerTestWindow } from './fixtures/readerTestWindow';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { Button } from '../src/components/ui/button';
import * as storage from '../src/storage/exercises';
import * as preparation from '../src/services/exercises/fromReader';
import type { ExerciseUnit } from '../src/types/exercises';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const navigation = await import('../src/hooks/useRoute');
const { ReaderDictationSection } = await import('../src/components/graded/ReaderDictationSection');
afterAll(restoreWindow);
const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const reader = publishedReaderFixture();
let probe: ReturnType<typeof readerHookProbe>;
let undo: (() => void)[];
beforeEach(async () => {
  await freshDb();
  await i18n.changeLanguage('en');
  probe = readerHookProbe();
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: i18n.t.bind(i18n), i18n } as never);
  undo = [() => translation.mockRestore()];
});
afterEach(() => {
  probe.restore();
  for (const restore of undo.reverse()) restore();
});
const draw = () => probe.render(() => ReaderDictationSection({ reader }));
function buttons(tree: React.ReactNode): React.ReactElement<React.ComponentProps<typeof Button>>[] {
  return React.Children.toArray(tree).flatMap((node) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
    return node.type === Button
      ? [node as React.ReactElement<React.ComponentProps<typeof Button>>]
      : buttons(node.props.children);
  });
}
const press = (button: ReturnType<typeof buttons>[number]) =>
  button.props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(5);
  expect(done()).toBe(true);
}

for (const language of ['en', 'zh']) {
  test(`${language}: heading, description and one outline action with a permanent status slot`, async () => {
    await i18n.changeLanguage(language);
    const tree = draw();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain(`<h2 id="reader-dictation"`);
    for (const key of ['title', 'description', 'action'])
      expect(html).toContain(i18n.t(`gradedReader.dictation.${key}`).replaceAll("'", '&#x27;'));
    expect(buttons(tree)).toHaveLength(1);
    expect(buttons(tree)[0].props.variant).toBe('outline');
    expect(buttons(tree)[0].props.disabled).toBe(false);
    expect(html).toContain('min-w-40');
    expect(html).toContain('h-4 w-4');
    expect(html).toContain('h-20 overflow-auto');
    expect(html).toContain('role="status"');
    expect(html).not.toContain(i18n.t('common.retry'));
  });
}

test('a press commits the real prepared listening unit before navigating; busy swaps only the reserved label slot', async () => {
  await i18n.changeLanguage('zh');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = storage.saveUnits;
  const save = spyOn(storage, 'saveUnits').mockImplementation(async (units) => {
    await pending;
    return original(units);
  });
  const navigate = spyOn(navigation, 'navigate').mockImplementation(() => undefined);
  undo.push(
    () => save.mockRestore(),
    () => navigate.mockRestore(),
  );
  draw();
  probe.effects();
  press(buttons(draw())[0]);
  const busy = draw();
  expect(buttons(busy)[0].props.disabled).toBe(true);
  expect(buttons(busy)[0].props['aria-busy']).toBe(true);
  const busyHtml = renderToStaticMarkup(busy);
  expect(busyHtml).toContain('animate-spin');
  expect(busyHtml).toContain('row-start-1 invisible');
  expect(busyHtml).toContain('h-20 overflow-auto');
  expect(navigate).not.toHaveBeenCalled();
  expect(await storage.listUnits()).toEqual([]);
  release();
  await until(() => navigate.mock.calls.length === 1);
  const units = await storage.listUnits();
  expect(units).toHaveLength(1);
  const [unit] = units;
  expect(unit.learningArea).toBe('listening');
  expect(unit.type).toBe('NUMBER_DICTATION');
  expect(unit.setId).toBeTruthy();
  expect(unit.setTitle).toBe(reader.body.title.fr);
  unit.items.forEach((item, index) => {
    expect(item.prompt).toBe(reader.body.sentences[index].translation.zh);
    expect(item.meta).toEqual({
      source: 'reader-dictation',
      readerId: reader.body.id,
      version: reader.version,
      sentenceId: reader.body.sentences[index].id,
      strictAccents: true,
      ignoreSentencePunctuation: true,
      playbackEngine: 'device',
    });
  });
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith({ name: 'practiceSet', area: 'listening', setId: unit.setId });
});

test('a failed save shows its real message and Retry, which saves the identical prepared batch', async () => {
  const originalSave = storage.saveUnits;
  const originalPrepare = preparation.prepareReaderDictation;
  const batches: ExerciseUnit[][] = [];
  const prepare = spyOn(preparation, 'prepareReaderDictation').mockImplementation(originalPrepare);
  const save = spyOn(storage, 'saveUnits').mockImplementation(async (units) => {
    batches.push(units);
    if (batches.length === 1) throw new Error('TEST quota denied');
    return originalSave(units);
  });
  const navigate = spyOn(navigation, 'navigate').mockImplementation(() => undefined);
  undo.push(
    () => save.mockRestore(),
    () => prepare.mockRestore(),
    () => navigate.mockRestore(),
  );
  draw();
  probe.effects();
  press(buttons(draw())[0]);
  await until(() => buttons(draw()).length === 2);
  const failed = draw();
  const html = renderToStaticMarkup(failed);
  expect(html).toContain(i18n.t('gradedReader.saveError', { msg: 'TEST quota denied' }));
  expect(html).toContain('h-20 overflow-auto');
  expect(html).toContain('role="status"');
  const retry = buttons(failed).find((button) => button.props.children === i18n.t('common.retry'))!;
  expect(retry.props.variant).toBe('ghost');
  expect(navigate).not.toHaveBeenCalled();
  expect(await storage.listUnits()).toEqual([]);
  press(retry);
  await until(() => navigate.mock.calls.length === 1);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(batches).toHaveLength(2);
  expect(batches[1]).toBe(batches[0]);
  expect(await storage.listUnits()).toEqual(batches[0]);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith({ name: 'practiceSet', area: 'listening', setId: batches[0][0].setId });
  expect(renderToStaticMarkup(draw())).not.toContain('TEST quota denied');
});
