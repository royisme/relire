/** Invented TEST verb constructions with explicit synthetic slots; not production language material. */
import type { ReaderGlossaryEntry } from '../../src/types/gradedReader';
import { generateVerb } from '../../src/services/conjugation/generate';
import { annotate, gateFixture, refreshPolicy, setStage, testRows } from './gradedReaderGates';
import { memoryLexicon, type LexiconCandidate } from '../../scripts/graded-readers/lexiconIndex';
import type { ReaderDraft } from '../../scripts/graded-readers/drafts';

export type VerbCase =
  | 'modal-infinitive'
  | 'near-future'
  | 'recent-past'
  | 'passeCompose'
  | 'imperatif'
  | 'imparfait'
  | 'futur';
export function verbScenario(kind: VerbCase) {
  const { draft, context } = gateFixture();
  const specs: Record<
    VerbCase,
    { text: string; stage: number; head: string; lemma: string; slot: string; main?: string }
  > = {
    'modal-infinitive': {
      text: 'Il veut lire un livre.',
      stage: 6,
      head: 'veut',
      lemma: 'vouloir',
      slot: 'tenses.present.3sg',
      main: 'lire',
    },
    'near-future': {
      text: 'Il va lire un livre.',
      stage: 8,
      head: 'va',
      lemma: 'aller',
      slot: 'tenses.present.3sg',
      main: 'lire',
    },
    'recent-past': {
      text: 'Il vient de lire un livre.',
      stage: 11,
      head: 'vient',
      lemma: 'venir',
      slot: 'tenses.present.3sg',
      main: 'lire',
    },
    passeCompose: {
      text: 'Il a lu un livre.',
      stage: 9,
      head: 'a',
      lemma: 'avoir',
      slot: 'tenses.present.3sg',
      main: 'lu',
    },
    imperatif: { text: 'Lis un livre.', stage: 7, head: 'lis', lemma: 'lire', slot: 'tenses.imperatif.2sg' },
    imparfait: { text: 'Il lisait un livre.', stage: 10, head: 'lisait', lemma: 'lire', slot: 'tenses.imparfait.3sg' },
    futur: { text: 'Il lira un livre.', stage: 11, head: 'lira', lemma: 'lire', slot: 'tenses.futur.3sg' },
  };
  const spec = specs[kind];
  const functions = ['un', ...(kind === 'imperatif' ? [] : ['il']), ...(kind === 'recent-past' ? ['de'] : [])];
  const entry = (id: string, lemma: string, pos: ReaderGlossaryEntry['pos'], forms: string[]): ReaderGlossaryEntry => ({
    id,
    lemma,
    pos,
    sense: 'test-sense',
    forms,
    gloss: { en: `TEST ${lemma}`, zh: '测试释义' },
    ...(pos === 'noun' && { gender: 'masculine' as const }),
  });
  draft.body.glossary = [
    entry('book', 'livre', 'noun', ['livre']),
    ...functions.map((word) => entry(`f-${word}`, word, 'function', [word])),
    entry('head', spec.lemma, 'verb', [spec.head]),
    ...(spec.main ? [entry('main', 'lire', 'verb', [spec.main])] : []),
  ];
  context.core = draft.body.glossary
    .filter((item) => item.pos === 'function')
    .map(({ lemma: headword, sense, forms, gloss }) => ({ headword, sense, forms, gloss, pos: 'function' }));
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((item) => item.pos !== 'function').map(({ id: _id, ...item }) => item),
  );
  draft.body.sentences.forEach((sentence) => {
    sentence.fr = spec.text;
    sentence.tokens = [];
  });
  const [choice, typed] = draft.body.learning.checkpoints[0].questions;
  choice.question.prompt = '{un livre|livre}.';
  choice.question.feedback.byAnswer![0].answer = 'livre';
  choice.evidence = { sentenceId: 's1', quote: spec.text };
  typed.question.prompt = '[___].';
  typed.question.expectedAnswer = 'livre';
  typed.evidence = { sentenceId: 's2', quote: spec.text };
  context.evidence.modalLemmas = ['vouloir'];
  context.evidence.compoundPast = [
    { lemma: 'lire', aux: 'avoir', participles: { ms: 'lu', fs: 'lue', mp: 'lus', fp: 'lues' } },
  ];
  const mainSlot = spec.main === 'lu' ? 'participles.past.ms' : 'infinitive';
  const rows: (LexiconCandidate & { form: string })[] = [
    ...testRows,
    { form: spec.head, lemma: spec.lemma, pos: 'verb', slot: spec.slot },
    ...(spec.main ? [{ form: spec.main, lemma: 'lire', pos: 'verb' as const, slot: mainSlot }] : []),
  ];
  context.lexicon = memoryLexicon(rows);
  annotate(draft, context);
  for (const analysis of draft.analyses) {
    if (analysis.entryId === 'head')
      analysis.verb = {
        kind: 'finite',
        tense: kind === 'imperatif' || kind === 'imparfait' || kind === 'futur' ? kind : 'present',
        person: kind === 'imperatif' ? '2sg' : '3sg',
      };
    if (analysis.entryId === 'main')
      analysis.verb = spec.main === 'lu' ? { kind: 'past-participle', agreement: 'ms' } : { kind: 'infinitive' };
  }
  draft.verbGroups = [];
  for (const sentence of draft.body.sentences) {
    const analyses = draft.analyses.filter((analysis) => analysis.targetId === sentence.id && analysis.verb);
    const ids = analyses.map((analysis) => `${analysis.targetId}:${analysis.ordinal}:${analysis.part}`);
    draft.verbGroups.push({
      targetId: sentence.id,
      atomIds: ids,
      finiteAtomId: ids[0],
      kind: spec.main ? (kind as ReaderDraft['verbGroups'][number]['kind']) : 'simple',
    });
  }
  setStage(draft, context, spec.stage);
  refreshPolicy(draft, context);
  return { draft, context, rows };
}
export function compoundScenario(aux: 'avoir' | 'être') {
  const { draft, context } = verbScenario('passeCompose');
  const verb = generateVerb(
    { id: 'parler', infinitive: 'parler', base: 'parl', rule: 'er-regular', aux: 'avoir' },
    {},
  ).verb;
  verb.prov = {
    origin: 'human',
    checkedAgainst: ['human'],
    status: 'reviewed',
    reviewedBy: 'TEST ONLY',
    checkedAt: '2026-10-23',
  };
  const main = draft.body.glossary.find((entry) => entry.id === 'main')!;
  const head = draft.body.glossary.find((entry) => entry.id === 'head')!;
  const subject = draft.body.glossary.find((entry) => entry.id === 'f-il')!;
  main.lemma = aux === 'être' ? 'aller' : 'parler';
  main.forms = aux === 'être' ? ['allée'] : ['parlé'];
  head.lemma = aux;
  head.forms = aux === 'être' ? ['est'] : ['a'];
  if (aux === 'être') {
    subject.lemma = 'elle';
    subject.forms = ['elle'];
  }
  const sentence = `${aux === 'être' ? 'Elle' : 'Il'} ${head.forms[0]} ${main.forms[0]} un livre.`;
  draft.body.sentences.forEach((entry) => {
    entry.fr = sentence;
    entry.tokens = [];
  });
  draft.body.learning.checkpoints[0].questions.forEach((item) => {
    item.evidence.quote = sentence;
  });
  context.core = draft.body.glossary
    .filter((entry) => entry.pos === 'function')
    .map(({ lemma: headword, sense, forms, gloss }) => ({ headword, pos: 'function', sense, forms, gloss }));
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((entry) => entry.pos !== 'function').map(({ id: _id, ...entry }) => entry),
  );
  context.evidence.compoundPast =
    aux === 'être'
      ? [{ lemma: 'aller', aux: 'être', participles: { ms: 'allé', fs: 'allée', mp: 'allés', fp: 'allées' } }]
      : [];
  const rows: (LexiconCandidate & { form: string })[] = [
    ...testRows,
    { form: main.forms[0], lemma: main.lemma, pos: 'verb', slot: `participles.past.${aux === 'être' ? 'fs' : 'ms'}` },
  ];
  context.lexicon = memoryLexicon(rows, aux === 'avoir' ? [verb] : []);
  annotate(draft, context);
  for (const analysis of draft.analyses)
    if (analysis.entryId === 'main')
      analysis.verb = { kind: 'past-participle', agreement: aux === 'être' ? 'fs' : 'ms' };
  draft.verbGroups = draft.body.sentences.map((entry) => ({
    targetId: entry.id,
    atomIds: [`${entry.id}:1:0`, `${entry.id}:2:0`],
    kind: 'passeCompose',
    finiteAtomId: `${entry.id}:1:0`,
  }));
  setStage(draft, context, 9);
  return { draft, context, rows, verb };
}
export function testReviewedVerb() {
  const verb = generateVerb(
    { id: 'se-laver', infinitive: 'se laver', base: 'lav', rule: 'er-regular', aux: 'etre' },
    {},
  ).verb;
  verb.prov = {
    origin: 'human',
    checkedAgainst: ['human'],
    checkedAt: '2026-10-23',
    status: 'reviewed',
    reviewedBy: 'TEST ONLY',
  };
  return verb;
}
