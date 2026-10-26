/** Invented TEST noun subjects with a determiner; G4 checks the number only, never gender agreement. */
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';
import { memoryLexicon } from '../../scripts/graded-readers/lexiconIndex';
import type { GateContext } from '../../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../../scripts/graded-readers/drafts';
import { annotate, gateFixture, refreshPolicy, setStage, testRows } from './gradedReaderGates';

export interface DeterminerSubject {
  /** Omitted for a bare noun subject with no determiner at all. */
  determiner?: string;
  nounNumber: 'singular' | 'plural';
  verbPerson: '3sg' | '3pl';
}

const entry = (id: string, lemma: string, pos: ReaderGlossaryEntry['pos'], forms: string[]): ReaderGlossaryEntry => ({
  id,
  lemma,
  pos,
  sense: 'test-sense',
  forms,
  gloss: { en: `TEST ${lemma}`, zh: '测试释义' },
  ...(pos === 'noun' && { gender: 'masculine' as const }),
});

/**
 * Stage 3 introduces every tested determiner (possessives at 2, cet/cette/ces at 3). One masculine noun stands in
 * for all determiners: the gates read number, and invented TEST content carries no gender-agreement claim.
 */
export function determinerSubjectFixture(subject: DeterminerSubject): { draft: ReaderDraft; context: GateContext } {
  const { draft, context } = gateFixture();
  const noun = subject.nounNumber === 'singular' ? 'frère' : 'frères';
  const adjective = subject.nounNumber === 'singular' ? 'petit' : 'petits';
  const verb = subject.verbPerson === '3sg' ? 'est' : 'sont';
  const words = [...(subject.determiner ? [subject.determiner] : []), noun, verb, adjective];
  const text = `${words[0]![0]!.toUpperCase()}${words[0]!.slice(1)} ${words.slice(1).join(' ')}.`;
  draft.body.title.fr = `${noun[0]!.toUpperCase()}${noun.slice(1)}`;
  draft.body.glossary = [
    entry('brother-family', 'frère', 'noun', [noun]),
    entry('etre-identity', 'être', 'verb', [verb]),
    entry('petit-size', 'petit', 'adjective', [adjective]),
    ...(subject.determiner
      ? [entry(`f-${subject.determiner}`, subject.determiner, 'function', [subject.determiner])]
      : []),
  ];
  for (const sentence of draft.body.sentences) {
    sentence.fr = text;
    sentence.translation = {
      en: `TEST: ${subject.nounNumber === 'singular' ? 'The brother is' : 'The brothers are'} small.`,
      zh: subject.nounNumber === 'singular' ? '测试：兄弟很小。' : '测试：兄弟们很小。',
    };
    sentence.tokens = [];
  }
  // Answers extract the final adjective, which is never the capitalized sentence-initial word.
  const [choice, typed] = draft.body.learning.checkpoints[0].questions;
  choice.question.prompt = `{${adjective}|${noun}}.`;
  choice.question.expectedAnswer = adjective;
  choice.question.feedback.byAnswer![0].answer = noun;
  choice.evidence = { sentenceId: 's1', quote: text };
  typed.question.prompt = '[___].';
  typed.question.expectedAnswer = adjective;
  typed.evidence = { sentenceId: 's2', quote: text };
  // Core is the reviewed syllabus-wide function inventory; the bare-noun case still carries an unused article entry.
  const determinerEntry = draft.body.glossary.find((item) => item.id === `f-${subject.determiner}`);
  context.core = determinerEntry
    ? [
        {
          headword: determinerEntry.lemma,
          pos: 'function' as const,
          sense: determinerEntry.sense,
          forms: determinerEntry.forms,
          gloss: determinerEntry.gloss,
        },
      ]
    : [
        {
          headword: 'un',
          pos: 'function' as const,
          sense: 'article',
          forms: ['un'],
          gloss: { en: 'TEST article', zh: '测试冠词' },
        },
      ];
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((item) => item.pos !== 'function').map(({ id: _id, ...item }) => item),
  );
  context.lexicon = memoryLexicon([
    ...testRows,
    { form: noun, lemma: 'frère', pos: 'noun', slot: subject.nounNumber },
    { form: adjective, lemma: 'petit', pos: 'adjective', slot: subject.nounNumber === 'singular' ? 'ms' : 'mp' },
    { form: verb, lemma: 'être', pos: 'verb', slot: `tenses.present.${subject.verbPerson}` },
  ]);
  annotate(draft, context);
  for (const analysis of draft.analyses)
    if (analysis.entryId === 'etre-identity')
      analysis.verb = { kind: 'finite', tense: 'present', person: subject.verbPerson };
  setStage(draft, context, 3);
  refreshPolicy(draft, context);
  return { draft, context };
}
