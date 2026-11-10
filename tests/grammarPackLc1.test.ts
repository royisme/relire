/**
 * Compares the generated tables of the 15 LC1 verbs (#40) with the
 * worker-drafted golden fixtures, cell by cell, so a failure names the verb,
 * tense and person. The verbs are generated through the same path the control
 * test uses (tests/fixtures/grammarPackVerbs) from the authored rows of
 * data/grammar-pack/verbs.json. Owns no golden data: the tables live in
 * tests/fixtures/grammarPackGoldenLc1.ts and grammarPackGoldenLc1Etre.ts.
 */
import { expect, test } from 'bun:test';
import { cellAt } from '../scripts/grammar-pack/checks';
import type { VerbSpec } from '../src/services/conjugation/generate';
import { FINITE_PERSONS, TENSES } from '../src/types/grammarPack';
import sourceJson from '../data/grammar-pack/verbs.json';
import { GOLDEN_LC1_AVOIR, type GoldenVerb } from './fixtures/grammarPackGoldenLc1';
import { GOLDEN_LC1_ETRE } from './fixtures/grammarPackGoldenLc1Etre';
import { generate } from './fixtures/grammarPackVerbs';

const GOLDEN: Record<string, GoldenVerb> = { ...GOLDEN_LC1_AVOIR, ...GOLDEN_LC1_ETRE };
const generated = (Object.keys(GOLDEN) as VerbSpec['id'][])
  .map((id) => sourceJson.verbs.find((row) => row.id === id))
  .map((row) => row as VerbSpec)
  .map(generate);

test('the 15 LC1 verbs match their golden tables in every cell', () => {
  const failures: string[] = [];
  for (const golden of Object.values(GOLDEN)) {
    const g = generated.find(({ verb }) => verb.id === golden.id);
    if (!g) {
      failures.push(`${golden.id}: golden verb is missing from verbs.json`);
      continue;
    }
    const { verb } = g;
    for (const key of ['infinitive', 'pronominal', 'aux', 'rule', 'noImperative'] as const) {
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
  expect(failures).toEqual([]);
});
