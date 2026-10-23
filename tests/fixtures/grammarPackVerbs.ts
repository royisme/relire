/**
 * Generator inputs for the grammar pack tests: the control verb specs and an
 * irregular table that adds four fixture-only entries (ouvrir, falloir,
 * pleuvoir, pouvoir) on top of data/grammar-pack/irregulars.json. The fixture entries
 * are test inputs, not reviewed pack data.
 */
import irregularsJson from '../../data/grammar-pack/irregulars.json';
import { generateVerb, type IrregularEntry, type VerbSpec } from '../../src/services/conjugation/generate';

export const IRREGULARS: Record<string, IrregularEntry> = {
  ...irregularsJson,
  ouvrir: { participles: { past: 'ouvert' } },
  falloir: {
    participles: { past: 'fallu' },
    forms: {
      present: { '3sg': 'faut' },
      imparfaitStem: 'fall',
      futurStem: 'faudr',
      subjonctif: { '3sg': 'faille' },
    },
  },
  pleuvoir: {
    participles: { past: 'plu' },
    forms: {
      present: { '3sg': 'pleut' },
      imparfaitStem: 'pleuv',
      futurStem: 'pleuvr',
      subjonctif: { '3sg': 'pleuve' },
    },
  },
  pouvoir: {
    participles: { present: 'pouvant', past: 'pu' },
    forms: {
      present: { '1sg': 'peux', '2sg': 'peux', '3sg': 'peut', '1pl': 'pouvons', '2pl': 'pouvez', '3pl': 'peuvent' },
      imparfaitStem: 'pouv',
      futurStem: 'pourr',
      subjonctif: {
        '1sg': 'puisse',
        '2sg': 'puisses',
        '3sg': 'puisse',
        '1pl': 'puissions',
        '2pl': 'puissiez',
        '3pl': 'puissent',
      },
    },
  },
};

export const CONTROL_SPECS: VerbSpec[] = [
  { id: 'etre', infinitive: 'être', rule: 'irregular', aux: 'avoir' },
  { id: 'aller', infinitive: 'aller', rule: 'irregular', aux: 'etre' },
  { id: 'avoir', infinitive: 'avoir', rule: 'irregular', aux: 'avoir' },
  { id: 's-appeler', infinitive: 's’appeler', base: 'appel', rule: 'er-eler-double', aux: 'etre' },
];

/** Every person of every finite tense, but no imperative (the shape `pouvoir` will need). */
export const POUVOIR_SPEC: VerbSpec = {
  id: 'pouvoir',
  infinitive: 'pouvoir',
  rule: 'irregular',
  aux: 'avoir',
  noImperative: true,
};

export const generate = (spec: VerbSpec) => generateVerb(spec, IRREGULARS);
export const generateControls = () => CONTROL_SPECS.map(generate);
