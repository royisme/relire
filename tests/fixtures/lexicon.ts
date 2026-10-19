/** TEST data typed by hand to the lexicon contract: regular French forms for probing the app, never rows from Morphalou. */
import type { LexiconFormResponse, LexiconLemmaResponse, VerbData } from '../../src/types/lexicon';

/** TEST source block; the real one names Morphalou, this one says so is not it. */
export const testSource = { name: 'TEST lexicon', maintainer: 'TEST', licence: 'TEST', url: 'http://lexicon.test/' };

const cells = <K extends string>(keys: readonly K[], forms: string[]) =>
  Object.fromEntries(keys.map((key, index) => [key, [forms[index]]])) as Record<K, string[]>;
const SIX = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'] as const;
const IMPERATIVE = ['2sg', '1pl', '2pl'] as const;

/** `chanter`, a regular -er verb, with the six simple tenses and the participles. */
export const chanterData = (): VerbData => ({
  tenses: {
    present: cells(SIX, ['chante', 'chantes', 'chante', 'chantons', 'chantez', 'chantent']),
    imparfait: cells(SIX, ['chantais', 'chantais', 'chantait', 'chantions', 'chantiez', 'chantaient']),
    futur: cells(SIX, ['chanterai', 'chanteras', 'chantera', 'chanterons', 'chanterez', 'chanteront']),
    conditionnel: cells(SIX, ['chanterais', 'chanterais', 'chanterait', 'chanterions', 'chanteriez', 'chanteraient']),
    subjonctif: cells(SIX, ['chante', 'chantes', 'chante', 'chantions', 'chantiez', 'chantent']),
    imperatif: cells(IMPERATIVE, ['chante', 'chantons', 'chantez']),
  },
  participles: { present: ['chantant'], past: { ms: ['chanté'], fs: ['chantée'], mp: ['chantés'], fp: ['chantées'] } },
});

/** Bare TEST forms for pronominal dictionary entries (not reviewed pack rows). */
export const laverData = (): VerbData => ({
  tenses: {
    present: cells(SIX, ['lave', 'laves', 'lave', 'lavons', 'lavez', 'lavent']),
    imperatif: cells(IMPERATIVE, ['lave', 'lavons', 'lavez']),
  },
  participles: { present: ['lavant'], past: { ms: ['lavé'] } },
});

export const amuserData = (): VerbData => ({
  tenses: {
    present: cells(SIX, ['amuse', 'amuses', 'amuse', 'amusons', 'amusez', 'amusent']),
    imperatif: cells(IMPERATIVE, ['amuse', 'amusons', 'amusez']),
  },
  participles: { present: ['amusant'], past: { ms: ['amusé'] } },
});

export const chanterLemma = (): LexiconLemmaResponse => ({
  lemma: 'chanter',
  entries: [{ pos: 'verb', data: chanterData() }],
  source: testSource,
});

export const formOf = (form: string, ...lemmas: LexiconFormResponse['lemmas']): LexiconFormResponse => ({
  form,
  lemmas,
  source: testSource,
});
