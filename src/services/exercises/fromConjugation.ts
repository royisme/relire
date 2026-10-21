/**
 * Conjugation drills as standalone WORD_TRANSFORM units (grammar-pack.md
 * Part 1 section 7 with the Part 3 F7 revision): one unit per selected tense,
 * items sampled from the gradable cells (`reviewed` and `match`) of verified
 * verb views. Owns the mapping of a verb view into exercise items, prompts and
 * tags. Does not verify verbs (conjugation/verify), call AI or store anything.
 */
import type { TFunction } from 'i18next';
import type { VerifiedVerb } from '../conjugation/verify';
import { ExerciseUnitSchema, type ExerciseLevel, type ExerciseUnit } from '../../types/exercises';
import type { GrammarTag } from '../../types/grammar';
import { FINITE_PERSONS, IMPERATIVE_PERSONS, TENSES, type Person, type Tense } from '../../types/grammarPack';

/** The grammar tag each tense drills on (Part 1 Q7: tense granularity only). */
const TENSE_TAG: Record<Tense, GrammarTag> = {
  present: 'present',
  passeCompose: 'passe-compose',
  imparfait: 'imparfait',
  plusQueParfait: 'plus-que-parfait',
  futur: 'future',
  futurAnterieur: 'future',
  conditionnel: 'conditional',
  conditionnelPasse: 'conditional',
  subjonctif: 'subjunctive',
  subjonctifPasse: 'subjunctive',
  imperatif: 'imperative',
};

/** What a drill set starts from: the level is a free choice, A2 because the first verbs a learner meets are simple. */
export const DEFAULT_DRILL_LEVEL: ExerciseLevel = 'A2';
export const DEFAULT_DRILL_COUNT = 8;

/** Verbs named in the set title before the count takes over. */
const TITLE_VERBS = 3;

export interface ConjugationDrillInput {
  /** Verified verb views; the pack path yields them through `verifyPackVerb`. */
  verbs: VerifiedVerb[];
  tenses: Tense[];
  level: ExerciseLevel;
  /** The pack the verbs came from; carried on every item of a pack batch. */
  packVersion?: string;
  perUnit?: number;
  maxPerVerb?: number;
  rng?: () => number;
  makeId?: () => string;
  now?: () => number;
  t: TFunction;
}

/** One `(verb, person)` cell that can be asked as an item. */
interface GradableCell {
  verb: VerifiedVerb;
  person: Person;
  lead: string;
  forms: string[];
  verification: 'reviewed' | 'match';
}

/**
 * `"<lead> ... (infinitive), <tense>"`, and for the imperative (no lead) the
 * person label too, so the prompt states what to write on its own: the attempt
 * log stores only the prompt.
 */
function promptOf(tense: Tense, person: Person, lead: string, infinitive: string, t: TFunction): string {
  const tenseLabel = t(`conjugation.tenses.${tense}.name`);
  const head = `${lead}${lead === '' || lead.endsWith('’') ? '' : ' '}... (${infinitive}), ${tenseLabel}`;
  return tense === 'imperatif' ? `${head}, ${t(`conjugation.persons.${person}`)}` : head;
}

/** The gradable cells of one tense, in person order per verb. */
function gradableCells(verbs: VerifiedVerb[], tense: Tense): GradableCell[] {
  const persons: readonly Person[] = tense === 'imperatif' ? IMPERATIVE_PERSONS : FINITE_PERSONS;
  const cells: GradableCell[] = [];
  for (const verb of verbs)
    for (const person of persons) {
      const cell = verb.tenses[tense][person];
      if (cell && (cell.status === 'reviewed' || cell.status === 'match'))
        cells.push({ verb, person, lead: cell.lead, forms: cell.forms, verification: cell.status });
    }
  return cells;
}

/** Whether any cell of the verb can be asked: the Conjugation page offers drills only then. */
export const hasGradableCell = (verb: VerifiedVerb) => TENSES.some((tense) => gradableCells([verb], tense).length > 0);

function sampleCells(pool: GradableCell[], perUnit: number, maxPerVerb: number, rng: () => number): GradableCell[] {
  // Fisher-Yates on a copy, then a greedy walk: the cap is per verb, so any
  // order reaches the same count; the shuffle only picks which cells.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const perVerb = new Map<VerifiedVerb, number>();
  const picked: GradableCell[] = [];
  for (const cell of shuffled) {
    if (picked.length >= perUnit) break;
    const used = perVerb.get(cell.verb) ?? 0;
    if (used >= maxPerVerb) continue;
    perVerb.set(cell.verb, used + 1);
    picked.push(cell);
  }
  return picked;
}

/** "parler, être and 3 more": a short list, the rest counted. */
function setTitleOf(verbs: VerifiedVerb[], t: TFunction): string {
  const names = verbs.map((verb) => verb.infinitive);
  const listed = names.slice(0, TITLE_VERBS).join(', ');
  const extra = names.length - TITLE_VERBS;
  const label = extra > 0 ? `${listed} ${t('conjugation.drill.more', { count: extra })}` : listed;
  return t('conjugation.drill.setTitle', { verbs: label });
}

/**
 * Builds one batch: a unit per selected tense that has at least one gradable
 * cell (fewer items than `perUnit` when the pool is smaller). Every unit is
 * validated with `ExerciseUnitSchema` before it is returned.
 */
export function prepareConjugationDrills({
  verbs,
  tenses,
  level,
  packVersion,
  perUnit = DEFAULT_DRILL_COUNT,
  maxPerVerb = 2,
  rng = Math.random,
  makeId = () => crypto.randomUUID(),
  now = () => Date.now(),
  t,
}: ConjugationDrillInput): ExerciseUnit[] {
  const setId = makeId();
  const createdAt = now();
  const setTitle = setTitleOf(verbs, t);

  const units: ExerciseUnit[] = [];
  for (const tense of tenses) {
    const cells = sampleCells(gradableCells(verbs, tense), perUnit, maxPerVerb, rng);
    if (!cells.length) continue;
    const items = cells.map((cell, index) => ({
      id: `${cell.verb.infinitive}:${tense}:${cell.person}`,
      itemNumber: index + 1,
      prompt: promptOf(tense, cell.person, cell.lead, cell.verb.infinitive, t),
      expectedAnswer: cell.forms[0],
      acceptableAnswers: cell.forms.slice(1),
      grammarTag: TENSE_TAG[tense],
      meta: {
        source: cell.verb.status === 'pack-reviewed' ? 'grammar-pack' : 'conjugation-engine',
        verification: cell.verification,
        ...(packVersion !== undefined && { packVersion }),
        verbId: cell.verb.infinitive,
        tense,
        person: cell.person,
        ...(cell.verb.rule !== undefined && { rule: cell.verb.rule }),
        strictAccents: true,
      },
    }));
    units.push(
      ExerciseUnitSchema.parse({
        id: `${setId}:${tense}`,
        setId,
        setTitle,
        level,
        createdAt,
        learningArea: 'grammar',
        section: 'CONJUGAISON',
        unitNumber: units.length + 1,
        title: t('conjugation.drill.title', { tense: t(`conjugation.tenses.${tense}.name`) }),
        instruction: t('conjugation.drill.instruction'),
        type: 'WORD_TRANSFORM',
        items,
        grammarTags: [TENSE_TAG[tense]],
      }),
    );
  }
  return units;
}
