import { expect, test } from 'bun:test';
import {
  GRAMMAR_AREAS,
  GRAMMAR_AREA_IDS,
  GRAMMAR_TAGS,
  GrammarTagSchema,
  grammarAreaOf,
  isGrammarTag,
} from '../src/types/grammar';

test('the taxonomy has the 37 tags of the plan in 7 areas', () => {
  expect(GRAMMAR_AREA_IDS).toEqual([
    'nouns-determiners',
    'adjectives-adverbs',
    'verbs-forms',
    'verbs-use',
    'pronouns',
    'sentence',
    'skills',
  ]);
  expect(GRAMMAR_AREA_IDS.map((area) => GRAMMAR_AREAS[area].length)).toEqual([4, 4, 10, 5, 4, 5, 5]);
  expect(GRAMMAR_TAGS).toHaveLength(37);
  expect(new Set(GRAMMAR_TAGS).size).toBe(37);
});

test('every tag belongs to exactly one area and validates', () => {
  for (const tag of GRAMMAR_TAGS) {
    expect(isGrammarTag(tag)).toBe(true);
    expect(GrammarTagSchema.safeParse(tag).success).toBe(true);
    const owners = GRAMMAR_AREA_IDS.filter((area) => (GRAMMAR_AREAS[area] as readonly string[]).includes(tag));
    expect(owners).toEqual([grammarAreaOf(tag)]);
  }
  expect(grammarAreaOf('passe-compose')).toBe('verbs-forms');
  expect(grammarAreaOf('y-en')).toBe('pronouns');
  expect(isGrammarTag('gender-agreement')).toBe(false);
  expect(isGrammarTag(3)).toBe(false);
});
