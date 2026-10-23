/** Invented TEST elision scenarios: glossing c’/j’/l’/s’il by the surface or the expanded word. */
import { memoryLexicon } from '../../scripts/graded-readers/lexiconIndex';
import type { GateContext } from '../../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../../scripts/graded-readers/drafts';
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';
import { annotate, gateFixture, refreshPolicy, setStage, testRows } from './gradedReaderGates';

/** Glossary forms per elided word: the expansion (ce), the surface (c’), or both. */
export interface ElisionForms {
  ce: string[];
  je: string[];
  le: string[];
}
export const expandedForms: ElisionForms = { ce: ['ce'], je: ['je'], le: ['le'] };
export const surfaceForms: ElisionForms = { ce: ['c’'], je: ['j’'], le: ['l’'] };
export const bothForms: ElisionForms = { ce: ['ce', 'c’'], je: ['je', 'j’'], le: ['le', 'l’'] };

const entry = (id: string, lemma: string, pos: ReaderGlossaryEntry['pos'], forms: string[]): ReaderGlossaryEntry => ({
  id,
  lemma,
  pos,
  sense: 'test-sense',
  forms,
  gloss: { en: `TEST ${lemma}`, zh: '测试释义' },
  ...(pos === 'noun' && { gender: 'masculine' as const }),
});

/** C’est capitalised and sentence-initial, J’ai, plus lowercase mid-sentence c’est and l’a. */
export function elisionFixture(forms: ElisionForms = expandedForms): { draft: ReaderDraft; context: GateContext } {
  const { draft, context } = gateFixture();
  const rewrites: [string, string, { en: string; zh: string }][] = [
    ['s2', 'J’ai un livre.', { en: 'TEST: I have a book.', zh: '测试：我有一本书。' }],
    ['s3', 'Un livre, c’est petit.', { en: 'TEST: A book, it is small.', zh: '测试：一本书，它很小。' }],
  ];
  for (const [id, fr, translation] of rewrites) {
    const sentence = draft.body.sentences.find((item) => item.id === id)!;
    sentence.fr = fr;
    sentence.translation = translation;
    sentence.tokens = [];
  }
  draft.body.sentences.push({
    id: 's4',
    fr: 'Il l’a.',
    translation: { en: 'TEST: He has it.', zh: '测试：他有了它。' },
    tokens: [],
  });
  draft.body.glossary = [
    entry('livre-object', 'livre', 'noun', ['livre']),
    entry('etre-identity', 'être', 'verb', ['est']),
    entry('avoir-possession', 'avoir', 'verb', ['ai', 'a']),
    entry('petit-size', 'petit', 'adjective', ['petit']),
    entry('ce-function', 'ce', 'function', forms.ce),
    entry('je-subject', 'je', 'function', forms.je),
    entry('un-function', 'un', 'function', ['un']),
    entry('le-function', 'le', 'function', forms.le),
    entry('il-function', 'il', 'function', ['il']),
  ];
  const choice = draft.body.learning.checkpoints[0].questions[0];
  choice.question.prompt = 'C’est {un livre|un petit livre}.';
  choice.question.feedback.byAnswer![0].answer = 'un petit livre';
  const typed = draft.body.learning.checkpoints[0].questions[1];
  typed.question.prompt = 'J’ai [___].';
  typed.question.expectedAnswer = 'un livre';
  typed.question.instruction = {
    en: 'TEST: Copy the book phrase from sentence two.',
    zh: '测试：抄写第二句的书本词组。',
  };
  typed.question.feedback.correct = {
    summary: { en: 'TEST: Sentence two uses un livre.', zh: '测试：第二句用的是 un livre。' },
  };
  typed.question.feedback.incorrect = {
    summary: { en: 'TEST: Copy the words after J’ai.', zh: '测试：抄写 J’ai 后面的词。' },
  };
  typed.evidence = { sentenceId: 's2', quote: 'J’ai un livre.' };
  context.core = draft.body.glossary
    .filter((item) => item.pos === 'function')
    .map(({ lemma: headword, sense, forms, gloss }) => ({ headword, pos: 'function' as const, sense, forms, gloss }));
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((item) => item.pos !== 'function').map(({ id: _id, ...item }) => item),
  );
  context.lexicon = memoryLexicon([
    ...testRows,
    { form: 'ai', lemma: 'avoir', pos: 'verb', slot: 'tenses.present.1sg' },
  ]);
  annotate(draft, context);
  firstPersonAvoir(draft);
  refreshPolicy(draft, context);
  return { draft, context };
}

/** s’il is the one elision whose expansion the tokenizer fixes to si; si is a late clause marker, hence stage 6. */
export function siElisionFixture(): { draft: ReaderDraft; context: GateContext } {
  const { draft, context } = elisionFixture();
  draft.body.sentences.push({
    id: 's5',
    fr: 'S’il est petit.',
    translation: { en: 'TEST: If it is small.', zh: '测试：如果它很小。' },
    tokens: [],
  });
  draft.body.glossary.push(entry('si-condition', 'si', 'adverb', ['si']));
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((item) => item.pos !== 'function').map(({ id: _id, ...item }) => item),
  );
  context.evidence.clauseMarkers = [{ form: 'si', topicId: 'yes-no-questions' }];
  annotate(draft, context);
  firstPersonAvoir(draft);
  setStage(draft, context, 6);
  return { draft, context };
}

/** ai (J’ai) is the only first-person avoir atom; every other avoir atom spells a (Il l’a). */
function firstPersonAvoir(draft: ReaderDraft) {
  for (const analysis of draft.analyses)
    if (analysis.entryId === 'avoir-possession')
      analysis.verb = { kind: 'finite', tense: 'present', person: analysis.ordinal === 0 ? '1sg' : '3sg' };
}
