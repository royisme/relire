/** Invented TEST stage-inventory sentences for G5; synthetic inputs only, no language approval. */
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';
import type { GateContext } from '../../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../../scripts/graded-readers/drafts';
import { annotate, gateFixture, refreshPolicy, setStage } from './gradedReaderGates';

const entry = (id: string, lemma: string, pos: ReaderGlossaryEntry['pos'], forms: string[]): ReaderGlossaryEntry => ({
  id,
  lemma,
  pos,
  sense: 'test-sense',
  forms,
  gloss: { en: `TEST ${lemma}`, zh: '测试释义' },
  ...(pos === 'noun' && { gender: 'masculine' as const }),
});

interface Frame {
  /** Repeated across all three sentences; every other word is introduced before the word under test. */
  text: string;
  title: string;
  glossary: ReaderGlossaryEntry[];
  /** Choice distractor and typed answer must occur inside the sentence and never be verbs. */
  expected: string;
  distractor: string;
  typedAnswer: string;
}
const frames: Record<'y' | 'moi' | 'très', Frame> = {
  // il y a is the stage 3 target pattern; the verb group needs no person override (il selects 3sg).
  y: {
    text: 'Il y a un livre.',
    title: 'Livre',
    glossary: [
      entry('il-subject', 'il', 'function', ['il']),
      entry('f-y', 'y', 'function', ['y']),
      entry('avoir-have', 'avoir', 'verb', ['a']),
      entry('un-function', 'un', 'function', ['un']),
      entry('livre-object', 'livre', 'noun', ['livre']),
    ],
    expected: 'livre',
    distractor: 'y',
    typedAnswer: 'livre',
  },
  // The stressed pronoun is first met after c’est; ce and est enter at stage 1.
  moi: {
    text: 'C’est moi.',
    title: 'Moi',
    glossary: [
      entry('ce-function', 'ce', 'function', ['ce']),
      entry('etre-identity', 'être', 'verb', ['est']),
      entry('f-moi', 'moi', 'function', ['moi']),
    ],
    expected: 'moi',
    distractor: 'ce',
    typedAnswer: 'moi',
  },
  // A degree adverb absent from the introduced table: it must fail closed at every stage.
  très: {
    text: 'Le livre est très petit.',
    title: 'Livre',
    glossary: [
      entry('le-function', 'le', 'function', ['le']),
      entry('livre-object', 'livre', 'noun', ['livre']),
      entry('etre-identity', 'être', 'verb', ['est']),
      entry('f-tres', 'très', 'function', ['très']),
      entry('petit-size', 'petit', 'adjective', ['petit']),
    ],
    expected: 'très',
    distractor: 'livre',
    typedAnswer: 'petit',
  },
};

/** Builds a complete stage-`order` draft whose only unlisted-or-late function word is `word`. */
export function stageInventoryFixture(
  word: keyof typeof frames,
  order: number,
): { draft: ReaderDraft; context: GateContext } {
  const { draft, context } = gateFixture();
  const frame = frames[word];
  draft.body.title.fr = frame.title;
  draft.body.glossary = structuredClone(frame.glossary);
  for (const sentence of draft.body.sentences) {
    sentence.fr = frame.text;
    sentence.translation = { en: `TEST: ${frame.text}`, zh: '测试句。' };
    sentence.tokens = [];
  }
  const [choice, typed] = draft.body.learning.checkpoints[0].questions;
  choice.question.prompt = `{${frame.expected}|${frame.distractor}}.`;
  choice.question.expectedAnswer = frame.expected;
  choice.question.feedback.byAnswer![0].answer = frame.distractor;
  choice.evidence = { sentenceId: 's1', quote: frame.text };
  typed.question.prompt = '[___].';
  typed.question.expectedAnswer = frame.typedAnswer;
  typed.evidence = { sentenceId: 's2', quote: frame.text };
  context.core = draft.body.glossary
    .filter((item) => item.pos === 'function')
    .map(({ lemma: headword, sense, forms, gloss }) => ({ headword, pos: 'function' as const, sense, forms, gloss }));
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((item) => item.pos !== 'function').map(({ id: _id, ...item }) => item),
  );
  annotate(draft, context);
  setStage(draft, context, order);
  refreshPolicy(draft, context);
  return { draft, context };
}
