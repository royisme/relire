/** Invented TEST inversion and reflexive frames, with synthetic reviewed command forms. */
import { memoryLexicon } from '../../scripts/graded-readers/lexiconIndex';
import { annotate, setStage, testRows } from './gradedReaderGates';
import { testReviewedVerb, verbScenario } from './gradedReaderVerbCases';

export function frameScenario(mode: 'reflexive' | 'inversion' | 'toi' | 'nous' | 'vous') {
  const { draft, context } = verbScenario('imperatif');
  const reviewed = testReviewedVerb();
  const command = ['toi', 'nous', 'vous'].includes(mode);
  const person = mode === 'nous' ? '1pl' : mode === 'vous' ? '2pl' : command ? '2sg' : '3sg';
  const form = mode === 'nous' ? 'lavons' : mode === 'vous' ? 'lavez' : mode === 'inversion' ? 'parle' : 'lave';
  const text =
    mode === 'inversion' ? 'Parle-t-il un livre.' : command ? `${form}-${mode} un livre.` : 'Il se lave un livre.';
  const functions = ['un', ...(command ? [mode] : mode === 'inversion' ? ['il'] : ['il', 'se'])];
  const head = draft.body.glossary.find((entry) => entry.id === 'head')!;
  head.lemma = mode === 'inversion' ? 'parler' : 'se laver';
  head.forms = [form];
  draft.body.glossary = [
    draft.body.glossary.find((entry) => entry.id === 'book')!,
    head,
    ...functions.map((word) => ({
      id: `f-${word}`,
      lemma: word,
      pos: 'function' as const,
      sense: 'test-sense',
      forms: [word],
      gloss: { en: 'TEST function', zh: '测试功能词' },
    })),
  ];
  context.core = draft.body.glossary
    .filter((entry) => entry.pos === 'function')
    .map(({ lemma: headword, sense, forms, gloss }) => ({ headword, pos: 'function', sense, forms, gloss }));
  context.candidates.entries = structuredClone(
    draft.body.glossary.filter((entry) => entry.pos !== 'function').map(({ id: _id, ...entry }) => entry),
  );
  draft.body.sentences.forEach((sentence) => {
    sentence.fr = text;
    sentence.tokens = [];
  });
  draft.body.learning.checkpoints[0].questions.forEach((item) => {
    item.evidence.quote = text;
  });
  context.evidence.pronominals = [{ lemma: 'se laver', base: 'laver', clitic: 'se' }];
  context.evidence.inversions = ['parle-t-il'];
  const rows = [
    ...testRows,
    {
      form,
      lemma: mode === 'inversion' ? 'parler' : 'laver',
      pos: 'verb' as const,
      slot: `tenses.${command ? 'imperatif' : 'present'}.${person}`,
    },
  ];
  context.lexicon = memoryLexicon(rows, [reviewed]);
  annotate(draft, context);
  for (const analysis of draft.analyses)
    if (analysis.entryId === 'head')
      analysis.verb = { kind: 'finite', tense: command ? 'imperatif' : 'present', person };
  setStage(draft, context, 7);
  return { draft, context, rows, reviewed };
}
