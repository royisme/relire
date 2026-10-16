/**
 * Grammar taxonomy (A1-C1) that tags every exercise item and attempt, and the
 * one-way mapping from FrenchLab's 14 textbook-specific categories.
 * Owns tag IDs, their area grouping and the legacy mapping. Does not own
 * labels (they live in the locale files) or any exercise shape.
 */
import { z } from 'zod';

/** Tags grouped by area. Tag IDs are stable storage values; never rename one. */
export const GRAMMAR_AREAS = {
  'nouns-determiners': ['gender-number', 'articles', 'partitive-quantity', 'possessive-demonstrative'],
  'adjectives-adverbs': ['adjective-agreement', 'adjective-position', 'comparison', 'adverbs'],
  'verbs-forms': [
    'present',
    'passe-compose',
    'imparfait',
    'plus-que-parfait',
    'future',
    'conditional',
    'subjunctive',
    'imperative',
    'pronominal-verbs',
    'passive',
  ],
  'verbs-use': [
    'tense-choice-past',
    'past-participle-agreement',
    'hypothesis-si',
    'reported-speech',
    'infinitive-gerund',
  ],
  pronouns: ['subject-object-pronouns', 'y-en', 'relative-pronouns', 'other-pronouns'],
  sentence: ['negation', 'questions', 'prepositions', 'connectors', 'word-order'],
  skills: ['numbers-time', 'vocabulary-usage', 'reading-comprehension', 'listening-dictation', 'written-expression'],
} as const;

export type GrammarAreaId = keyof typeof GRAMMAR_AREAS;
export type GrammarTag = (typeof GRAMMAR_AREAS)[GrammarAreaId][number];

/** Area IDs in display order. */
export const GRAMMAR_AREA_IDS = Object.keys(GRAMMAR_AREAS) as GrammarAreaId[];

const flatTags: GrammarTag[] = Object.values(GRAMMAR_AREAS).flat();

/** Every tag, in area order. */
export const GRAMMAR_TAGS: readonly GrammarTag[] = flatTags;

export const GrammarTagSchema = z.enum(flatTags as [GrammarTag, ...GrammarTag[]]);

export function isGrammarTag(value: unknown): value is GrammarTag {
  return typeof value === 'string' && (flatTags as string[]).includes(value);
}

/** The area a tag belongs to. */
export function grammarAreaOf(tag: GrammarTag): GrammarAreaId {
  for (const area of GRAMMAR_AREA_IDS) if ((GRAMMAR_AREAS[area] as readonly string[]).includes(tag)) return area;
  // Unreachable while flatTags is derived from GRAMMAR_AREAS.
  throw new Error(`Grammar tag without an area: ${tag}`);
}

/** FrenchLab's 14 categories and where each lands in the taxonomy. */
export const FRENCHLAB_GRAMMAR_TAG_MAP: Readonly<Record<string, GrammarTag>> = {
  'gender-agreement': 'gender-number',
  'nationality-adjectives': 'adjective-agreement',
  'country-prepositions': 'prepositions',
  'verb-conjugation-etre': 'present',
  'verb-conjugation-sappeler': 'present',
  'verb-conjugation-aller-avoir': 'present',
  'pronouns-subject': 'subject-object-pronouns',
  'definite-articles': 'articles',
  'possessive-adjectives': 'possessive-demonstrative',
  'numbers-time': 'numbers-time',
  'question-formulation': 'questions',
  'dialogue-comprehension': 'reading-comprehension',
  'reading-comprehension': 'reading-comprehension',
  'professions-vocabulary': 'vocabulary-usage',
};

export class UnknownGrammarTagError extends Error {
  readonly tag: string;
  constructor(tag: string) {
    super(`Unknown FrenchLab grammar tag: ${JSON.stringify(tag)}`);
    this.name = 'UnknownGrammarTagError';
    this.tag = tag;
  }
}

/**
 * Maps a FrenchLab category to the taxonomy. A tag outside the 14 known
 * categories throws `UnknownGrammarTagError`: a restore must stop or ask the
 * learner, never file an attempt under a guessed tag.
 */
export function mapFrenchLabGrammarTag(tag: string): GrammarTag {
  if (Object.hasOwn(FRENCHLAB_GRAMMAR_TAG_MAP, tag)) return FRENCHLAB_GRAMMAR_TAG_MAP[tag];
  throw new UnknownGrammarTagError(tag);
}
