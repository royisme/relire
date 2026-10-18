/**
 * Grammar pack machine checks: verify generator output (the shipped row plus
 * the stem/ending parts that are never shipped) and compare the control verbs
 * with their hand-typed goldens. Each check returns failure messages that name
 * the verb, tense and person; an empty array means it passed. Does not own
 * generating forms (generate.ts) or deriving a row's status (the build).
 */
import {
  FINITE_PERSONS,
  IMPERATIVE_PERSONS,
  TENSES,
  VerbSchema,
  type Cell,
  type Person,
  type Tense,
  type Verb,
} from '../../src/types/grammarPack';
import { GOLDEN } from '../../tests/fixtures/grammarPackGolden';
import type { GeneratedVerb, SimpleTense } from '../../src/services/conjugation/generate';
import {
  IMPERATIVE_CLITICS,
  composeLead,
  joinParts,
  passeComposeForms,
  pastParticiples,
  type Parts,
} from '../../src/services/conjugation/rules';

const SIMPLE_TENSES = TENSES.filter((tense): tense is SimpleTense => tense !== 'passeCompose');

function* cellsOf({ verb }: GeneratedVerb) {
  for (const tense of TENSES) {
    for (const [person, cell] of Object.entries(verb.tenses[tense] ?? {}))
      yield { tense, person: person as Person, cell };
  }
}

/** A cell by tense and person; imperatif only has three persons, so the union needs one cast. */
export const cellAt = (verb: Pick<Verb, 'tenses'>, tense: Tense, person: Person) =>
  (verb.tenses[tense] as Partial<Record<Person, Cell>> | undefined)?.[person];

const where = (g: GeneratedVerb, tense: string, person?: string) =>
  [g.verb.id, tense, person].filter(Boolean).join(' ');

/** The schema invariants (all persons present, lead rules, NFC, aux), run on the raw row. */
export function checkSchema(g: GeneratedVerb): string[] {
  const result = VerbSchema.safeParse(g.verb);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${g.verb.id} ${issue.path.join(' ')}: ${issue.message}`);
}

/** Lowercase and whitespace; the schema trims before it refines, so raw strings are checked here. */
export function checkShape(g: GeneratedVerb): string[] {
  const failures: string[] = [];
  const bad = (text: string) => text !== text.toLowerCase() || text !== text.trim() || /\s{2}|[^\S ]/.test(text);
  for (const { tense, person, cell } of cellsOf(g)) {
    for (const text of [cell.lead, ...cell.forms]) {
      if (bad(text)) failures.push(`${where(g, tense, person)}: "${text}" is not lowercase or has odd whitespace`);
    }
  }
  const { present, past } = g.verb.participles;
  for (const text of [present ?? '', ...Object.values(past)]) {
    if (bad(text)) failures.push(`${where(g, 'participles')}: "${text}" is not lowercase or has odd whitespace`);
  }
  return failures;
}

/** Every form is its parts joined: stem + ending (+ the clitic of a pronominal imperatif). */
export function checkStemEnding(g: GeneratedVerb): string[] {
  const failures: string[] = [];
  for (const tense of SIMPLE_TENSES) {
    for (const [person, cell] of Object.entries(g.verb.tenses[tense] ?? {})) {
      const parts = g.parts.simple[tense][person as Person] ?? [];
      const joined = parts.map(joinParts);
      if (JSON.stringify(joined) !== JSON.stringify(cell.forms)) {
        failures.push(
          `${where(g, tense, person)}: parts ${JSON.stringify(joined)} differ from forms ${JSON.stringify(cell.forms)}`,
        );
      }
    }
  }
  const present = g.parts.presentParticiple;
  if ((present && joinParts(present)) !== g.verb.participles.present) {
    failures.push(`${where(g, 'participles')}: present participle differs from its parts`);
  }
  return failures;
}

/** The lead re-derived from the stored forms equals the stored lead. */
export function checkLead(g: GeneratedVerb): string[] {
  const leadVerb = { pronominal: g.verb.pronominal, defective: g.verb.defective, hAspire: g.spec.hAspire };
  const failures: string[] = [];
  for (const { tense, person, cell } of cellsOf(g)) {
    const expected = composeLead(tense, person, leadVerb, cell.forms[0]);
    if (cell.lead !== expected)
      failures.push(`${where(g, tense, person)}: lead "${cell.lead}" should be "${expected}"`);
  }
  return failures;
}

/** Passé composé is the auxiliary plus the participle, with the agreement variants the verb allows. */
export function checkPasseCompose(g: GeneratedVerb): string[] {
  const failures: string[] = [];
  const { past } = g.verb.participles;
  if (JSON.stringify(pastParticiples(past.ms)) !== JSON.stringify(past)) {
    failures.push(`${where(g, 'participles')}: past participle agreement does not follow from "${past.ms}"`);
  }
  for (const [person, cell] of Object.entries(g.verb.tenses.passeCompose)) {
    const expected = passeComposeForms(g.verb, person as Person, past);
    if (JSON.stringify(cell.forms) !== JSON.stringify(expected)) {
      failures.push(
        `${where(g, 'passeCompose', person)}: ${JSON.stringify(cell.forms)} should be ${JSON.stringify(expected)}`,
      );
    }
  }
  return failures;
}

/** The imperatif follows the present: nous and vous as is, tu without its s, then the clitic. */
export function checkImperatif(g: GeneratedVerb): string[] {
  const { imperatif, present } = g.verb.tenses;
  if (!imperatif || g.imperatifExplicit) return [];
  const failures: string[] = [];
  for (const person of IMPERATIVE_PERSONS) {
    const clitic = g.verb.pronominal ? IMPERATIVE_CLITICS[person] : '';
    const forms = (imperatif[person]?.forms ?? []).map((form) =>
      clitic && form.endsWith(clitic) ? form.slice(0, -clitic.length) : form,
    );
    const expected = (present[person]?.forms ?? []).map((form) =>
      person === '2sg' && /[ea]s$/.test(form) ? form.slice(0, -1) : form,
    );
    if (
      JSON.stringify(forms) !== JSON.stringify(expected) ||
      (clitic && !imperatif[person]?.forms.every((form) => form.endsWith(clitic)))
    ) {
      failures.push(
        `${where(g, 'imperatif', person)}: ${JSON.stringify(imperatif[person]?.forms)} does not follow the present ${JSON.stringify(present[person]?.forms)}`,
      );
    }
  }
  return failures;
}

/** Spelling-change families, checked at the stem/ending boundary where the stem is the infinitive stem. */
export function checkFamily(g: GeneratedVerb): string[] {
  const failures: string[] = [];
  const { rule } = g.verb;
  const form = (tense: Tense, person: Person) => cellAt(g.verb, tense, person)?.forms[0] ?? '';
  const boundary = (tense: string, person: string | undefined, { stem, ending }: Parts) => {
    const softEnding = /^[ao]/.test(ending);
    if (rule === 'er-cer' && stem.endsWith('ç') !== softEnding) {
      failures.push(`${where(g, tense, person)}: ç must stand before a or o and only there (${stem}|${ending})`);
    }
    if (rule === 'er-ger' && stem.endsWith('ge') !== softEnding) {
      failures.push(`${where(g, tense, person)}: ge must stand before a or o and only there (${stem}|${ending})`);
    }
  };
  if (rule === 'er-cer' || rule === 'er-ger') {
    // futur and conditionnel keep -er in the stem, so they are not boundary cases
    for (const tense of ['present', 'imparfait', 'subjonctif', 'imperatif'] as const) {
      for (const [person, variants] of Object.entries(g.parts.simple[tense])) {
        for (const parts of variants) boundary(tense, person, parts);
      }
    }
    if (g.parts.presentParticiple) boundary('participles', undefined, g.parts.presentParticiple);
  }
  if (rule === 'er-ger') {
    if (!form('present', '1pl').endsWith('geons')) failures.push(`${where(g, 'present', '1pl')}: expected -geons`);
    if (!form('imparfait', '1sg').endsWith('geais')) failures.push(`${where(g, 'imparfait', '1sg')}: expected -geais`);
  }
  if (rule === 'ir-issons') {
    if (!form('present', '1pl').endsWith('issons')) failures.push(`${where(g, 'present', '1pl')}: expected -issons`);
    for (const tense of ['imparfait', 'subjonctif'] as const) {
      if (!form(tense, '1pl').endsWith('issions')) failures.push(`${where(g, tense, '1pl')}: expected -issions`);
    }
  }
  return failures;
}

export function checkVerb(g: GeneratedVerb): string[] {
  return [
    ...checkSchema(g),
    ...checkShape(g),
    ...checkStemEnding(g),
    ...checkLead(g),
    ...checkPasseCompose(g),
    ...checkImperatif(g),
    ...checkFamily(g),
  ];
}

/** Every control verb is present and equals its hand-typed golden in all seven tenses and the participles. */
export function checkControls(generated: GeneratedVerb[]): string[] {
  const failures: string[] = [];
  for (const golden of Object.values(GOLDEN)) {
    const g = generated.find(({ verb }) => verb.id === golden.id);
    if (!g) {
      failures.push(`${golden.id}: control verb is missing`);
      continue;
    }
    const { verb } = g;
    for (const key of ['infinitive', 'pronominal', 'aux', 'rule'] as const) {
      if (verb[key] !== golden[key]) failures.push(`${golden.id} ${key}: ${verb[key]} should be ${golden[key]}`);
    }
    for (const tense of TENSES) {
      const persons = new Set([...Object.keys(golden.tenses[tense] ?? {}), ...Object.keys(verb.tenses[tense] ?? {})]);
      for (const person of FINITE_PERSONS.filter((p) => persons.has(p))) {
        const actual = JSON.stringify(cellAt(verb, tense, person));
        const expected = JSON.stringify(cellAt(golden, tense, person));
        if (actual !== expected) failures.push(`${golden.id} ${tense} ${person}: ${actual} should be ${expected}`);
      }
    }
    if (JSON.stringify(verb.participles) !== JSON.stringify(golden.participles)) {
      failures.push(
        `${golden.id} participles: ${JSON.stringify(verb.participles)} should be ${JSON.stringify(golden.participles)}`,
      );
    }
  }
  return failures;
}
