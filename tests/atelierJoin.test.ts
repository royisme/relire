/** Pins the join and comparison rules against hand-written French. */
import { expect, test } from 'bun:test';
import { joinBricks, normalizeSentence, tokensOf } from '../src/services/atelier/join';
import { beach, cinema, coffee, negative } from './fixtures/atelier';

test('bricks have one space between words and no space before punctuation', () => {
  expect(joinBricks(beach.bricks)).toBe('Nous allons à la plage.');
});

test('a typographic apostrophe elides the space after its brick', () => {
  expect(joinBricks(coffee.bricks)).toBe('J’aime le café.');
});

test('a straight apostrophe elides the space and becomes typographic', () => {
  const bricks = structuredClone(coffee.bricks);
  bricks[0].text = "J'";
  expect(joinBricks(bricks)).toBe('J’aime le café.');
});

test('elided negation keeps n’ against the verb and leaves the destination article alone', () => {
  expect(joinBricks(negative.bricks)).toBe('Nous n’allons pas à la plage.');
});

test('au is a single fused brick, not à followed by le', () => {
  expect(joinBricks(cinema.bricks)).toBe('Je vais au cinéma.');
});

test('punctuation can be the first brick without a leading space', () => {
  expect(
    joinBricks([
      { text: '…', role: 'punctuation' },
      { text: 'oui', role: 'adverb' },
    ]),
  ).toBe('… oui');
});

test('a multi-word brick is joined as given', () => {
  expect(
    joinBricks([
      { text: 'À mon avis', role: 'expression' },
      { text: ',', role: 'punctuation' },
      { text: 'oui', role: 'adverb' },
      { text: '.', role: 'punctuation' },
    ]),
  ).toBe('À mon avis, oui.');
});

test('joining does not capitalise, lowercase, strip accents or otherwise rewrite words', () => {
  expect(
    joinBricks([
      { text: 'nous', role: 'subject' },
      { text: 'ALLONS', role: 'verb' },
      { text: 'à la PLAGE', role: 'expression' },
      { text: '.', role: 'punctuation' },
    ]),
  ).toBe('nous ALLONS à la PLAGE.');
});

test('a straight apostrophe inside a brick also becomes typographic', () => {
  expect(joinBricks([{ text: "aujourd'hui", role: 'adverb' }])).toBe('aujourd’hui');
});

test('tokens keep an elision on its own token and separate punctuation', () => {
  expect(tokensOf("J'aime la plage.")).toEqual(['j’', 'aime', 'la', 'plage', '.']);
});

test('tokens lowercase but keep accents', () => {
  expect(tokensOf('ÉTÉ À Montréal.')).toEqual(['été', 'à', 'montréal', '.']);
});

test('tokens separate the hyphen of est-ce que', () => {
  expect(tokensOf('est-ce que')).toEqual(['est', '-', 'ce', 'que']);
});

test('an empty sentence has no tokens', () => {
  expect(tokensOf('')).toEqual([]);
});

test('normalization changes straight apostrophes, collapses whitespace and trims', () => {
  expect(normalizeSentence(" \t J'aime  le\n café. \r\n")).toBe('J’aime le café.');
});

test('normalization also collapses no-break spaces without removing the separator', () => {
  expect(normalizeSentence('\u00a0Nous\u00a0 \t allons à la plage\u00a0?\u00a0')).toBe('Nous allons à la plage ?');
});
