/** Owns fixture contract acceptance/rejection; not content approval or real source files. */
import { expect, test } from 'bun:test';
import {
  SpellingSoundPatternSchema,
  SpellingSoundsSourceSchema,
  SpellingSoundsPackSchema,
  SpellingSoundsReviewRecordSchema,
} from '../src/types/spellingSounds';
import { spellingSource, spellingPack, spellingReviews } from './fixtures/spellingSounds';

const row = () => spellingSource().patterns[0];

test('source and AI pack parse without altering content; no status field ships', () => {
  expect(SpellingSoundsSourceSchema.parse(spellingSource())).toEqual(spellingSource());
  const pack = spellingPack();
  expect(SpellingSoundsPackSchema.parse(pack)).toEqual(pack);
  expect(pack.patterns[0].review.kind).toBe('ai');
  expect(JSON.stringify(pack)).not.toContain('"status"');
});

test('any IPA group is available, oi accepts semivowels and silent requires exactly zero symbols', () => {
  for (const change of [
    { id: 'oi', spelling: 'oi', sound: ['w', 'a'] },
    { group: 'silent', sound: [] },
    { group: 'vowels', sound: ['ɲ'] },
    { group: 'consonants', sound: ['ɑ̃'] },
  ])
    expect(SpellingSoundPatternSchema.safeParse({ ...row(), ...change }).success).toBe(true);
  for (const change of [
    { sound: ['unknown'] },
    { sound: ['u', 'w', 'a'] },
    { sound: [] },
    { group: 'silent', sound: ['u'] },
    { group: 'semivowels' },
  ])
    expect(SpellingSoundPatternSchema.safeParse({ ...row(), ...change }).success).toBe(false);
});

test('ASCII slugs, lowercase NFC spellings and 3–4 distinct words are enforced without normalization', () => {
  for (const change of [
    { id: 'ç' },
    { id: 'has2' },
    { id: 'bad--slug' },
    { id: '-bad' },
    { spelling: '' },
    { spelling: '  ' },
    { spelling: 'OU' },
    { spelling: 'e\u0301' },
    { examples: ['vous', 'jour'] },
    { examples: ['vous', 'jour', 'rouge', 'tout', 'fou'] },
    { examples: ['vous', 'jour', 'vous'] },
    { examples: ['vous', 'jour', 'Fou'] },
    { examples: ['vous', 'jour', 'fe\u0301e'] },
    { examples: ['vous', 'jour', "l'air"] },
    { examples: ['vous', 'jour', 'deux mots'] },
    { examples: ['vous', 'jour', 'mot2'] },
    { examples: ['vous', 'jour', ''] },
    { examples: ['vous', 'jour', 'mot!'] },
    { status: 'reviewed' },
  ])
    expect(SpellingSoundPatternSchema.safeParse({ ...row(), ...change }).success).toBe(false);
  expect(
    SpellingSoundPatternSchema.safeParse({
      ...row(),
      id: 'c-cedille',
      spelling: 'ç',
      examples: ['ça', 'l’air', 'porte-monnaie'],
    }).success,
  ).toBe(true);
});

test('source/pack version and count constraints, shipped review presence and duplicates are enforced', () => {
  expect(
    SpellingSoundsSourceSchema.safeParse({ schemaVersion: 1, patterns: Array.from({ length: 24 }, row) }).success,
  ).toBe(true);
  expect(
    SpellingSoundsSourceSchema.safeParse({ schemaVersion: 1, patterns: Array.from({ length: 25 }, row) }).success,
  ).toBe(false);
  expect(SpellingSoundsSourceSchema.safeParse({ ...spellingSource(), schemaVersion: 2 }).success).toBe(false);
  for (const change of [{ packVersion: '' }, { schemaVersion: 2 }, { patterns: [] }]) {
    expect(SpellingSoundsPackSchema.safeParse({ ...spellingPack(), ...change }).success).toBe(false);
  }
  const pack = spellingPack();
  expect(SpellingSoundsPackSchema.safeParse({ ...pack, patterns: [{ ...row() }] }).success).toBe(false);
  expect(SpellingSoundsPackSchema.safeParse({ ...pack, patterns: [pack.patterns[0], pack.patterns[0]] }).success).toBe(
    false,
  );
  pack.patterns[1].examples[0] = pack.patterns[0].examples[0];
  expect(SpellingSoundsPackSchema.safeParse(pack).success).toBe(false);
});

test('review records and shipped metadata keep AI and human kinds honest', () => {
  const record = spellingReviews().records[0];
  for (const kind of ['ai', 'human'] as const) {
    const by = `${kind === 'ai' ? 'AI' : 'Human'} review: TEST ONLY`;
    expect(SpellingSoundsReviewRecordSchema.safeParse({ ...record, kind, reviewedBy: by }).success).toBe(true);
    const pack = spellingPack();
    pack.patterns[0].review = { kind, by, at: record.reviewedAt };
    expect(SpellingSoundsPackSchema.safeParse(pack).success).toBe(true);
  }
  for (const change of [
    { kind: 'other' },
    { kind: 'human' },
    { reviewedBy: 'TEST ONLY' },
    { reviewedBy: 'AI review: ' },
    { reviewedAt: 'yesterday' },
    { rowHash: 'short' },
    { reference: ' ' },
    { id: 'ç' },
    { status: 'reviewed' },
  ])
    expect(SpellingSoundsReviewRecordSchema.safeParse({ ...record, ...change }).success).toBe(false);
  for (const change of [
    { kind: 'human' },
    { by: 'Human review: TEST ONLY' },
    { by: '' },
    { at: 'yesterday' },
    { status: 'reviewed' },
  ]) {
    const pack = spellingPack();
    Object.assign(pack.patterns[0].review, change);
    expect(SpellingSoundsPackSchema.safeParse(pack).success).toBe(false);
  }
});
