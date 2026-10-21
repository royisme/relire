/** Normalized lemma identity, POS gating and longest shipped ending shared by hints and drills. */
import { expect, test } from 'bun:test';
import data from '../src/data/noun-gender/pack.json';
import { NounGenderPackSchema } from '../src/types/nounGender';
import { isNounEntry, matchNounGender, normalizeNounLemma } from '../src/services/nounGender/match';

const pack = NounGenderPackSchema.parse(data);

test('POS gating accepts English/French/Chinese noun words, not verbs, pronouns or adverbs', () => {
  for (const pos of ['noun', 'Noun (feminine)', 'common noun', 'nom', 'nom commun', 'substantif', '\u540d\u8bcd'])
    expect(isNounEntry(pos)).toBe(true);
  for (const pos of ['', 'verb', 'verbe', 'adverb', 'adverbe', 'pronoun', 'pronom', '\u52a8\u8bcd', '\u526f\u8bcd'])
    expect(isNounEntry(pos)).toBe(false);
});

test('NFC/case/trim identity preserves accents and does not guess singular forms', () => {
  expect(normalizeNounLemma('  E\u0301TE\u0301 ')).toBe('été');
  const match = matchNounGender(pack, '  E\u0301TE\u0301 ')!;
  expect(match.rule.id).toBe('te');
  expect(match.noun?.id).toBe('ete');
  expect(match.exception).toBe(true);
  expect(matchNounGender(pack, 'étudiant')).toBeUndefined();
  expect(matchNounGender(pack, 'plages')).toBeUndefined();
});

test('reviewed exception identity is from the pack; an unlisted noun only gets a tendency', () => {
  expect(matchNounGender(pack, 'plage')?.exception).toBe(true);
  expect(matchNounGender(pack, 'fromage')?.exception).toBe(false);
  const unknown = matchNounGender(pack, 'TEST-inconnu-age')!;
  expect(unknown.rule.id).toBe('age');
  expect(unknown.noun).toBeUndefined();
  expect(unknown.exception).toBe(false);
});

test('the longest ending wins even if a shorter candidate comes first', () => {
  // TEST-only overlap: the real reviewed pack deliberately contains no broad -e rule.
  const synthetic = { ...pack, rules: [{ ...pack.rules[0], id: 'test-e', ending: 'e' }, ...pack.rules] };
  expect(matchNounGender(synthetic, 'voiture')?.rule.id).toBe('ure');
  expect(matchNounGender(synthetic, 'fromage')?.rule.id).toBe('age');
  expect(matchNounGender(synthetic, 'journée')?.rule.id).toBe('ee');
});
