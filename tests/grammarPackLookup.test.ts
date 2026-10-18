/** Owns normalizeLookupToken and the exact-infinitive pack lookup, against the real pack; not the loader, the reverse index or the page. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { findPackVerb, normalizeLookupToken } from '../src/services/grammarPack/lookup';
import { GrammarPackSchema } from '../src/types/grammarPack';

test('diacritics are kept: a and à, e and é stay distinct', () => {
  expect(normalizeLookupToken('à')).toBe('à');
  expect(normalizeLookupToken('à')).not.toBe(normalizeLookupToken('a'));
  expect(normalizeLookupToken('être')).not.toBe(normalizeLookupToken('etre'));
});

test('apostrophes fold to a straight one: U+2018, U+2019 and the backtick', () => {
  for (const apostrophe of ["'", '‘', '’', '`'])
    expect(normalizeLookupToken(`s${apostrophe}appeler`)).toBe("s'appeler");
});

test('hyphens fold to a plain one: U+2010 to U+2015 and the hyphen-minus', () => {
  for (const dash of ['-', '‐', '‑', '‒', '–', '—', '―'])
    expect(normalizeLookupToken(`lève${dash}toi`)).toBe('lève-toi');
  // Not turned into an apostrophe, as normalizeFrench would.
  expect(normalizeLookupToken('lève-toi')).toContain('-');
});

test('NFC, lowercase, trim and collapsed spaces', () => {
  expect(normalizeLookupToken('étre')).toBe('étre');
  expect(normalizeLookupToken('  Se   LEVER \t')).toBe('se lever');
});

test('the pronoun is never added or removed', () => {
  expect(normalizeLookupToken('lever')).not.toBe(normalizeLookupToken('se lever'));
});

test('the pack lookup matches the exact infinitive only', () => {
  // Read from disk, not through the module that the loader tests replace.
  const pack = GrammarPackSchema.parse(JSON.parse(readFileSync('src/data/grammar-pack/pack.json', 'utf8')));
  expect(findPackVerb(pack, 'aller')?.id).toBe('aller');
  expect(findPackVerb(pack, ' Être ')?.id).toBe('etre');
  expect(findPackVerb(pack, "s'appeler")?.id).toBe('s-appeler');
  expect(findPackVerb(pack, 's’appeler')?.id).toBe('s-appeler');
  expect(findPackVerb(pack, 'appeler')).toBeUndefined();
  expect(findPackVerb(pack, 'etre')).toBeUndefined();
  expect(findPackVerb(pack, 'parler')).toBeUndefined();
});
