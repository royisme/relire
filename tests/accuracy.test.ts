/** Source-named tests for weighted areas and deterministic adaptive targets. */
import { expect, test } from 'bun:test';
import { accuracyByArea, weakGrammarTags } from '../src/services/exercises/accuracy';
import type { TagAccuracy } from '../src/storage/exerciseAttempts';
import type { GrammarTag } from '../src/types/grammar';
const tag = (grammarTag: GrammarTag, correct: number, total: number): TagAccuracy => ({
  grammarTag,
  correct,
  total,
  accuracy: correct / total,
});
test('area accuracy sums counts rather than averaging tag percentages, in taxonomy order', () => {
  expect(accuracyByArea([tag('present', 1, 1), tag('articles', 1, 10), tag('gender-number', 1, 1)])).toEqual([
    { area: 'nouns-determiners', correct: 2, total: 11, accuracy: 2 / 11 },
    { area: 'verbs-forms', correct: 1, total: 1, accuracy: 1 },
  ]);
});
test('empty and perfect attempts never invent weak topics or unseen areas', () => {
  expect(accuracyByArea([])).toEqual([]);
  expect(weakGrammarTags([])).toEqual([]);
  expect(weakGrammarTags([tag('present', 3, 3), tag('articles', 0, 0)])).toEqual([]);
});
test('up to three actual-error tags, sorted by ratio with taxonomy tie order', () => {
  expect(
    weakGrammarTags([
      tag('present', 1, 2),
      tag('adjective-agreement', 1, 2),
      tag('articles', 0, 2),
      tag('gender-number', 2, 4),
      tag('future', 9, 10),
    ]),
  ).toEqual(['articles', 'gender-number', 'adjective-agreement']);
});
