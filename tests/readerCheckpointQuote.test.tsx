/**
 * The checkpoint's quoted sentence stays hidden until the learner asks for it or a verdict commits it,
 * per question, and the reveal writes nothing. Element-tree only: Bun has no DOM, so the paragraph's own
 * ref stands in for the node a browser would focus and a stub document records activeElement.
 */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { createInstance } from 'i18next';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { gradedReaderFixture } from './fixtures/gradedReaders';
import { emptyAnswer } from '../src/services/exercises/answer';
import { Button } from '../src/components/ui/button';
import { ReaderCheckpoints, type ReaderQuestionAnswer } from '../src/components/graded/ReaderCheckpoints';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const learning = gradedReaderFixture().learning;
const [first, second] = learning.checkpoints[0]!.questions;
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

type Answers = Partial<Record<string, ReaderQuestionAnswer>>;
type Node = React.ReactElement<Record<string, unknown>>;
type FocusNode = { focus: (options?: FocusOptions) => void };

const choice = (value: string): ReaderQuestionAnswer => ({
  answer: { ...emptyAnswer({ prompt: first!.question.prompt, options: undefined }), choiceSelections: [value] },
  checked: null,
});
const checked = (answer: ReaderQuestionAnswer, correct: boolean): ReaderQuestionAnswer => ({
  ...answer,
  checked: { correct, strictAccents: true },
});

function nodes(tree: React.ReactNode): Node[] {
  const found: Node[] = [];
  function visit(node: React.ReactNode) {
    if (!React.isValidElement<Record<string, unknown>>(node)) return;
    found.push(node);
    React.Children.forEach(node.props.children as React.ReactNode, visit);
  }
  visit(tree);
  return found;
}
/** The paragraph that carries the quoted sentence: the only French-language paragraph in the section. */
const quoteParagraph = (tree: React.ReactNode) =>
  nodes(tree).find((node) => node.type === 'p' && node.props.lang === 'fr')!;
const showButton = (tree: React.ReactNode) =>
  nodes(tree).find(
    (node) => node.type === Button && node.props.children === t('gradedReader.checkpoints.showQuotedSentence'),
  );
const indexButton = (tree: React.ReactNode, number: number) =>
  nodes(tree).find(
    (node) => node.type === Button && String(node.props['aria-label']).includes(`question ${number} of`),
  )!;
const press = (node: Node) => (node.props.onClick as () => void)();

let probe: ReturnType<typeof readerHookProbe>;
let restoreTranslation: () => void;
let active: unknown;
const restoreDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

beforeEach(() => {
  probe = readerHookProbe();
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: i18n.t.bind(i18n),
    i18n,
    ready: true,
  } as unknown as ReturnType<typeof translations.useTranslation>);
  restoreTranslation = () => translation.mockRestore();
  active = null;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get activeElement() {
        return active;
      },
      set activeElement(node: unknown) {
        active = node;
      },
    },
  });
});
afterEach(() => {
  probe.restore();
  restoreTranslation();
  if (restoreDocument) Object.defineProperty(globalThis, 'document', restoreDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

function mount(answers: Answers = {}) {
  const writes = { change: mock(() => undefined), check: mock(() => undefined), redo: mock(() => undefined) };
  const draw = () =>
    probe.render(() =>
      ReaderCheckpoints({
        learning,
        answers,
        onChange: writes.change,
        onCheck: writes.check,
        onRedo: writes.redo,
        pending: null,
      }),
    );
  /** The paragraph node's ref, wired to the focus target a browser would put focus on. */
  const focusable = () => {
    const target: FocusNode = { focus: () => (active = target) };
    (quoteParagraph(draw()).props.ref as unknown as { current: FocusNode | null }).current = target;
    return target;
  };
  return { draw, writes, focusable };
}

test('before any action the quote is in the DOM but its paragraph is invisible, and the show button is offered', () => {
  const { draw } = mount();
  const paragraph = quoteParagraph(draw());
  expect(paragraph.props.children).toBe(first!.evidence.quote);
  expect(String(paragraph.props.className)).toContain('invisible');
  expect(showButton(draw())).toBeDefined();
});

test('the show button reveals the quote, disappears and hands focus to the paragraph', () => {
  const { draw, focusable } = mount();
  const target = focusable();
  expect(active).toBeNull();
  press(showButton(draw())!);
  probe.effects();
  const paragraph = quoteParagraph(draw());
  expect(String(paragraph.props.className)).not.toContain('invisible');
  expect(paragraph.props.tabIndex).toBe(-1);
  expect(showButton(draw())).toBeUndefined();
  // The button unmounts under the focus it held, so the revealed sentence must take it over.
  expect(active).toBe(target);
});

test('a committed verdict reveals the quote without pressing anything', () => {
  const { draw } = mount({ [first!.question.id]: checked(choice('un livre'), true) });
  expect(String(quoteParagraph(draw()).props.className)).not.toContain('invisible');
  expect(showButton(draw())).toBeUndefined();
});

test('the reveal is per question: question 2 keeps its button, question 1 stays revealed', () => {
  const { draw } = mount();
  press(showButton(draw())!);
  probe.effects();
  expect(String(quoteParagraph(draw()).props.className)).not.toContain('invisible');

  press(indexButton(draw(), 2));
  probe.effects();
  const second2 = quoteParagraph(draw());
  expect(second2.props.children).toBe(second!.evidence.quote);
  expect(String(second2.props.className)).toContain('invisible');
  expect(showButton(draw())).toBeDefined();

  press(indexButton(draw(), 1));
  probe.effects();
  expect(quoteParagraph(draw()).props.children).toBe(first!.evidence.quote);
  expect(String(quoteParagraph(draw()).props.className)).not.toContain('invisible');
  expect(showButton(draw())).toBeUndefined();
});

test('the hint writes nothing: no change, check or redo callback fires', () => {
  const { draw, writes } = mount();
  press(showButton(draw())!);
  probe.effects();
  expect(String(quoteParagraph(draw()).props.className)).not.toContain('invisible');
  // The component is controlled: the reveal is component state only, never an answer, attempt or save.
  expect(writes.change).not.toHaveBeenCalled();
  expect(writes.check).not.toHaveBeenCalled();
  expect(writes.redo).not.toHaveBeenCalled();
});
