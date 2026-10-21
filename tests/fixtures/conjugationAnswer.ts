/**
 * AI-style conjugation answers for the CP2 tests. `parler` is typed by hand;
 * answers for aller and s’appeler are cut from the hand-typed golden tables
 * (so assembling them is checked against an independent oracle); the rest are
 * small variations. Test data, not reviewed pack data.
 */
import type { ConjugationAnswer } from '../../src/types/conjugationAnswer';
import { TENSES, isCompoundTense, isPronominalInfinitive, type Person } from '../../src/types/grammarPack';
import { GOLDEN } from './grammarPackGolden';

type Forms = Record<Person, string[]>;
const six = (a: string, b: string, c: string, d: string, e: string, f: string): Forms => ({
  '1sg': [a],
  '2sg': [b],
  '3sg': [c],
  '1pl': [d],
  '2pl': [e],
  '3pl': [f],
});

/** The AI is asked for one example per tense of its `examples` record: the simple tenses and passé composé. */
export const EXAMPLES: ConjugationAnswer['examples'] = Object.fromEntries(
  TENSES.filter((tense) => !isCompoundTense(tense) || tense === 'passeCompose').map((tense) => [
    tense,
    { fr: `Phrase ${tense}.`, gloss: `Sentence ${tense}.` },
  ]),
) as ConjugationAnswer['examples'];

/**
 * A verb with -er style endings (also -ouvrir verbs), the stems applied by hand: `strong` for je, tu, il, ils in the
 * present and subjonctif, `plain` elsewhere, `fut` for futur and conditionnel.
 */
export function erAnswer(
  infinitive: string,
  rule: ConjugationAnswer['rule'],
  stems: { plain: string; strong: string; fut: string },
  over: Partial<ConjugationAnswer> = {},
): ConjugationAnswer {
  const { plain, strong, fut } = stems;
  const ms = `${plain}é`;
  return {
    infinitive,
    pronominal: isPronominalInfinitive(infinitive),
    aux: isPronominalInfinitive(infinitive) ? 'etre' : 'avoir',
    rule,
    forms: {
      present: six(`${strong}e`, `${strong}es`, `${strong}e`, `${plain}ons`, `${plain}ez`, `${strong}ent`),
      imparfait: six(`${plain}ais`, `${plain}ais`, `${plain}ait`, `${plain}ions`, `${plain}iez`, `${plain}aient`),
      futur: six(`${fut}ai`, `${fut}as`, `${fut}a`, `${fut}ons`, `${fut}ez`, `${fut}ont`),
      conditionnel: six(`${fut}ais`, `${fut}ais`, `${fut}ait`, `${fut}ions`, `${fut}iez`, `${fut}aient`),
      subjonctif: six(`${strong}e`, `${strong}es`, `${strong}e`, `${plain}ions`, `${plain}iez`, `${strong}ent`),
      imperatif: { '2sg': [`${strong}e`], '1pl': [`${plain}ons`], '2pl': [`${plain}ez`] },
    },
    participles: { present: `${plain}ant`, past: { ms, fs: `${ms}e`, mp: `${ms}s`, fp: `${ms}es` } },
    examples: structuredClone(EXAMPLES),
    ...over,
  };
}

export const parlerAnswer = (): ConjugationAnswer => ({
  infinitive: 'parler',
  pronominal: false,
  aux: 'avoir',
  rule: 'er-regular',
  forms: {
    present: six('parle', 'parles', 'parle', 'parlons', 'parlez', 'parlent'),
    imparfait: six('parlais', 'parlais', 'parlait', 'parlions', 'parliez', 'parlaient'),
    futur: six('parlerai', 'parleras', 'parlera', 'parlerons', 'parlerez', 'parleront'),
    conditionnel: six('parlerais', 'parlerais', 'parlerait', 'parlerions', 'parleriez', 'parleraient'),
    subjonctif: six('parle', 'parles', 'parle', 'parlions', 'parliez', 'parlent'),
    imperatif: { '2sg': ['parle'], '1pl': ['parlons'], '2pl': ['parlez'] },
  },
  participles: { present: 'parlant', past: { ms: 'parlé', fs: 'parlée', mp: 'parlés', fp: 'parlées' } },
  examples: structuredClone(EXAMPLES),
});

/** The forms of a golden verb as an AI would give them: the verb group only, no clitic. */
export function answerFromGolden(id: 'aller' | 's-appeler'): ConjugationAnswer {
  const verb = GOLDEN[id];
  const cells = (tense: 'present' | 'imparfait' | 'futur' | 'conditionnel' | 'subjonctif' | 'imperatif') =>
    Object.fromEntries(
      Object.entries(verb.tenses[tense] ?? {}).map(([person, cell]) => [
        person,
        cell.forms.map((form) => form.replace(/-(toi|nous|vous)$/, '')),
      ]),
    );
  return {
    infinitive: verb.infinitive,
    pronominal: verb.pronominal,
    aux: verb.aux,
    rule: verb.rule,
    forms: {
      present: cells('present'),
      imparfait: cells('imparfait'),
      futur: cells('futur'),
      conditionnel: cells('conditionnel'),
      subjonctif: cells('subjonctif'),
      imperatif: cells('imperatif'),
    } as ConjugationAnswer['forms'],
    participles: verb.participles,
    examples: structuredClone(EXAMPLES),
  };
}

/** A verb used only in the 3sg: one cell per tense, no imperatif, no present participle. */
export const falloirAnswer = (): ConjugationAnswer => ({
  infinitive: 'falloir',
  pronominal: false,
  aux: 'avoir',
  rule: 'irregular',
  defective: 'impersonal',
  forms: {
    present: { '3sg': ['faut'] },
    imparfait: { '3sg': ['fallait'] },
    futur: { '3sg': ['faudra'] },
    conditionnel: { '3sg': ['faudrait'] },
    subjonctif: { '3sg': ['faille'] },
  },
  participles: { past: { ms: 'fallu', fs: 'fallu', mp: 'fallu', fp: 'fallu' } },
  examples: Object.fromEntries(
    Object.entries(EXAMPLES).filter(([tense]) => tense !== 'imperatif'),
  ) as ConjugationAnswer['examples'],
});
