/** Owns the word sheet's rule for "a verb whose infinitive can be conjugated": lemma shape and part of speech. */
import { expect, test } from 'bun:test';
import { isVerbEntry } from '../src/services/grammarPack/verbEntry';

test('a verb lemma with a verb part of speech, in either language', () => {
  expect(isVerbEntry('aller', 'verbe')).toBe(true);
  expect(isVerbEntry('parler', 'verb')).toBe(true);
  expect(isVerbEntry('vendre', 'Verbe du 3e groupe')).toBe(true);
  expect(isVerbEntry('voir', 'verb')).toBe(true);
  expect(isVerbEntry('pouvoir', 'verb')).toBe(true);
  expect(isVerbEntry('finir', '动词 2e groupe')).toBe(true);
});

test('a pronominal infinitive counts, with either apostrophe', () => {
  expect(isVerbEntry('se lever', 'verbe pronominal')).toBe(true);
  expect(isVerbEntry('s’appeler', 'verb')).toBe(true);
  expect(isVerbEntry("s'appeler", 'verb')).toBe(true);
});

test('adverb is not a verb: the part of speech is matched on a word boundary', () => {
  expect(isVerbEntry('rapidement', 'adverb')).toBe(false);
  expect(isVerbEntry('hier', 'adverbe')).toBe(false);
  // Even a lemma that looks like an infinitive.
  expect(isVerbEntry('derrière', 'adverb')).toBe(false);
  expect(isVerbEntry('arrière', 'adverb')).toBe(false);
});

test('a noun that ends like an infinitive is not a verb', () => {
  expect(isVerbEntry('mer', 'nom')).toBe(false);
  expect(isVerbEntry('père', 'noun')).toBe(false);
  expect(isVerbEntry('plaisir', 'nom masculin')).toBe(false);
});

test('a verb part of speech with a lemma that is not an infinitive is not offered', () => {
  expect(isVerbEntry('mange', 'verbe')).toBe(false);
  expect(isVerbEntry('allé', 'participe passé du verbe aller')).toBe(false);
});
