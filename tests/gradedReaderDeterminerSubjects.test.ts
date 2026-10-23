/** Invented TEST G4 coverage: a noun subject needs an unambiguous number-matching determiner; no language approval. */
import { expect, test } from 'bun:test';
import { checkDraft } from '../scripts/graded-readers/gates';
import type { GateContext } from '../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../scripts/graded-readers/drafts';
import { determinerSubjectFixture } from './fixtures/gradedReaderDeterminerSubjects';

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

const singular = ['ma', 'mon', 'ton', 'ta', 'son', 'sa', 'notre', 'votre', 'leur', 'ce', 'cet', 'cette'];
const singularPossessives = ['ma', 'mon', 'ton', 'ta', 'son', 'sa', 'notre', 'votre', 'leur'];
const pluralPossessives = ['mes', 'tes', 'ses', 'nos', 'vos', 'leurs'];
const determiner = 'Noun subject needs an unambiguous matching determiner';
const agreement = 'Finite slot must agree with unambiguous noun number';

// (1) every singular possessive/demonstrative before a singular noun passes with a 3sg verb.
for (const det of singular)
  test(`G4 TEST ${det} + singular noun subject with a 3sg verb passes`, () => {
    const { draft, context } = determinerSubjectFixture({ determiner: det, nounNumber: 'singular', verbPerson: '3sg' });
    expect(checkDraft(draft, context)).toEqual([]);
  });

// (2) every plural possessive/demonstrative before a plural noun passes with a 3pl verb.
for (const det of ['mes', 'tes', 'ses', 'nos', 'vos', 'leurs', 'ces'])
  test(`G4 TEST ${det} + plural noun subject with a 3pl verb passes`, () => {
    const { draft, context } = determinerSubjectFixture({ determiner: det, nounNumber: 'plural', verbPerson: '3pl' });
    expect(checkDraft(draft, context)).toEqual([]);
  });

// (3) a singular possessive cannot mark a plural noun subject, even when the verb agrees with the noun.
for (const det of singularPossessives)
  test(`G4 TEST ${det} + plural noun subject fails`, () => {
    const { draft, context } = determinerSubjectFixture({ determiner: det, nounNumber: 'plural', verbPerson: '3pl' });
    expect(g4Reasons(draft, context)).toEqual([determiner]);
  });

// (4) a plural possessive cannot mark a singular noun subject, whatever person the verb claims.
for (const det of pluralPossessives)
  for (const verbPerson of ['3sg', '3pl'] as const)
    test(`G4 TEST ${det} + singular noun subject fails with a ${verbPerson} verb`, () => {
      const { draft, context } = determinerSubjectFixture({ determiner: det, nounNumber: 'singular', verbPerson });
      expect(g4Reasons(draft, context)).toEqual(verbPerson === '3sg' ? [determiner] : [agreement, determiner]);
    });

// (5) a bare noun subject, plural or singular, has no determiner to read a number from.
for (const nounNumber of ['singular', 'plural'] as const)
  test(`G4 TEST bare ${nounNumber} noun subject without a determiner fails`, () => {
    const { draft, context } = determinerSubjectFixture({
      nounNumber,
      verbPerson: nounNumber === 'singular' ? '3sg' : '3pl',
    });
    expect(g4Reasons(draft, context)).toEqual([determiner]);
  });

// (6) the verb person must still equal the noun number behind a matching determiner.
for (const [det, nounNumber, verbPerson] of [
  ['ma', 'singular', '3pl'],
  ['cette', 'singular', '3pl'],
  ['mes', 'plural', '3sg'],
  ['ces', 'plural', '3sg'],
] as const)
  test(`G4 TEST ${det} + ${nounNumber} noun subject rejects a ${verbPerson} verb`, () => {
    const { draft, context } = determinerSubjectFixture({ determiner: det, nounNumber, verbPerson });
    expect(g4Reasons(draft, context)).toEqual([agreement]);
    expect(reasons(draft, context, 'G4')).not.toContain(determiner);
  });
