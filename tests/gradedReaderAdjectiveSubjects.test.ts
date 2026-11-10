/** Invented TEST G4 coverage: a determiner may reach a noun subject across pre-nominal adjectives; no language approval. */
import { expect, test } from 'bun:test';
import { checkDraft } from '../scripts/graded-readers/gates';
import type { GateContext } from '../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../scripts/graded-readers/drafts';
import { adjectiveSubjectFixture } from './fixtures/gradedReaderAdjectiveSubjects';

const reasons = (draft: ReaderDraft, context: GateContext, gate?: string) =>
  checkDraft(draft, context)
    .filter((diagnostic) => !gate || diagnostic.gate === gate)
    .map((diagnostic) => diagnostic.reason);
/** Failing cases must trip G4 alone, so unexpected diagnostics from other gates surface immediately. */
const g4Reasons = (draft: ReaderDraft, context: GateContext) => {
  const diagnostics = checkDraft(draft, context);
  expect(diagnostics.filter((diagnostic) => diagnostic.gate !== 'G4')).toEqual([]);
  // One diagnostic per verb group: three identical sentences report the same reason three times.
  return [...new Set(diagnostics.map((diagnostic) => diagnostic.reason))];
};

const determiner = 'Noun subject needs an unambiguous matching determiner';
const agreement = 'Finite slot must agree with unambiguous noun number';
// cette/chambre/belle and mes/cahiers/beaux stand in for the singular and plural frames.
const frames = [
  { determiner: 'cette', noun: 'chambre', nounNumber: 'singular', verbPerson: '3sg' },
  { determiner: 'mes', noun: 'cahier', nounNumber: 'plural', verbPerson: '3pl' },
] as const;

// (a) a determiner reaches the noun subject across one pre-nominal adjective.
for (const frame of frames)
  test(`G4 TEST ${frame.determiner} + adjective + ${frame.nounNumber} noun subject passes`, () => {
    const { draft, context } = adjectiveSubjectFixture({ ...frame, adjectiveCount: 1 });
    expect(checkDraft(draft, context)).toEqual([]);
  });

// (b) the determiner is still found behind two pre-nominal adjectives.
for (const frame of frames)
  test(`G4 TEST ${frame.determiner} + two adjectives + ${frame.nounNumber} noun subject passes`, () => {
    const { draft, context } = adjectiveSubjectFixture({ ...frame, adjectiveCount: 2 });
    expect(checkDraft(draft, context)).toEqual([]);
  });

// (c) the determiner's number is still enforced through the adjective.
test('G4 TEST plural determiner + singular noun behind an adjective fails', () => {
  const { draft, context } = adjectiveSubjectFixture({
    determiner: 'mes',
    noun: 'chambre',
    nounNumber: 'singular',
    adjectiveCount: 1,
    verbPerson: '3sg',
  });
  expect(g4Reasons(draft, context)).toEqual([determiner]);
});
test('G4 TEST wrong-person verb behind adjective + noun fails without a determiner complaint', () => {
  const { draft, context } = adjectiveSubjectFixture({
    determiner: 'cette',
    noun: 'chambre',
    nounNumber: 'singular',
    adjectiveCount: 1,
    verbPerson: '3pl',
  });
  expect(g4Reasons(draft, context)).toEqual([agreement]);
  expect(reasons(draft, context, 'G4')).not.toContain(determiner);
});

// (d) a pre-nominal adjective with no determiner before it cannot supply a number.
for (const frame of frames)
  test(`G4 TEST adjective + bare ${frame.nounNumber} noun subject without a determiner fails`, () => {
    const { draft, context } = adjectiveSubjectFixture({
      noun: frame.noun,
      nounNumber: frame.nounNumber,
      adjectiveCount: 1,
      verbPerson: frame.verbPerson,
    });
    expect(g4Reasons(draft, context)).toEqual([determiner]);
  });
