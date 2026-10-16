import { expect, test } from 'bun:test';
import {
  FRENCHLAB_GRAMMAR_TAG_MAP,
  GRAMMAR_AREAS,
  GRAMMAR_AREA_IDS,
  GRAMMAR_TAGS,
  GrammarTagSchema,
  UnknownGrammarTagError,
  grammarAreaOf,
  isGrammarTag,
  mapFrenchLabGrammarTag,
} from '../src/types/grammar';

/** The 14 categories FrenchLab shipped, and where docs/merge-plan.md section 6 sends each. */
const FRENCHLAB_TO_NEW: Array<[string, string]> = [
  ['gender-agreement', 'gender-number'],
  ['nationality-adjectives', 'adjective-agreement'],
  ['country-prepositions', 'prepositions'],
  ['verb-conjugation-etre', 'present'],
  ['verb-conjugation-sappeler', 'present'],
  ['verb-conjugation-aller-avoir', 'present'],
  ['pronouns-subject', 'subject-object-pronouns'],
  ['definite-articles', 'articles'],
  ['possessive-adjectives', 'possessive-demonstrative'],
  ['numbers-time', 'numbers-time'],
  ['question-formulation', 'questions'],
  ['dialogue-comprehension', 'reading-comprehension'],
  ['reading-comprehension', 'reading-comprehension'],
  ['professions-vocabulary', 'vocabulary-usage'],
];

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

test('all 14 FrenchLab categories map as specified', () => {
  expect(FRENCHLAB_TO_NEW).toHaveLength(14);
  for (const [old, mapped] of FRENCHLAB_TO_NEW) {
    expect([old, mapFrenchLabGrammarTag(old)]).toEqual([old, mapped]);
    expect(isGrammarTag(mapped)).toBe(true);
  }
  expect(Object.keys(FRENCHLAB_GRAMMAR_TAG_MAP).sort()).toEqual(FRENCHLAB_TO_NEW.map(([old]) => old).sort());
});

test('an unknown tag throws instead of being guessed', () => {
  for (const unknown of ['', 'imparfait', 'Gender-Agreement', 'constructor', '__proto__', 'toString']) {
    expect(() => mapFrenchLabGrammarTag(unknown)).toThrow(UnknownGrammarTagError);
  }
  try {
    mapFrenchLabGrammarTag('mystery');
  } catch (error) {
    expect((error as UnknownGrammarTagError).tag).toBe('mystery');
  }
});
