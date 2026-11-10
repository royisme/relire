/** Invented TEST noun subjects with pre-nominal adjectives; G4 steps back over adjectives to the determiner. */
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';
import { memoryLexicon } from '../../scripts/graded-readers/lexiconIndex';
import type { GateContext } from '../../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../../scripts/graded-readers/drafts';
import { annotate, gateFixture, refreshPolicy, setStage, testRows } from './gradedReaderGates';

const genders = { chambre: 'feminine', cahier: 'masculine' } as const;
type AdjectiveForms = Record<'fs' | 'fp' | 'ms' | 'mp', string>;
const adjectives: Record<'petit' | 'joli' | 'beau', AdjectiveForms> = {
  petit: { fs: 'petite', fp: 'petites', ms: 'petit', mp: 'petits' },
  joli: { fs: 'jolie', fp: 'jolies', ms: 'joli', mp: 'jolis' },
  beau: { fs: 'belle', fp: 'belles', ms: 'beau', mp: 'beaux' },
};

export interface AdjectiveSubject {
  /** Omitted for a pre-nominal adjective with no determiner before it. */
  determiner?: string;
  noun: keyof typeof genders;
  nounNumber: 'singular' | 'plural';
  /** Pre-nominal adjectives standing between the determiner and the noun. */
  adjectiveCount: 1 | 2;
  verbPerson: '3sg' | '3pl';
}

const entry = (
  id: string,
  lemma: string,
  pos: ReaderGlossaryEntry['pos'],
  forms: string[],
  gender?: ReaderGlossaryEntry['gender'],
): ReaderGlossaryEntry => ({
  id,
  lemma,
  pos,
  sense: 'test-sense',
  forms,
  gloss: { en: `TEST ${lemma}`, zh: '测试释义' },
  ...(pos === 'noun' && { gender: gender ?? 'masculine' }),
});

/**
 * Stage 3 introduces demonstratives and adjective agreement. The feminine noun stands behind cette, the masculine
 * plural noun behind mes: the gates read number only, and invented TEST content carries no gender-agreement claim.
 */
export function adjectiveSubjectFixture(subject: AdjectiveSubject): { draft: ReaderDraft; context: GateContext } {
  const { draft, context } = gateFixture();
  const slot = `${genders[subject.noun][0]}${subject.nounNumber === 'singular' ? 's' : 'p'}` as keyof AdjectiveForms;
  const noun = subject.nounNumber === 'singular' ? subject.noun : `${subject.noun}s`;
  const prenominal: ('petit' | 'joli')[] = subject.adjectiveCount === 1 ? ['petit'] : ['joli', 'petit'];
  const verb = subject.verbPerson === '3sg' ? 'est' : 'sont';
  const words = [
    ...(subject.determiner ? [subject.determiner] : []),
    ...prenominal.map((lemma) => adjectives[lemma][slot]),
    noun,
    verb,
    adjectives.beau[slot],
  ];
  const text = `${words[0]![0]!.toUpperCase()}${words[0]!.slice(1)} ${words.slice(1).join(' ')}.`;
  draft.body.title.fr = `${noun[0]!.toUpperCase()}${noun.slice(1)}`;
  draft.body.glossary = [
    entry('noun-subject', subject.noun, 'noun', [noun], genders[subject.noun]),
    entry('etre-identity', 'être', 'verb', [verb]),
    ...prenominal.map((lemma, i) => entry(`${lemma}-prenominal-${i}`, lemma, 'adjective', [adjectives[lemma][slot]])),
    entry('beau-predicate', 'beau', 'adjective', [adjectives.beau[slot]]),
    ...(subject.determiner
      ? [entry(`f-${subject.determiner}`, subject.determiner, 'function', [subject.determiner])]
      : []),
  ];
  for (const sentence of draft.body.sentences) {
    sentence.fr = text;
    sentence.translation = {
      en: `TEST: The ${subject.nounNumber} noun subject is described.`,
      zh: subject.nounNumber === 'singular' ? '测试：单数名词主语。' : '测试：复数名词主语。',
    };
    sentence.tokens = [];
  }
  // Answers extract the final predicate adjective, which is never the capitalized sentence-initial word.
  const [choice, typed] = draft.body.learning.checkpoints[0].questions;
  choice.question.prompt = `{${adjectives.beau[slot]}|${noun}}.`;
  choice.question.expectedAnswer = adjectives.beau[slot];
  choice.question.feedback.byAnswer![0].answer = noun;
  choice.evidence = { sentenceId: 's1', quote: text };
  typed.question.prompt = '[___].';
  typed.question.expectedAnswer = adjectives.beau[slot];
  typed.evidence = { sentenceId: 's2', quote: text };
  // Core is the reviewed syllabus-wide function inventory; the no-determiner case still carries an unused article entry.
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
    { form: noun, lemma: subject.noun, pos: 'noun', slot: subject.nounNumber },
    ...prenominal.map((lemma) => ({
      form: adjectives[lemma][slot],
      lemma,
      pos: 'adjective' as const,
      slot,
    })),
    { form: adjectives.beau[slot], lemma: 'beau', pos: 'adjective', slot },
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
