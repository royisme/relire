/**
 * Grammar taxonomy (A1-C1) that tags every exercise item and attempt.
 * Owns tag IDs and their area grouping. Does not own labels (they live in the
 * locale files) or any exercise shape.
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
