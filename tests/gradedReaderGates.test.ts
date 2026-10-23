/** Invented TEST content and synthetic dictionary only; no private CSV, AI, publication or language approval. */
import { expect, test } from 'bun:test';
import { checkDraft } from '../scripts/graded-readers/gates';
import { runCheck } from '../scripts/graded-readers/check';
import { lexicalKey } from '../scripts/graded-readers/diagnostics';
import { memoryLexicon } from '../scripts/graded-readers/lexiconIndex';
import { contentHash } from '../scripts/graded-readers/gateInputs';
import { gateFixture, annotate, setStage, refreshPolicy, testRows } from './fixtures/gradedReaderGates';
import type { ReaderDraft } from '../scripts/graded-readers/drafts';
import type { GateContext } from '../scripts/graded-readers/gateInputs';
import { compoundScenario, verbScenario, type VerbCase } from './fixtures/gradedReaderVerbCases';
import { ambiguityFixture } from './fixtures/gradedReaderAmbiguity';
import { gateMutations } from './fixtures/gradedReaderGateMutations';
import { frameScenario } from './fixtures/gradedReaderFrames';

const reasons = (draft: ReaderDraft, context: GateContext, gate?: string) =>
  checkDraft(draft, context)
    .filter((diagnostic) => !gate || diagnostic.gate === gate)
    .map((diagnostic) => diagnostic.reason);
test('offline CLI rejects absent/invalid stages and extra flags before any private reads', async () => {
  for (const args of [[], ['--stage', '0'], ['--stage', '13'], ['--stage', '1', '--publish']]) {
    const rejected = await runCheck(args).then(
      () => false,
      (error: unknown) => error instanceof Error,
    );
    expect(rejected).toBe(true);
  }
});
test('TEST fixture passes all gates without claiming French verification', () => {
  const { draft, context } = gateFixture();
  expect(checkDraft(draft, context)).toEqual([]);
});

for (const [gate, name, mutate] of gateMutations)
  test(`${gate} TEST passing control / mutation: ${name}`, () => {
    const { draft, context } = gateFixture();
    expect(checkDraft(draft, context)).toEqual([]);
    mutate(draft, context);
    expect(reasons(draft, context, gate).length).toBeGreaterThan(0);
  });

test('G0 predecessor body reviews and ordered dependencies must all be current', () => {
  const { draft, context } = gateFixture();
  setStage(draft, context, 2);
  expect(checkDraft(draft, context)).toEqual([]);
  for (const mutation of [
    () => {
      context.previous = [];
    },
    () => {
      context.reviews.records = [];
    },
    () => {
      context.previous[0].body.title.en += ' changed';
    },
    () => {
      draft.provenance.dependencyHashes = [];
    },
    () => {
      context.previous[0].provenance.syllabusHash = 'f'.repeat(64);
    },
  ]) {
    const saved = structuredClone({ draft, previous: context.previous, reviews: context.reviews });
    mutation();
    expect(reasons(draft, context, 'G0').length).toBeGreaterThan(0);
    Object.assign(draft, saved.draft);
    context.previous = saved.previous;
    context.reviews = saved.reviews;
  }
});
test('G3 previous glossary keys are known, but different POS/senses are not', () => {
  const { draft, context } = gateFixture();
  setStage(draft, context, 2);
  context.syllabus.stages.forEach((stage) => {
    stage.newWordBudget = 0;
  });
  refreshPolicy(draft, context);
  context.previous[0].provenance.syllabusHash = draft.provenance.syllabusHash;
  expect(reasons(draft, context, 'G3')).toEqual([]);
  draft.body.glossary[0].sense = 'different';
  expect(reasons(draft, context, 'G3').some((reason) => reason.includes('budget'))).toBe(true);
  expect(lexicalKey({ pos: 'noun', lemma: 'son', sense: 'sound' })).not.toBe(
    lexicalKey({ pos: 'function', lemma: 'son', sense: 'possessive' }),
  );
});
for (const [form, pos] of [
  ['est', 'noun'],
  ['a', 'noun'],
  ['son', 'noun'],
  ['son', 'function'],
  ['ses', 'function'],
  ['ces', 'function'],
  ['à', 'function'],
] as const) {
  test(`G2 TEST exact authored ${form}/${pos} selection / wrong reading mutation`, () => {
    const { draft, context } = ambiguityFixture(form, pos);
    expect(checkDraft(draft, context)).toEqual([]);
    const selected = draft.body.glossary.find((entry) => entry.id === 'petit-size')!;
    selected.lemma = form === 'ses' ? 'ces' : form === 'ces' ? 'ses' : 'unsupported';
    if (pos === 'function') context.core.find((entry) => entry.headword === form)!.forms = ['different'];
    expect(reasons(draft, context, 'G2').length).toBeGreaterThan(0);
  });
}
test('G2 TEST a cannot be attested as accent-folded avoir when source is à', () => {
  const { draft, context } = ambiguityFixture('à', 'function');
  expect(checkDraft(draft, context)).toEqual([]);
  const entry = draft.body.glossary.find((item) => item.id === 'petit-size')!;
  entry.pos = 'verb';
  entry.lemma = 'avoir';
  for (const analysis of draft.analyses)
    if (analysis.entryId === entry.id) analysis.verb = { kind: 'finite', tense: 'present', person: '3sg' };
  expect(reasons(draft, context, 'G2').some((reason) => reason.includes('not attested'))).toBe(true);
});
test('G0/G1 all checkpoint targets are scanned, including distractors and accepted answers', () => {
  const { draft, context } = gateFixture();
  const typed = draft.body.learning.checkpoints[0].questions[1];
  typed.question.acceptableAnswers = ['livre'];
  annotate(draft, context);
  expect(checkDraft(draft, context)).toEqual([]);
  const choice = draft.body.learning.checkpoints[0].questions[0].question;
  choice.prompt = choice.prompt.replace('le livre', 'le 2 livre');
  choice.feedback.byAnswer![0].answer = 'le 2 livre';
  expect(reasons(draft, context, 'G1').length).toBeGreaterThan(0);
});
test('G2/G4 noun est cannot satisfy a declared finite-verb group', () => {
  const { draft, context } = ambiguityFixture('est', 'noun');
  expect(checkDraft(draft, context)).toEqual([]);
  const group = draft.verbGroups.find((item) => item.targetId === 's2')!;
  group.atomIds = ['s2:3:0'];
  group.finiteAtomId = 's2:3:0';
  expect(reasons(draft, context, 'G4').length).toBeGreaterThan(0);
});
test('G1/G4 est-ce phrase cannot hide its finite verb from analysis/groups', () => {
  const { draft, context } = gateFixture();
  const phrase = {
    id: 'question-phrase',
    lemma: 'est-ce',
    pos: 'phrase' as const,
    sense: 'question',
    forms: ['est-ce'],
    gloss: { en: 'TEST question', zh: '测试疑问' },
  };
  draft.body.glossary.push(phrase);
  const { id: _id, ...candidate } = phrase;
  context.candidates.entries.push(structuredClone(candidate));
  draft.body.sentences[0].fr = 'Est-ce un livre.';
  draft.body.learning.checkpoints[0].questions[0].evidence.quote = 'Est-ce un livre.';
  context.evidence.inversions = ['est-ce'];
  annotate(draft, context);
  setStage(draft, context, 6);
  expect(checkDraft(draft, context)).toEqual([]);
  draft.verbGroups = draft.verbGroups.filter((group) => group.targetId !== 's1');
  expect(reasons(draft, context, 'G4').some((reason) => reason.includes('exactly one group'))).toBe(true);
});
test('G4 checkpoint verb extraction uses its completed literal subject frame', () => {
  const { draft, context } = gateFixture();
  const typed = draft.body.learning.checkpoints[0].questions[1].question;
  typed.prompt = 'Il [___] petit.';
  typed.expectedAnswer = 'est';
  annotate(draft, context);
  expect(checkDraft(draft, context)).toEqual([]);
  draft.analyses.find((analysis) => analysis.targetId === 'q-type-size-answer-0')!.verb = {
    kind: 'finite',
    tense: 'present',
    person: '1sg',
  };
  expect(reasons(draft, context, 'G4').length).toBeGreaterThan(0);
});
test('G5 reviewed noun identity is exact, never an ending-based gender guess', () => {
  const { draft, context } = gateFixture();
  context.reviewedNouns = [{ lemma: 'autrelivre', gender: 'feminine' }];
  expect(checkDraft(draft, context)).toEqual([]);
  context.reviewedNouns = [{ lemma: 'livre', gender: 'feminine' }];
  expect(reasons(draft, context, 'G5').length).toBeGreaterThan(0);
});
test('G2 inverse adapter keeps all exact homographs and does not accent-fold', () => {
  const index = memoryLexicon(testRows);
  expect(index.candidates('est').map((candidate) => candidate.pos)).toEqual(['verb', 'noun']);
  expect(index.candidates('a')).toHaveLength(2);
  expect(index.candidates('à')).toEqual([]);
  expect(index.candidates('suis')).toHaveLength(4);
  expect(index.candidates('parle')).toHaveLength(4);
  expect(index.candidates('aime')).toHaveLength(4);
  expect(index.candidates('unknown')).toEqual([]);
});

function presentScenario(form: string, lemma: string, person: '1sg' | '3sg' = '1sg') {
  const { draft, context } = gateFixture();
  draft.body.sentences.forEach((sentence, i) => {
    sentence.fr = [`Je ${form} un livre.`, `Je ${form} le livre petit.`, `Je ${form} petit.`][i];
    sentence.tokens = [];
  });
  draft.body.glossary = draft.body.glossary.filter((entry) => !['ce-function', 'il-function'].includes(entry.id));
  draft.body.glossary.push({
    id: 'je-subject',
    lemma: 'je',
    pos: 'function',
    sense: 'subject',
    forms: ['je'],
    gloss: { en: 'TEST I', zh: '测试我' },
  });
  const verb = draft.body.glossary.find((entry) => entry.pos === 'verb')!;
  verb.lemma = lemma;
  verb.forms = [form];
  context.core = draft.body.glossary
    .filter((entry) => entry.pos === 'function')
    .map(({ lemma: headword, sense, forms, gloss }) => ({ headword, pos: 'function', sense, forms, gloss }));
  context.candidates.entries = draft.body.glossary
    .filter((entry) => entry.pos !== 'function')
    .map(({ id: _id, ...entry }) => entry);
  const [choice, typed] = draft.body.learning.checkpoints[0].questions;
  choice.question.prompt = `Je ${form} {un livre|le livre}.`;
  choice.evidence.quote = draft.body.sentences[0].fr;
  typed.question.prompt = `Je ${form} [___].`;
  typed.evidence.quote = draft.body.sentences[1].fr;
  annotate(draft, context);
  for (const analysis of draft.analyses)
    if (analysis.verb) analysis.verb = { kind: 'finite', tense: 'present', person };
  refreshPolicy(draft, context);
  return { draft, context };
}
for (const [form, lemma] of [
  ['suis', 'être'],
  ['suis', 'suivre'],
  ['parle', 'parler'],
  ['aime', 'aimer'],
]) {
  test(`G2/G4 TEST ${form}/${lemma}: allowed intended slot survives forbidden alternatives`, () => {
    const { draft, context } = presentScenario(form, lemma);
    context.syllabus.stages[0].maxSentenceWords = 7;
    refreshPolicy(draft, context);
    expect(checkDraft(draft, context)).toEqual([]);
    draft.analyses.find((analysis) => analysis.verb)!.verb = { kind: 'finite', tense: 'present', person: '3sg' };
    expect(reasons(draft, context, 'G4').length).toBeGreaterThan(0);
  });
}
for (const forbidden of ['conditionnel', 'subjonctif', 'present-participle'] as const)
  test(`G4 TEST forbidden ${forbidden}`, () => {
    const { draft, context } = presentScenario('parle', 'parler');
    expect(reasons(draft, context, 'G4')).toEqual([]);
    const analysis = draft.analyses.find((entry) => entry.verb)!;
    analysis.verb =
      forbidden === 'present-participle' ? { kind: forbidden } : { kind: 'finite', tense: forbidden, person: '1sg' };
    context.lexicon = memoryLexicon([
      ...testRows,
      {
        form: 'parle',
        lemma: 'parler',
        pos: 'verb',
        slot: forbidden === 'present-participle' ? 'participles.present' : `tenses.${forbidden}.1sg`,
      },
    ]);
    expect(reasons(draft, context, 'G4').some((reason) => reason.includes('forbidden'))).toBe(true);
  });

test('G5 TEST linked clauses obey the stage-specific inventory and later reviewed topic', () => {
  const { draft, context } = gateFixture();
  draft.body.sentences[2].fr = 'Il est petit et il est petit.';
  draft.body.sentences[2].tokens = [];
  const conjunction = {
    id: 'link',
    lemma: 'et',
    pos: 'function' as const,
    sense: 'link',
    forms: ['et'],
    gloss: { en: 'TEST and', zh: '测试和' },
  };
  draft.body.glossary.push(conjunction);
  context.core.push({
    headword: 'et',
    pos: 'function',
    sense: 'link',
    forms: ['et'],
    gloss: structuredClone(conjunction.gloss),
  });
  annotate(draft, context);
  setStage(draft, context, 3);
  expect(checkDraft(draft, context)).toEqual([]);
  draft.body.order = 1;
  expect(reasons(draft, context, 'G5').some((reason) => reason.includes('independent clause'))).toBe(true);
  draft.body.order = 3;
  conjunction.lemma = 'quand';
  conjunction.forms = ['quand'];
  context.core.at(-1)!.headword = 'quand';
  context.core.at(-1)!.forms = ['quand'];
  draft.body.sentences[2].fr = 'Il est petit quand il est petit.';
  annotate(draft, context);
  setStage(draft, context, 10);
  context.evidence.clauseMarkers = [{ form: 'quand', topicId: 'conjunction-quand' }];
  expect(checkDraft(draft, context)).toEqual([]);
  context.evidence.clauseMarkers = [];
  expect(reasons(draft, context, 'G5').some((reason) => reason.includes('clause inventory'))).toBe(true);
});
for (const mutate of [
  (draft: ReaderDraft) => {
    draft.body.title.zh = '';
  },
  (draft: ReaderDraft) => {
    draft.body.glossary[0].gloss.en = '';
  },
  (draft: ReaderDraft) => {
    draft.body.learning.instruction.zh = '';
  },
  (draft: ReaderDraft) => {
    draft.body.learning.checkpoints[0].questions[0].question.feedback.correct.summary.en = '';
  },
  (draft: ReaderDraft) => {
    draft.body.learning.checkpoints[0].questions[0].question.feedback.byAnswer![0].message.summary.zh = '';
  },
])
  test('G5 TEST all bilingual nested fields are mandatory', () => {
    const { draft, context } = gateFixture();
    expect(checkDraft(draft, context)).toEqual([]);
    mutate(draft);
    expect(reasons(draft, context, 'G5').length).toBeGreaterThan(0);
  });
test('G5 missing translation and answer outside cited evidence fail closed', () => {
  const { draft, context } = gateFixture();
  expect(checkDraft(draft, context)).toEqual([]);
  draft.body.sentences[0].translation.en = '';
  expect(checkDraft(draft, context).length).toBeGreaterThan(0);
  draft.body.sentences[0].translation.en = 'TEST book';
  draft.body.learning.checkpoints[0].questions[1].evidence = { sentenceId: 's1', quote: 'C’est un livre.' };
  expect(checkDraft(draft, context).some((diagnostic) => diagnostic.reason.includes('evidence'))).toBe(true);
});
for (const kind of [
  'modal-infinitive',
  'near-future',
  'recent-past',
  'passeCompose',
  'imperatif',
  'imparfait',
  'futur',
] as VerbCase[]) {
  test(`G4 TEST verified ${kind} group / forbidden-stage mutation`, () => {
    const { draft, context } = verbScenario(kind);
    expect(checkDraft(draft, context)).toEqual([]);
    const stage = context.syllabus.stages[draft.body.order - 1];
    if (['modal-infinitive', 'near-future', 'recent-past'].includes(kind)) stage.allowedConstructions = [];
    else stage.allowedTenses = ['present'];
    refreshPolicy(draft, context);
    expect(reasons(draft, context, 'G4').length).toBeGreaterThan(0);
  });
}
for (const kind of ['modal-infinitive', 'near-future', 'recent-past', 'passeCompose'] as const) {
  test(`G4 TEST ${kind} cannot use an arbitrary head or missing main evidence`, () => {
    const { draft, context } = verbScenario(kind);
    expect(checkDraft(draft, context)).toEqual([]);
    if (kind === 'modal-infinitive') context.evidence.modalLemmas = [];
    if (kind === 'near-future') draft.body.glossary.find((entry) => entry.id === 'head')!.lemma = 'vouloir';
    if (kind === 'recent-past') draft.body.glossary.find((entry) => entry.id === 'f-de')!.lemma = 'avec';
    if (kind === 'passeCompose') context.evidence.compoundPast = [];
    expect(reasons(draft, context, 'G4').length).toBeGreaterThan(0);
  });
}
for (const aux of ['avoir', 'être'] as const)
  test(`G4 TEST ${aux} compound verifies reviewed cell and agreement`, () => {
    const { draft, context, rows, verb } = compoundScenario(aux);
    expect(checkDraft(draft, context)).toEqual([]);
    if (aux === 'avoir') {
      verb.tenses.passeCompose['3sg']!.forms = ['a bogus'];
      context.lexicon = memoryLexicon(rows, [verb]);
    } else
      draft.analyses.find((analysis) => analysis.entryId === 'main')!.verb = {
        kind: 'past-participle',
        agreement: 'ms',
      };
    expect(reasons(draft, context, 'G4').length).toBeGreaterThan(0);
  });
test('G4 TEST imperative rejects invalid person and an explicit subject', () => {
  const { draft, context } = verbScenario('imperatif');
  expect(checkDraft(draft, context)).toEqual([]);
  const head = draft.analyses.find((analysis) => analysis.verb)!;
  head.verb = { kind: 'finite', tense: 'imperatif', person: '3sg' };
  expect(reasons(draft, context, 'G4').some((reason) => reason.includes('subjectless'))).toBe(true);
});
for (const mode of ['reflexive', 'inversion', 'toi', 'nous', 'vous'] as const)
  test(`G2/G4 TEST ${mode} frame needs exact reviewed evidence`, () => {
    const { draft, context, rows, reviewed } = frameScenario(mode);
    expect(checkDraft(draft, context)).toEqual([]);
    if (mode === 'inversion') context.evidence.inversions = [];
    else if (mode === 'reflexive') context.evidence.pronominals = [];
    else {
      reviewed.tenses.imperatif = undefined;
      context.lexicon = memoryLexicon(rows, [reviewed]);
    }
    expect(checkDraft(draft, context).some((diagnostic) => diagnostic.gate === 'G2' || diagnostic.gate === 'G4')).toBe(
      true,
    );
  });
test('G5 TEST title cap is independent and expanded, with exactly eight allowed', () => {
  const { draft, context } = gateFixture();
  draft.body.title.fr = Array(8).fill('livre').join(' ');
  annotate(draft, context);
  expect(checkDraft(draft, context)).toEqual([]);
  draft.body.title.fr += ' livre';
  annotate(draft, context);
  expect(reasons(draft, context, 'G5').some((reason) => reason.includes('Title'))).toBe(true);
});
test('G3 TEST unique key budget is not a surface-token count; unused glossary blocks', () => {
  const { draft, context } = gateFixture();
  context.syllabus.stages[0].newWordBudget = 3;
  refreshPolicy(draft, context);
  expect(checkDraft(draft, context)).toEqual([]);
  draft.body.glossary.push({
    ...structuredClone(draft.body.glossary[0]),
    id: 'unused',
    lemma: 'autre',
    sense: 'unused',
  });
  expect(reasons(draft, context, 'G3').some((reason) => reason.includes('Unused'))).toBe(true);
});
test('diagnostics include gate, severity, identity and source location without modifying draft', () => {
  const { draft, context } = gateFixture();
  draft.analyses.find((analysis) => analysis.verb)!.verb = { kind: 'finite', tense: 'present', person: '1sg' };
  const before = contentHash(draft);
  const diagnostic = checkDraft(draft, context).find((entry) => entry.gate === 'G2')!;
  expect(diagnostic).toMatchObject({
    gate: 'G2',
    severity: 'error',
    readerId: 'test-book',
    targetId: 's1',
    ordinal: 0,
    part: 1,
    spelling: 'est',
  });
  expect(diagnostic.selected?.lemma).toBe('être');
  expect(diagnostic.candidates?.length).toBeGreaterThan(1);
  expect(contentHash(draft)).toBe(before);
});
