/**
 * Grammar pack generator: builds one verb (every cell, lead and participle)
 * from a verb spec, the rule tables and the explicit irregular table. Pure and
 * deterministic, no I/O. Also returns the stem/ending parts of each simple cell
 * for checks.ts and the browser's ending highlights and reference table. Does not own the
 * rule tables (rules.ts) or the checks (checks.ts).
 */
import {
  FINITE_PERSONS,
  IMPERATIVE_PERSONS,
  isPronominalInfinitive,
  type Cell,
  type ImperativePerson,
  type Person,
  type RuleId,
  type Tense,
  type Verb,
} from '../../types/grammarPack';
import {
  CONDITIONNEL_ENDINGS,
  FUTUR_ENDINGS,
  IMPARFAIT_ENDINGS,
  IMPERATIVE_CLITICS,
  REGULAR_RULES,
  SUBJONCTIF_ENDINGS,
  composeLead,
  joinParts,
  passeComposeForms,
  pastParticiples,
  personIndex,
  type Parts,
} from './rules';

/** One entry of verbs.json (the part the generator reads). */
export interface VerbSpec {
  id: string;
  infinitive: string;
  /** Infinitive without pronoun and without `-er`, `-ir` or `-re`; not used by `irregular`. */
  base?: string;
  rule: RuleId;
  aux: Verb['aux'];
  defective?: Verb['defective'];
  pcInvariable?: true;
  hAspire?: true;
}

/** Explicit forms of an `irregular` verb; person records are partial for defective verbs. */
export interface IrregularForms {
  present: Partial<Record<Person, string>>;
  imparfaitStem: string;
  futurStem: string;
  subjonctif: Partial<Record<Person, string>>;
  /** Overrides the imperatif derived from the present (être, avoir). */
  imperatif?: Record<ImperativePerson, string>;
}

/** `forms` is required for rule `irregular`; other rules read only the past participle (`ouvert`). */
export interface IrregularEntry {
  participles: { present?: string; past: string };
  forms?: IrregularForms;
}

export type SimpleTense = Exclude<Tense, 'passeCompose'>;
export type SimpleParts = Record<SimpleTense, Partial<Record<Person, Parts[]>>>;

export interface GeneratedVerb {
  spec: VerbSpec;
  /** The shipped row; `prov` is a draft until the build derives its status. */
  verb: Verb;
  parts: { simple: SimpleParts; presentParticiple?: Parts };
  /** The imperatif came from the irregular table, not from the present. */
  imperatifExplicit: boolean;
}

const personsOf = (defective: Verb['defective']): readonly Person[] =>
  defective === 'impersonal' ? ['3sg'] : defective === 'third-person' ? ['3sg', '3pl'] : FINITE_PERSONS;

const forEachPerson = <T>(persons: readonly Person[], make: (person: Person, index: number) => T) =>
  Object.fromEntries(persons.map((person) => [person, make(person, personIndex(person))])) as Partial<
    Record<Person, T>
  >;

/** Drops the `s` of a tu form in `-es` or `-as` (parles to parle, vas to va). */
function dropS(parts: Parts): Parts {
  if (!/[ea]s$/.test(parts.stem + parts.ending)) return parts;
  return parts.ending === ''
    ? { ...parts, stem: parts.stem.slice(0, -1) }
    : { ...parts, ending: parts.ending.slice(0, -1) };
}

interface TensesAndParticiples {
  simple: Omit<SimpleParts, 'imperatif'>;
  presentParticiple?: Parts;
  past: string;
  imperatif?: Record<ImperativePerson, string>;
}

function regularParts(spec: VerbSpec, persons: readonly Person[], entry?: IrregularEntry): TensesAndParticiples {
  if (spec.rule === 'irregular' || spec.base === undefined) throw new Error(`${spec.id}: rule needs a base`);
  const stems = REGULAR_RULES[spec.rule](spec.base);
  const past = entry?.participles.past ?? stems.past;
  if (past === undefined) throw new Error(`${spec.id}: ${spec.rule} needs a past participle in the irregular table`);
  const build = (stemsOf: (person: Person) => string[], endings: readonly string[]) =>
    forEachPerson(persons, (person, i) => stemsOf(person).map((stem) => ({ stem, ending: endings[i] })));
  return {
    simple: {
      present: build(stems.present, stems.presentEndings),
      imparfait: build(stems.imparfait, IMPARFAIT_ENDINGS),
      futur: build(() => stems.futur, FUTUR_ENDINGS),
      conditionnel: build(() => stems.futur, CONDITIONNEL_ENDINGS),
      subjonctif: build(stems.subjonctif, SUBJONCTIF_ENDINGS),
    },
    presentParticiple: { stem: stems.participle, ending: 'ant' },
    past,
  };
}

function irregularParts(spec: VerbSpec, persons: readonly Person[], entry?: IrregularEntry): TensesAndParticiples {
  const forms = entry?.forms;
  if (!entry || !forms) throw new Error(`${spec.id}: rule irregular needs forms in the irregular table`);
  const explicit = (table: Partial<Record<Person, string>>, person: Person): Parts[] => {
    const form = table[person];
    if (form === undefined) throw new Error(`${spec.id}: the irregular table has no ${person} form`);
    return [{ stem: form, ending: '' }];
  };
  return {
    simple: {
      present: forEachPerson(persons, (person) => explicit(forms.present, person)),
      imparfait: forEachPerson(persons, (_, i) => [{ stem: forms.imparfaitStem, ending: IMPARFAIT_ENDINGS[i] }]),
      futur: forEachPerson(persons, (_, i) => [{ stem: forms.futurStem, ending: FUTUR_ENDINGS[i] }]),
      conditionnel: forEachPerson(persons, (_, i) => [{ stem: forms.futurStem, ending: CONDITIONNEL_ENDINGS[i] }]),
      subjonctif: forEachPerson(persons, (person) => explicit(forms.subjonctif, person)),
    },
    presentParticiple: entry.participles.present ? { stem: entry.participles.present, ending: '' } : undefined,
    past: entry.participles.past,
    imperatif: forms.imperatif,
  };
}

export function generateVerb(spec: VerbSpec, irregulars: Record<string, IrregularEntry>): GeneratedVerb {
  const pronominal = isPronominalInfinitive(spec.infinitive);
  const persons = personsOf(spec.defective);
  const entry = irregulars[spec.id];
  const built = spec.rule === 'irregular' ? irregularParts(spec, persons, entry) : regularParts(spec, persons, entry);

  // The imperatif comes from the present (nous and vous as is, tu without its s) unless the table overrides it.
  const imperatifParts: Partial<Record<Person, Parts[]>> = {};
  if (!spec.defective) {
    for (const person of IMPERATIVE_PERSONS) {
      const clitic = pronominal ? IMPERATIVE_CLITICS[person] : undefined;
      const variants: Parts[] = built.imperatif
        ? [{ stem: built.imperatif[person], ending: '' }]
        : (built.simple.present[person] ?? []).map((parts) => (person === '2sg' ? dropS(parts) : parts));
      imperatifParts[person] = variants.map((parts) => (clitic ? { ...parts, clitic } : parts));
    }
  }
  const simple: SimpleParts = { ...built.simple, imperatif: imperatifParts };

  const participles = pastParticiples(built.past);
  const leadVerb = { pronominal, defective: spec.defective, hAspire: spec.hAspire };
  const cell = (tense: Tense, person: Person, forms: string[]): Cell => ({
    lead: composeLead(tense, person, leadVerb, forms[0]),
    forms,
  });
  const cells = (tense: SimpleTense) =>
    Object.fromEntries(
      Object.entries(simple[tense]).map(([person, variants]) => [
        person,
        cell(tense, person as Person, variants.map(joinParts)),
      ]),
    );

  const verb: Verb = {
    id: spec.id,
    infinitive: spec.infinitive,
    pronominal,
    aux: spec.aux,
    rule: spec.rule,
    ...(spec.defective && { defective: spec.defective }),
    ...(spec.pcInvariable && { pcInvariable: spec.pcInvariable }),
    tenses: {
      present: cells('present'),
      passeCompose: forEachPerson(persons, (person) =>
        cell('passeCompose', person, passeComposeForms(spec, person, participles)),
      ),
      imparfait: cells('imparfait'),
      futur: cells('futur'),
      conditionnel: cells('conditionnel'),
      subjonctif: cells('subjonctif'),
      ...(!spec.defective && { imperatif: cells('imperatif') }),
    },
    participles: {
      ...(built.presentParticiple && { present: joinParts(built.presentParticiple) }),
      past: participles,
    },
    prov: { origin: entry ? 'irregular-table' : 'rule', checkedAgainst: [], status: 'draft' },
  };

  return {
    spec,
    verb,
    parts: { simple, presentParticiple: built.presentParticiple },
    imperatifExplicit: built.imperatif !== undefined,
  };
}
