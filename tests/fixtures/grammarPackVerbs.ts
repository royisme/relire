/**
 * Generator inputs for the grammar pack tests: the control verb specs and an
 * irregular table that adds three fixture-only entries (ouvrir, falloir,
 * pleuvoir) on top of data/grammar-pack/irregulars.json. The fixture entries
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
};

export const CONTROL_SPECS: VerbSpec[] = [
  { id: 'etre', infinitive: 'être', rule: 'irregular', aux: 'avoir' },
  { id: 'aller', infinitive: 'aller', rule: 'irregular', aux: 'etre' },
  { id: 'avoir', infinitive: 'avoir', rule: 'irregular', aux: 'avoir' },
  { id: 's-appeler', infinitive: 's’appeler', base: 'appel', rule: 'er-eler-double', aux: 'etre' },
];

export const generate = (spec: VerbSpec) => generateVerb(spec, IRREGULARS);
export const generateControls = () => CONTROL_SPECS.map(generate);
