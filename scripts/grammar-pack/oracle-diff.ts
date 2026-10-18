/** Owns offline cell diffs, local reports and hash attestations; not CSV parsing or owner decisions. */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TENSES, type Verb } from '../../src/types/grammarPack';
import { generateRows, OracleAttestSchema, readInputs, rowHash, type OracleAttest } from './build';
import { loadMorphalou, morphalouForms, type MorphalouIndex, type OracleTense } from './oracle-morphalou';

export interface Disagreement {
  verbId: string;
  tense: OracleTense;
  person: string;
  ourForm: string;
  oracleForms: string[];
  kind: 'our-form-missing' | 'oracle-extra';
}
export interface OracleResult {
  verb: Verb;
  agree: number;
  disagreements: Disagreement[];
  uncovered: Disagreement[];
}

export function compareVerb(verb: Verb, index: MorphalouIndex, decisions: OracleAttest['decisions']): OracleResult {
  let agree = 0;
  const disagreements: Disagreement[] = [];
  const compare = (tense: OracleTense, person: string, forms: string[]) => {
    const oracleForms = morphalouForms(index, verb.infinitive, tense, person);
    const bare = forms.map((form) =>
      verb.pronominal && tense === 'imperatif' ? form.replace(/-(toi|nous|vous)$/, '') : form,
    );
    const missing = forms.filter((_, i) => !oracleForms.includes(bare[i]));
    const extras = oracleForms.filter((form) => !bare.includes(form));
    if (!missing.length && !extras.length) agree++;
    for (const ourForm of missing) {
      disagreements.push({ verbId: verb.id, tense, person, ourForm, oracleForms, kind: 'our-form-missing' });
    }
    // Anchor extras to our shipped primary token; no oracle-only token enters an owner decision.
    if (extras.length) {
      disagreements.push({ verbId: verb.id, tense, person, ourForm: forms[0], oracleForms, kind: 'oracle-extra' });
    }
  };
  for (const tense of TENSES) {
    if (tense === 'passeCompose') continue;
    for (const [person, cell] of Object.entries(verb.tenses[tense] ?? {})) compare(tense, person, cell.forms);
  }
  if (verb.participles.present) compare('participlePresent', '-', [verb.participles.present]);
  for (const [person, form] of Object.entries(verb.participles.past)) compare('participlePast', person, [form]);
  const uncovered = disagreements.filter(
    (diff) =>
      !decisions.some(
        (decision) =>
          decision.verbId === diff.verbId &&
          decision.tense === diff.tense &&
          decision.person === diff.person &&
          decision.ourForm === diff.ourForm,
      ),
  );
  return { verb, agree, disagreements, uncovered };
}

export function attestResults(attest: OracleAttest, results: OracleResult[], ranAt: string): OracleAttest {
  const next = structuredClone(attest);
  for (const { verb, agree, disagreements, uncovered } of results) {
    if (uncovered.length) continue;
    next.verbs[verb.id] = {
      source: 'morphalou-3.1',
      ranAt,
      rowHash: rowHash(verb),
      agree,
      disagree: disagreements.length,
    };
  }
  return OracleAttestSchema.parse(next);
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const attest = args[0] === 'attest';
  const ids = attest ? args.slice(1) : args;
  const inputs = await readInputs();
  const { generated, failures } = generateRows(inputs.source, inputs.irregulars);
  const unknown = ids.filter((id) => !generated.some(({ verb }) => verb.id === id));
  failures.push(...unknown.map((id) => `${id}: unknown verb`));
  if (failures.length) throw new Error(failures.join('\n'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const dir = resolve(root, process.env.MORPHALOU_DIR ?? '.local/morphalou/csv/Morphalou3.1_formatCSV');
  const index = await loadMorphalou(dir);
  const previous = inputs.oracleAttest!;
  const results = generated
    .filter(({ verb }) => !ids.length || ids.includes(verb.id))
    .map(({ verb }) => compareVerb(verb, index, previous.decisions));
  const output = resolve(root, '.local/oracle');
  await mkdir(output, { recursive: true });
  for (const { verb, agree, disagreements, uncovered } of results) {
    const report =
      [
        `${verb.id}: agree=${agree} disagree=${disagreements.length} uncovered=${uncovered.length}`,
        ...disagreements.map((diff) => JSON.stringify(diff)),
      ].join('\n') + '\n';
    console.log(report.trimEnd());
    await Bun.write(resolve(output, `${verb.id}.txt`), report);
  }
  if (attest) {
    const next = attestResults(previous, results, new Date().toISOString());
    await Bun.write(
      new URL('../../data/grammar-pack/oracle-attest.json', import.meta.url),
      JSON.stringify(next, null, 2) + '\n',
    );
    for (const result of results) {
      console.log(
        `${result.verb.id}: ${result.uncovered.length ? 'not attested (owner decision required)' : 'attested'}`,
      );
    }
  }
  if (results.some(({ uncovered }) => uncovered.length)) process.exitCode = 1;
}
