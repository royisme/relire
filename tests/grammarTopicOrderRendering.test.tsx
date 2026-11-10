/** TEST-only Topics rendering and footer actions through real fake-IndexedDB marks, without a DOM. */
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { freshDb } from './fixtures/storage';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { readerTestWindow } from './fixtures/readerTestWindow';
import { bookList, topicFixture } from './fixtures/grammarTopics';
import { learningFixture } from './fixtures/grammarLearning';
import * as topicsHook from '../src/hooks/useGrammarTopics';
import * as marksStorage from '../src/storage/topicStudied';
import { Button } from '../src/components/ui/button';
import type { GrammarTag } from '../src/types/grammar';
import '../src/i18n';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const { default: TopicsPage } = await import('../src/components/study/grammar/TopicsPage');
afterAll(restoreWindow);
const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
let probe: ReturnType<typeof readerHookProbe>;
let undo: (() => void)[];
let result: ReturnType<typeof topicsHook.useGrammarTopics>;
beforeEach(async () => {
  await freshDb();
  await i18n.changeLanguage('en');
  probe = readerHookProbe();
  result = { status: 'ready', topics: bookList };
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: i18n.t.bind(i18n), i18n } as never);
  const topics = spyOn(topicsHook, 'useGrammarTopics').mockImplementation(() => result);
  undo = [() => translation.mockRestore(), () => topics.mockRestore()];
});
afterEach(() => {
  probe.restore();
  for (const restore of undo.reverse()) restore();
});
type Element = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
function nodes(tree: React.ReactNode): Element[] {
  return React.Children.toArray(tree).flatMap((node) =>
    React.isValidElement<Element['props']>(node) ? [node, ...nodes(node.props.children)] : [],
  );
}
const invoke = (element: Element) => (element.type as (props: Element['props']) => React.ReactNode)(element.props);
function draw(props: { topicId?: string; tag?: GrammarTag } = {}) {
  return probe.render(() => {
    const tree = invoke(TopicsPage(props));
    const footerElement = nodes(tree).find(
      (node) => typeof node.type === 'function' && node.type.name === 'TopicFooter',
    );
    return { tree, footer: footerElement ? invoke(footerElement) : undefined };
  });
}
function action(footer: React.ReactNode) {
  return nodes(footer).find((node) => node.type === Button) as React.ReactElement<React.ComponentProps<typeof Button>>;
}
async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(5);
  expect(done()).toBe(true);
}
const html = (tree: React.ReactNode) => renderToStaticMarkup(tree);

for (const language of ['en', 'zh'] as const) {
  test(`${language}: numbered list uses book order, committed studied marks and the first unstudied Next`, async () => {
    await i18n.changeLanguage(language);
    await marksStorage.markTopicStudied('test-one', 100);
    draw();
    probe.effects();
    await until(() => html(draw().tree).includes(i18n.t('grammarTopics.studied')));
    const output = html(draw().tree);
    const rows = output.match(/<li[\s\S]*?<\/li>/g)!;
    expect(rows).toHaveLength(3);
    for (const [index, position] of [1, 2, 8].entries()) {
      expect(rows[index]).toContain(`>${position}</span>`);
      expect(rows[index]).toContain(`TEST ${language === 'zh' ? 'zh ' : ''}${['one', 'two', 'eight'][index]}`);
      expect(rows[index].includes(i18n.t('grammarTopics.studied'))).toBe(index === 0);
    }
    expect(output.indexOf(i18n.t('grammarTopics.chapters.chapter-one'))).toBeLessThan(
      output.indexOf(i18n.t('grammarTopics.chapters.chapter-eight')),
    );
    expect(output).toContain(i18n.t('grammarTopics.orderNote'));
    expect(output).toContain(`<a href="#/grammar/topics/test-two" class="inline-flex`);
    expect(output).toContain(i18n.t('grammarTopics.next', { title: bookList[1].title[language] }));
    expect(output).toContain('h-16 overflow-auto');
    await marksStorage.markTopicStudied('test-two', 101);
    await marksStorage.markTopicStudied('test-eight', 102);
    const complete = html(draw().tree);
    expect(complete).toContain(i18n.t('grammarTopics.allStudied'));
    expect(complete).not.toContain(i18n.t('grammarTopics.next', { title: bookList[0].title[language] }));
    expect(complete.match(/<a /g)).toHaveLength(3);
  });
}

test('tag filtering keeps book order and suppresses Next and all-studied text', async () => {
  draw({ tag: 'articles' });
  probe.effects();
  await marksStorage.markTopicStudied('test-one', 100);
  const output = html(draw({ tag: 'articles' }).tree);
  const rows = output.match(/<li[\s\S]*?<\/li>/g)!;
  expect(rows).toHaveLength(2);
  expect(rows[0]).toContain('>1</span>');
  expect(rows[1]).toContain('>8</span>');
  expect(output).not.toContain('TEST two');
  expect(output.match(/<a /g)).toHaveLength(3);
  expect(output).not.toContain(i18n.t('grammarTopics.next', { title: 'TEST eight' }));
  expect(output).not.toContain(i18n.t('grammarTopics.allStudied'));
});

test('reader footer toggles committed mark/unmark, reserves busy/error slots and links to the next position', async () => {
  result.topic = { ...topicFixture(), id: 'test-one' };
  const props = { topicId: 'test-one' };
  draw(props);
  probe.effects();
  await Bun.sleep(10);
  const clock = spyOn(Date, 'now').mockReturnValue(12345);
  const originalMark = marksStorage.markTopicStudied;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mark = spyOn(marksStorage, 'markTopicStudied').mockImplementation(async (id, at) => {
    await wait;
    await originalMark(id, at);
  });
  undo.push(
    () => clock.mockRestore(),
    () => mark.mockRestore(),
  );
  let footer = draw(props).footer;
  expect(action(footer).props.variant).toBe('outline');
  expect(action(footer).props['aria-label']).toBe(i18n.t('grammarTopics.markStudied'));
  action(footer).props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
  footer = draw(props).footer;
  expect(action(footer).props.disabled).toBe(true);
  expect(html(footer)).toContain('animate-spin');
  expect(await marksStorage.listTopicStudied()).toEqual([]);
  release();
  await until(() => !action(draw(props).footer).props.disabled);
  expect(await marksStorage.listTopicStudied()).toEqual([{ topicId: 'test-one', at: 12345 }]);
  footer = draw(props).footer;
  expect(action(footer).props['aria-label']).toBe(i18n.t('grammarTopics.unmarkStudied'));
  expect(html(footer)).toContain('href="#/grammar/topics/test-two"');
  expect(html(footer)).toContain(i18n.t('grammarTopics.nextTopic', { title: 'TEST two' }));
  expect(html(footer)).toContain('h-20 overflow-auto');
  expect(html(footer)).toContain('role="status"');
  action(footer).props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
  await until(() => !action(draw(props).footer).props.disabled);
  expect(await marksStorage.listTopicStudied()).toEqual([]);
  expect(action(draw(props).footer).props['aria-label']).toBe(i18n.t('grammarTopics.markStudied'));
});

for (const studied of [false, true]) {
  test(`failed ${studied ? 'unmark' : 'mark'} preserves storage and displays its real write error`, async () => {
    result.topic = { ...topicFixture(), id: 'test-one' };
    if (studied) await marksStorage.markTopicStudied('test-one', 100);
    const props = { topicId: 'test-one' };
    draw(props);
    probe.effects();
    await Bun.sleep(10);
    const write = spyOn(marksStorage, studied ? 'unmarkTopicStudied' : 'markTopicStudied').mockRejectedValue(
      new Error('TEST write denied'),
    );
    undo.push(() => write.mockRestore());
    action(draw(props).footer).props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
    await until(() => html(draw(props).footer).includes('TEST write denied'));
    expect(html(draw(props).footer)).toContain(i18n.t('grammarTopics.markError', { msg: 'TEST write denied' }));
    expect(await marksStorage.listTopicStudied()).toHaveLength(studied ? 1 : 0);
  });
}

test('the last topic has a mark button but no Next topic link', () => {
  result.topic = { ...topicFixture(), id: 'test-eight' };
  const { footer } = draw({ topicId: 'test-eight' });
  expect(action(footer)).toBeDefined();
  expect(nodes(footer).some((node) => 'to' in node.props)).toBe(false);
});

test('learning topics get the same footer outside the learning branch', () => {
  result.topic = learningFixture();
  const { tree, footer } = draw({ topicId: result.topic.id });
  expect(nodes(tree).some((node) => typeof node.type === 'function' && node.type.name === 'TopicLearning')).toBe(true);
  expect(footer).toBeDefined();
  expect(action(footer).props['aria-label']).toBe(i18n.t('grammarTopics.markStudied'));
});

for (const listError of [undefined, 'TEST list denied']) {
  test(`an unavailable list (${listError ?? 'pending'}) leaves marking usable without a footer Next or duplicate error`, async () => {
    result = { status: 'ready', topic: { ...topicFixture(), id: 'test-one' }, listError };
    const props = { topicId: 'test-one' };
    const { tree, footer } = draw(props);
    probe.effects();
    expect(nodes(footer).some((node) => 'to' in node.props)).toBe(false);
    expect(html(footer)).not.toContain('TEST list denied');
    if (listError) expect(nodes(tree).some((node) => node.props.role === 'alert')).toBe(true);
    action(footer).props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
    await until(() => !action(draw(props).footer).props.disabled);
    expect(await marksStorage.listTopicStudied()).toHaveLength(1);
  });
}
