/**
 * Grammar pack rules: the ending tables, the stem changes of the regular rule
 * families, participle agreement, the passé composé auxiliaries and the lead
 * algorithm. Pure data and functions with no I/O. Does not own building a whole
 * verb (generate.ts) or verifying one (checks.ts).
 */
import type { ImperativePerson, Person, RuleId, Tense, Verb } from '../../src/types/grammarPack';
import { FINITE_PERSONS } from '../../src/types/grammarPack';

/** One simple-tense cell variant; the form is stem + ending + clitic (imperatif of a pronominal verb). */
export interface Parts {
  stem: string;
  ending: string;
  clitic?: string;
}
export const joinParts = (parts: Parts) => parts.stem + parts.ending + (parts.clitic ?? '');

export const personIndex = (person: Person) => FINITE_PERSONS.indexOf(person);

/** Endings shared by every verb that is not irregular; present endings belong to the rule. */
export const IMPARFAIT_ENDINGS = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'] as const;
export const FUTUR_ENDINGS = ['ai', 'as', 'a', 'ons', 'ez', 'ont'] as const;
export const SUBJONCTIF_ENDINGS = ['e', 'es', 'e', 'ions', 'iez', 'ent'] as const;
// The conditionnel takes the futur stem with the imparfait endings.
export const CONDITIONNEL_ENDINGS = IMPARFAIT_ENDINGS;

export const IMPERATIVE_CLITICS: Record<ImperativePerson, string> = {
  '2sg': '-toi',
  '1pl': '-nous',
  '2pl': '-vous',
};

// ---- Regular rule families -------------------------------------------------

/** The stems of one regular verb, per tense and person; variants are listed primary first. */
export interface RegularStems {
  presentEndings: readonly string[];
  present: (person: Person) => string[];
  imparfait: (person: Person) => string[];
  /** Stem of futur and conditionnel, including the infinitive's `r`. */
  futur: string[];
  subjonctif: (person: Person) => string[];
  /** Stem before `ant`. */
  participle: string;
  /** Past participle; absent when it comes from the irregular table (`ir-ouvrir`). */
  past?: string;
}

const ER_ENDINGS = ['e', 'es', 'e', 'ons', 'ez', 'ent'];
// je, tu, il, ils: the persons whose stem changes in the `-er` spelling-change rules.
const STRONG = new Set<Person>(['1sg', '2sg', '3sg', '3pl']);
const SINGULAR = new Set<Person>(['1sg', '2sg', '3sg']);

const always = (stems: string[]) => () => stems;
const when = (test: (person: Person) => boolean, yes: string[], no: string[]) => (person: Person) =>
  test(person) ? yes : no;
const strongOnly = (strong: string, weak: string) => when((person) => STRONG.has(person), [strong], [weak]);
const replaceLast = (word: string, from: string, to: string) => {
  const at = word.lastIndexOf(from);
  return word.slice(0, at) + to + word.slice(at + from.length);
};

/** Each function takes the base: the infinitive without pronoun and without `-er`, `-ir` or `-re`. */
export const REGULAR_RULES: Record<Exclude<RuleId, 'irregular'>, (base: string) => RegularStems> = {
  'er-regular': (b) => ({
    presentEndings: ER_ENDINGS,
    present: always([b]),
    imparfait: always([b]),
    futur: [`${b}er`],
    subjonctif: always([b]),
    participle: b,
    past: `${b}é`,
  }),
  'er-cer': (b) => {
    const soft = `${b.slice(0, -1)}ç`;
    return {
      presentEndings: ER_ENDINGS,
      present: when((person) => person === '1pl', [soft], [b]),
      imparfait: strongOnly(soft, b),
      futur: [`${b}er`],
      subjonctif: always([b]),
      participle: soft,
      past: `${b}é`,
    };
  },
  'er-ger': (b) => {
    const soft = `${b}e`;
    return {
      presentEndings: ER_ENDINGS,
      present: when((person) => person === '1pl', [soft], [b]),
      imparfait: strongOnly(soft, b),
      futur: [`${b}er`],
      subjonctif: always([b]),
      participle: soft,
      past: `${b}é`,
    };
  },
  'er-yer-i': (b) => {
    const i = `${b.slice(0, -1)}i`;
    // -ayer verbs also keep the y (paie / paye).
    const stems = b.endsWith('ay') ? [i, b] : [i];
    return {
      presentEndings: ER_ENDINGS,
      present: when((person) => STRONG.has(person), stems, [b]),
      imparfait: always([b]),
      futur: stems.map((stem) => `${stem}er`),
      subjonctif: when((person) => STRONG.has(person), stems, [b]),
      participle: b,
      past: `${b}é`,
    };
  },
  'er-e-grave': (b) => {
    const grave = replaceLast(b, 'e', 'è');
    return {
      presentEndings: ER_ENDINGS,
      present: strongOnly(grave, b),
      imparfait: always([b]),
      futur: [`${grave}er`],
      subjonctif: strongOnly(grave, b),
      participle: b,
      past: `${b}é`,
    };
  },
  'er-eacute-egrave': (b) => {
    const grave = replaceLast(b, 'é', 'è');
    return {
      presentEndings: ER_ENDINGS,
      present: strongOnly(grave, b),
      imparfait: always([b]),
      futur: [`${b}er`],
      subjonctif: strongOnly(grave, b),
      participle: b,
      past: `${b}é`,
    };
  },
  'er-eler-double': (b) => {
    const double = b + b.slice(-1);
    return {
      presentEndings: ER_ENDINGS,
      present: strongOnly(double, b),
      imparfait: always([b]),
      futur: [`${double}er`],
      subjonctif: strongOnly(double, b),
      participle: b,
      past: `${b}é`,
    };
  },
  'ir-issons': (b) => ({
    presentEndings: ['is', 'is', 'it', 'ons', 'ez', 'ent'],
    present: when((person) => SINGULAR.has(person), [b], [`${b}iss`]),
    imparfait: always([`${b}iss`]),
    futur: [`${b}ir`],
    subjonctif: always([`${b}iss`]),
    participle: `${b}iss`,
    past: `${b}i`,
  }),
  'ir-sortir': (b) => ({
    presentEndings: ['s', 's', 't', 'ons', 'ez', 'ent'],
    present: when((person) => SINGULAR.has(person), [b.slice(0, -1)], [b]),
    imparfait: always([b]),
    futur: [`${b}ir`],
    subjonctif: always([b]),
    participle: b,
    past: `${b}i`,
  }),
  'ir-ouvrir': (b) => ({
    presentEndings: ER_ENDINGS,
    present: always([b]),
    imparfait: always([b]),
    futur: [`${b}ir`],
    subjonctif: always([b]),
    participle: b,
  }),
  're-regular': (b) => ({
    presentEndings: ['s', 's', '', 'ons', 'ez', 'ent'],
    present: always([b]),
    imparfait: always([b]),
    futur: [`${b}r`],
    subjonctif: always([b]),
    participle: b,
    past: `${b}u`,
  }),
};

// ---- Participles and passé composé -----------------------------------------

const INVARIABLE_PARTICIPLES = new Set(['été', 'fallu', 'plu']);

export interface PastParticiples {
  ms: string;
  fs: string;
  mp: string;
  fp: string;
}

export function pastParticiples(ms: string): PastParticiples {
  if (INVARIABLE_PARTICIPLES.has(ms)) return { ms, fs: ms, mp: ms, fp: ms };
  const fs = `${ms}e`;
  return { ms, fs, mp: /[sx]$/.test(ms) ? ms : `${ms}s`, fp: `${fs}s` };
}

export const AUXILIARY_PRESENT = {
  avoir: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
  etre: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
} as const;

/** Passé composé forms of one cell: agreement variants only with `être` and without `pcInvariable`. */
export function passeComposeForms(
  verb: Pick<Verb, 'aux' | 'pcInvariable'>,
  person: Person,
  participles: PastParticiples,
): string[] {
  const aux = AUXILIARY_PRESENT[verb.aux][personIndex(person)];
  if (verb.pcInvariable || verb.aux === 'avoir') return [`${aux} ${participles.ms}`];
  const plural = person.endsWith('pl');
  return [participles[plural ? 'mp' : 'ms'], participles[plural ? 'fp' : 'fs']].map((form) => `${aux} ${form}`);
}

// ---- Lead ------------------------------------------------------------------

const SUBJECT: Record<Person, string> = {
  '1sg': 'je',
  '2sg': 'tu',
  '3sg': 'il/elle',
  '1pl': 'nous',
  '2pl': 'vous',
  '3pl': 'ils/elles',
};
const REFLEXIVE: Record<Person, string> = {
  '1sg': 'me',
  '2sg': 'te',
  '3sg': 'se',
  '1pl': 'nous',
  '2pl': 'vous',
  '3pl': 'se',
};

export interface LeadVerb {
  pronominal: boolean;
  defective?: Verb['defective'];
  /** The verb starts with an aspirated h (no elision before it). */
  hAspire?: boolean;
}

// Vowels with accents count; `y` is left out because no verb of the list starts with it.
const VOWEL = /^[aeiouàâäéèêëîïôöùûüœ]/;
const startsWithVowelSound = (form: string, hAspire: boolean | undefined) =>
  VOWEL.test(form) || (form.startsWith('h') && !hAspire);

/** All that is printed before the verb group; `firstForm` is forms[0] (the auxiliary in passé composé). */
export function composeLead(tense: Tense, person: Person, verb: LeadVerb, firstForm: string): string {
  if (tense === 'imperatif') return '';
  const elides = startsWithVowelSound(firstForm, verb.hAspire);
  const subject = verb.defective === 'impersonal' ? 'il' : SUBJECT[person];
  const pieces: string[] = [];
  if (tense === 'subjonctif') pieces.push(subject.startsWith('il') ? 'qu’' : 'que');
  // With a reflexive, `je` stays and the reflexive carries the elision (je m’appelle).
  pieces.push(person === '1sg' && !verb.pronominal && elides ? 'j’' : subject);
  if (verb.pronominal) {
    const reflexive = REFLEXIVE[person];
    pieces.push(elides && ['me', 'te', 'se'].includes(reflexive) ? `${reflexive[0]}’` : reflexive);
  }
  return pieces.reduce((lead, piece) => (lead === '' || lead.endsWith('’') ? lead + piece : `${lead} ${piece}`), '');
}
