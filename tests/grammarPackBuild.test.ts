/** Owns build/review gate regression tests with in-memory inputs; not owner attestations or the committed artifact. */
import { afterEach, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPack, publishGate, type BuildInputs } from '../scripts/grammar-pack/build';
import { rowHash, writeArtifact, type Reviews } from '../scripts/grammar-pack/gate';
import * as generator from '../src/services/conjugation/generate';
import { GrammarPackSchema } from '../src/types/grammarPack';
import { CONTROL_SPECS, generateControls, IRREGULARS } from './fixtures/grammarPackVerbs';
import sourceJson from '../data/grammar-pack/verbs.json';

const source = () => ({ packVersion: '0.1.0', packDate: '2026-10-18', verbs: structuredClone(CONTROL_SPECS) });
const reviews = (): Reviews => ({
  records: generateControls().map(({ verb }) => ({
    verbId: verb.id,
    rowHash: rowHash(verb),
    reviewedBy: 'TEST ONLY',
    reviewedAt: '2026-10-17',
    reference: 'Test fixture, not a human attestation',
  })),
  rejected: [],
});
const inputs = (): BuildInputs => ({ source: source(), irregulars: structuredClone(IRREGULARS), reviews: reviews() });
const bytes = (input: BuildInputs) => JSON.stringify(buildPack(input).pack, null, 2) + '\n';
let generateSpy: ReturnType<typeof spyOn<typeof generator, 'generateVerb'>> | undefined;
afterEach(() => {
  generateSpy?.mockRestore();
});

function failure(input: BuildInputs): string {
  try {
    buildPack(input);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the build to fail');
}

test('authored seed starts with exactly the control specs', () => {
  // The seed grows verb by verb as batches are reviewed; the controls stay its first rows, unchanged.
  // The JSON literal widens flags to boolean, so the slice is asserted as the specs it feeds the build.
  expect(sourceJson.verbs.slice(0, CONTROL_SPECS.length) as generator.VerbSpec[]).toEqual(CONTROL_SPECS);
  expect(new Set(sourceJson.verbs.map(({ id }) => id)).size).toBe(sourceJson.verbs.length);
  expect(sourceJson.packVersion).toBe('0.1.0');
});

test('publish gate refuses both draft and auto-checked rows by name', () => {
  const rows = generateControls().map(({ verb }) => verb);
  rows[1].prov.status = 'auto-checked';
  const issues = publishGate(rows).join('\n');
  expect(issues).toContain('etre: publish gate refuses draft');
  expect(issues).toContain('aller: publish gate refuses auto-checked');
  const input = inputs();
  input.reviews.records = [];
  const message = failure(input);
  for (const spec of CONTROL_SPECS) expect(message).toContain(`${spec.id}: publish gate refuses auto-checked`);
});

test('matching reviews set exact reviewed provenance, including only real control checks', () => {
  const input = inputs();
  input.source.verbs.push({ id: 'parler', infinitive: 'parler', base: 'parl', rule: 'er-regular', aux: 'avoir' });
  const parler = generator.generateVerb(input.source.verbs.at(-1)!, input.irregulars).verb;
  input.reviews.records.push({ ...input.reviews.records[0], verbId: 'parler', rowHash: rowHash(parler) });
  const { pack } = buildPack(input);
  for (const verb of pack.verbs) {
    expect(verb.prov).toEqual({
      origin: ['etre', 'aller', 'avoir'].includes(verb.id) ? 'irregular-table' : 'rule',
      checkedAgainst: verb.id === 'parler' ? ['consistency', 'human'] : ['consistency', 'control-verbs', 'human'],
      checkedAt: '2026-10-17',
      status: 'reviewed',
      reviewedBy: 'TEST ONLY',
    });
  }
});

test('changed content lapses a review and identifies the verb', () => {
  const input = inputs();
  input.source.verbs[3].pcInvariable = true;
  expect(failure(input)).toContain('s-appeler: review lapsed');
});

test('a new review supersedes an old lapsed hash, but a latest lapsed hash fails', () => {
  const input = inputs();
  input.reviews.records.unshift({ ...input.reviews.records[0], rowHash: '0'.repeat(64) });
  expect(() => buildPack(input)).not.toThrow();
  input.reviews.records.push({ ...input.reviews.records[0] });
  expect(failure(input)).toContain('etre: review lapsed');
});

test('rejected verbs are checked, skipped and logged, including rejected controls', () => {
  const input = inputs();
  input.reviews.rejected = ['aller'];
  input.reviews.records = input.reviews.records.filter(({ verbId }) => verbId !== 'aller');
  const { pack, report } = buildPack(input);
  expect(pack.verbs.map(({ id }) => id)).toEqual(['etre', 'avoir', 's-appeler']);
  expect(report).toEqual(['aller: rejected; skipped']);
});

test('h-initial verbs require explicit aspirated or mute confirmation, including reflexive infinitives', () => {
  for (const infinitive of ['habiller', 'se habiller', 's’habiller']) {
    const input = inputs();
    input.source.verbs.push({ id: 'habiller', infinitive, base: 'habill', rule: 'er-regular', aux: 'etre' });
    const verb = generator.generateVerb(input.source.verbs.at(-1)!, input.irregulars).verb;
    input.reviews.records.push({ ...input.reviews.records[0], verbId: verb.id, rowHash: rowHash(verb) });
    expect(failure(input)).toContain('habiller: h-initial verb needs');
    input.source.hMute = ['habiller'];
    expect(() => buildPack(input)).not.toThrow();
    delete input.source.hMute;
    input.source.verbs.at(-1)!.hAspire = true;
    const aspirated = generator.generateVerb(input.source.verbs.at(-1)!, input.irregulars).verb;
    input.reviews.records.at(-1)!.rowHash = rowHash(aspirated);
    expect(() => buildPack(input)).not.toThrow();
  }
});

test('machine failures aggregate with verb, tense and person, even with matching reviews', () => {
  const original = generator.generateVerb;
  generateSpy = spyOn(generator, 'generateVerb').mockImplementation((spec, irregulars) => {
    const g = original(spec, irregulars);
    g.verb.tenses.present['1sg']!.lead = 'wrong';
    return g;
  });
  const input = inputs();
  input.reviews.records = input.source.verbs.map((spec) => {
    const verb = generator.generateVerb(spec, input.irregulars).verb;
    return { ...reviews().records[0], verbId: verb.id, rowHash: rowHash(verb) };
  });
  const message = failure(input);
  for (const spec of CONTROL_SPECS) expect(message).toContain(`${spec.id} present 1sg`);
});

test('unreviewed machine failures derive draft, while generation failures are collected', () => {
  const input = inputs();
  input.reviews.records = [];
  input.irregulars.aller.forms!.present['1sg'] = 'Vais';
  input.source.verbs.push({ id: 'missing', infinitive: 'missing', rule: 'irregular', aux: 'avoir' });
  const message = failure(input);
  expect(message).toContain('aller present 1sg');
  expect(message).toContain('aller: publish gate refuses draft');
  expect(message).toContain('missing:');
  expect(message).toContain('etre: publish gate refuses auto-checked');
});

test('hash is sha256 of recursively sorted shipped content without provenance', () => {
  const verb = generateControls()[0].verb;
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
          )
        : value;
  const { prov: _prov, ...row } = verb;
  expect(rowHash(verb)).toBe(
    createHash('sha256')
      .update(JSON.stringify(sorted(row)))
      .digest('hex'),
  );
  const reordered = Object.fromEntries(Object.entries(verb).reverse()) as typeof verb;
  reordered.prov = { origin: 'human', status: 'draft', checkedAgainst: [] };
  expect(rowHash(reordered)).toBe(rowHash(verb));
});

test('identical inputs produce identical bytes, no CJK, and a schema-valid pack', () => {
  const input = inputs();
  expect(bytes(input)).toBe(bytes(input));
  expect(bytes(input)).not.toMatch(/[\u3400-\u9fff\uf900-\ufaff]/u);
  expect(GrammarPackSchema.safeParse(buildPack(input).pack).success).toBe(true);
});

test('--check is byte-exact and does not rewrite a drifted conjugation artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-pack-check-'));
  try {
    const output = pathToFileURL(join(directory, 'pack.json'));
    const { pack } = buildPack(inputs());
    await writeArtifact(output, pack, false);
    const generated = await Bun.file(output).text();
    await writeArtifact(output, buildPack(inputs()).pack, true);
    await Bun.write(output, generated + ' ');
    expect(
      await writeArtifact(output, pack, true).then(
        () => 'unexpected success',
        (error: Error) => error.message,
      ),
    ).toContain('pack.json differs');
    expect(await Bun.file(output).text()).toBe(generated + ' ');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid output schema prevents publication', () => {
  const input = inputs();
  input.source.packVersion = 'bad';
  expect(failure(input)).toContain('packVersion');
});
