/** Reader transformation button rendering with TEST content and no browser; the workspace hides a reader no kind covers. */
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { freshDb } from './fixtures/storage';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { readerTestWindow } from './fixtures/readerTestWindow';
import { gradedReaderFixture, publishedReaderFixture } from './fixtures/gradedReaders';
import { Button } from '../src/components/ui/button';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { coveredKinds } from '../src/services/exercises/transform';
import { openReaderEdition } from '../src/storage/gradedReaders';
import { contentHash } from '../scripts/graded-readers/gateInputs';
import type { PublishedReader } from '../src/types/gradedReader';
import { READER_TRANSFORM_KINDS, type ReaderTransformKind } from '../src/types/readerTransform';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const { ReaderTransformSection } = await import('../src/components/graded/ReaderTransformSection');
const { GradedReaderWorkspace } = await import('../src/components/graded/GradedReaderWorkspace');
const { ReaderView } = await import('../src/components/ReaderView');
afterAll(restoreWindow);
const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const reader = publishedReaderFixture();
const vocabulary = { rows: [] } as unknown as VocabularyModel;
const noop = () => undefined;
let probe: ReturnType<typeof readerHookProbe>;
let undo: (() => void)[];
beforeEach(async () => {
  await freshDb();
  await i18n.changeLanguage('en');
  probe = readerHookProbe();
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: i18n.t.bind(i18n),
    i18n,
    ready: true,
  } as unknown as ReturnType<typeof translations.useTranslation>);
  undo = [() => translation.mockRestore()];
});
afterEach(() => {
  probe.restore();
  for (const restore of undo.reverse()) restore();
});
const draw = (kinds: readonly ReaderTransformKind[]) =>
  probe.render(() => ReaderTransformSection({ reader, kinds: [...kinds] }) as React.ReactNode);
function buttons(tree: React.ReactNode): React.ReactElement<React.ComponentProps<typeof Button>>[] {
  return React.Children.toArray(tree).flatMap((node) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
    return node.type === Button
      ? [node as React.ReactElement<React.ComponentProps<typeof Button>>]
      : buttons(node.props.children);
  });
}
function find<P>(node: React.ReactNode, type: React.ElementType): React.ReactElement<P> | undefined {
  const visit = (child: React.ReactNode): React.ReactElement<P> | undefined => {
    for (const item of React.Children.toArray(child)) {
      if (!React.isValidElement<{ children?: React.ReactNode }>(item)) continue;
      if (item.type === type) return item as React.ReactElement<P>;
      const found = visit(item.props.children);
      if (found) return found;
    }
    return undefined;
  };
  return visit(node);
}
const workspaceTree = (opened: Awaited<ReturnType<typeof openReaderEdition>>) =>
  probe.render(
    () => GradedReaderWorkspace({ opened, vocabulary, reload: noop, onOpenShadowingLog: noop }) as React.ReactNode,
  );
/** The practice sections hang off ReaderView's afterText prop, not off its children. */
const afterTextOf = (opened: Awaited<ReturnType<typeof openReaderEdition>>) => {
  const view = find<React.ComponentProps<typeof ReaderView>>(workspaceTree(opened), ReaderView);
  return (view?.props.afterText ?? null) as React.ReactNode;
};

test('both locales label every kind on the button and the unit', () => {
  for (const kind of READER_TRANSFORM_KINDS) {
    expect(typeof en.gradedReader.transform[kind]).toBe('string');
    expect(typeof zh.gradedReader.transform[kind]).toBe('string');
    for (const key of ['title', 'instruction', 'explanation'] as const) {
      expect(typeof en.readerTransform[kind][key]).toBe('string');
      expect(typeof zh.readerTransform[kind][key]).toBe('string');
    }
  }
});

for (const language of ['en', 'zh'] as const) {
  test(`${language}: one outlined button per offered kind, labelled from the locale`, async () => {
    await i18n.changeLanguage(language);
    const tree = draw(READER_TRANSFORM_KINDS);
    expect(renderToStaticMarkup(tree)).toContain('<h2 id="reader-transform"');
    const pressed = buttons(tree);
    expect(pressed).toHaveLength(READER_TRANSFORM_KINDS.length);
    pressed.forEach((button, index) => {
      expect(button.props['aria-label']).toBe(i18n.t(`gradedReader.transform.${READER_TRANSFORM_KINDS[index]}`));
      expect(button.props.disabled).toBe(false);
      expect(button.props.variant).toBe('outline');
    });
  });
}

test('a reader no kind covers offers no button', () => {
  expect(buttons(draw([]))).toHaveLength(0);
});

test('the workspace shows the section with exactly the covered kinds, and none for a verbless reader', async () => {
  const opened = await openReaderEdition(reader);
  // Every fixture sentence holds one verb and none is negated, so `question` is covered beside `negation`.
  expect(coveredKinds(opened.row.snapshot)).toEqual(['negation', 'question']);
  const afterText = afterTextOf(opened);
  const section = find<React.ComponentProps<typeof ReaderTransformSection>>(afterText, ReaderTransformSection);
  expect(section?.props.reader).toBe(opened.row.snapshot);
  expect(section?.props.kinds).toEqual(['negation', 'question']);

  const verbless = gradedReaderFixture();
  // `est` keeps a binding as a plain function word, so no sentence has a verb token and no kind is covered.
  verbless.glossary = [
    ...verbless.glossary.filter((entry) => entry.pos !== 'verb'),
    {
      id: 'etre-copula-function',
      lemma: 'est',
      pos: 'function',
      sense: 'copula',
      forms: ['est'],
      gloss: { en: 'TEST: is', zh: '测试：是' },
    },
  ];
  verbless.sentences = verbless.sentences.map((sentence) => ({
    ...sentence,
    tokens: sentence.tokens.map((token) => {
      const kept = token.entryIds.filter((id) => id !== 'etre-identity');
      return { ...token, entryIds: kept.length ? kept : ['etre-copula-function'] };
    }),
  }));
  const uncovered: PublishedReader = {
    schemaVersion: 1,
    body: verbless,
    version: contentHash(verbless),
    review: {
      contentHash: contentHash(verbless),
      reviewedBy: 'TEST ONLY synthetic reviewer',
      reviewedAt: '2026-10-23',
    },
  };
  expect(coveredKinds(uncovered)).toEqual([]);
  const bare = await openReaderEdition(uncovered);
  expect(find(afterTextOf(bare), ReaderTransformSection)).toBeUndefined();
  expect(find(workspaceTree(bare), ReaderTransformSection)).toBeUndefined();
});
