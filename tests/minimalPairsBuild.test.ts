/** Owns review-gate and disposable CLI/bundle regressions; never writes the real owner reviews or generated pack. */
import { afterEach, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { buildPack, ReviewsSchema, rowHash } from '../scripts/minimal-pairs/build';
import { pairInputs, pairPack, pairSource } from './fixtures/minimalPairs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const workspaces: string[] = [];
afterEach(() => {
  for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function workspace(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'relire-minimal-pairs-'));
  workspaces.push(root);
  for (const file of [
    'scripts/minimal-pairs/build.ts',
    'scripts/minimal-pairs/review.ts',
    'src/types/minimalPairs.ts',
    'src/services/minimalPairs/load.ts',
    'src/data/frenchIpa.ts',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(repo, file), join(root, file));
  }
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir');
  await Bun.write(join(root, 'data/minimal-pairs/pairs.json'), JSON.stringify(pairSource()));
  await Bun.write(join(root, 'data/minimal-pairs/reviews.json'), JSON.stringify({ records: [] }));
  return root;
}

function run(root: string, script: string, ...args: string[]) {
  const result = Bun.spawnSync({
    cmd: ['timeout', '300', process.execPath, join(root, 'scripts/minimal-pairs', script), ...args],
    cwd: root,
  });
  return {
    code: result.exitCode,
    out: new TextDecoder().decode(result.stdout),
    err: new TextDecoder().decode(result.stderr),
  };
}

async function bundledLoader(root: string, name: string) {
  await build({
    root,
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    build: {
      outDir: name,
      lib: { entry: join(root, 'src/services/minimalPairs/load.ts'), formats: ['es'], fileName: 'loader' },
    },
  });
  return import(pathToFileURL(join(root, name, 'loader.mjs')).href) as Promise<
    typeof import('../src/services/minimalPairs/load')
  >;
}

test('a matching review derives the complete shipped status and metadata, with deterministic bytes', () => {
  expect(buildPack(pairInputs())).toEqual(pairPack());
  expect(JSON.stringify(buildPack(pairInputs()))).toBe(JSON.stringify(buildPack(pairInputs())));
});

test('every unreviewed pair fails the gate, including a partial review', () => {
  const input = pairInputs();
  input.reviews.records = [];
  for (const { id } of input.source.pairs) {
    expect(() => buildPack(input)).toThrow(`${id}: publish gate refuses draft; human review required`);
  }
  input.reviews = pairInputs().reviews;
  input.reviews.records.pop();
  expect(() => buildPack(input)).toThrow('fee-fait: publish gate refuses draft; human review required');
});

test('edits to any authored field lapse its hash-bound review', () => {
  for (const change of [
    { id: 'changed-id' },
    { a: 'vu' },
    { b: 'vous' },
    { contrast: 'b-p' },
    { note: 'minimalPairs.notes.other' },
  ]) {
    const input = pairInputs();
    Object.assign(input.source.pairs[1], change);
    expect(() => buildPack(input)).toThrow('human review required');
    if (!('id' in change)) expect(() => buildPack(input)).toThrow('review lapsed (row hash changed)');
  }
  const removed = pairInputs();
  delete removed.source.pairs[1].note;
  expect(() => buildPack(removed)).toThrow('review lapsed (row hash changed)');
});

test('latest record wins; an earlier matching hash cannot rescue a later stale review', () => {
  const input = pairInputs();
  const stale = { ...input.reviews.records[0], rowHash: '0'.repeat(64) };
  input.reviews.records.unshift(stale);
  expect(buildPack(input)).toEqual(pairPack());
  input.reviews.records.push(stale);
  expect(() => buildPack(input)).toThrow('rue-roue: review lapsed (row hash changed)');
});

test('canonical hashes ignore object key order; duplicate ids still fail the build', () => {
  const pair = pairSource().pairs[1];
  expect(rowHash(Object.fromEntries(Object.entries(pair).reverse()))).toBe(rowHash(pair));
  expect(rowHash(pair)).toMatch(/^[a-f0-9]{64}$/);
  const input = pairInputs();
  input.source.pairs.push({ ...input.source.pairs[0] });
  expect(() => buildPack(input)).toThrow('duplicate id rue-roue');
});

test('CLI refuses unreviewed publication without writing output; Vite can bundle the absent pack', async () => {
  const root = await workspace();
  for (const args of [[], ['--check']]) {
    const result = run(root, 'build.ts', ...args);
    expect(result.code).toBe(1);
    for (const { id } of pairSource().pairs)
      expect(result.err).toContain(`${id}: publish gate refuses draft; human review required`);
    expect(existsSync(join(root, 'src/data/minimal-pairs/pairs.json'))).toBe(false);
  }
  const loader = await bundledLoader(root, 'dist-missing');
  const message = await loader.loadMinimalPairsPack().then(
    () => '',
    (error: Error) => error.message,
  );
  expect(message).toContain('no reviewed pack has been built');
  expect(loader.loadedMinimalPairsPack()).toBeUndefined();
  expect(await loader.loadMinimalPairsPack(pairPack())).toEqual(pairPack());
});

test('fixture print/record/build/check round trip is append-only, stable and lazily consumed as shipped', async () => {
  const root = await workspace();
  const ids = pairSource().pairs.map(({ id }) => id);
  const printed = run(root, 'review.ts', 'print', ...ids);
  expect(printed.code).toBe(0);
  expect(printed.out).toContain('rue-roue (y-u)\n  words\true / roue');
  expect(printed.out).toContain('note\tminimalPairs.notes.tendency');
  expect(await Bun.file(join(root, 'data/minimal-pairs/reviews.json')).json()).toEqual({ records: [] });
  const record = () => run(root, 'review.ts', 'record', ...ids, '--by', 'TEST ONLY', '--ref', 'Synthetic fixture');
  expect(record().code).toBe(0);
  const first = ReviewsSchema.parse(await Bun.file(join(root, 'data/minimal-pairs/reviews.json')).json());
  expect(first.records.map(({ rowHash: hash }) => hash)).toEqual(pairSource().pairs.map(rowHash));
  expect(record().code).toBe(0);
  const appended = ReviewsSchema.parse(await Bun.file(join(root, 'data/minimal-pairs/reviews.json')).json());
  expect(appended.records).toEqual([...first.records, ...first.records]);
  expect(run(root, 'build.ts')).toEqual({ code: 0, out: '', err: '' });
  const output = join(root, 'src/data/minimal-pairs/pairs.json');
  const bytes = await Bun.file(output).text();
  for (let i = 0; i < 2; i++) expect(run(root, 'build.ts', '--check')).toEqual({ code: 0, out: '', err: '' });
  expect(await Bun.file(output).text()).toBe(bytes);
  const loader = await bundledLoader(root, 'dist-reviewed');
  expect(await loader.loadMinimalPairsPack()).toEqual(JSON.parse(bytes));
  expect(loader.loadedMinimalPairsPack()?.pairs.every(({ status }) => status === 'reviewed')).toBe(true);
  await Bun.write(output, bytes + '\n');
  expect(run(root, 'build.ts', '--check').err).toContain('pairs.json differs from the generated pack');
  // --check never rewrites the mismatched bytes.
  expect(await Bun.file(output).text()).toBe(bytes + '\n');
});

test('CLI rejects unknown ids, malformed record arguments and unknown build flags without changing reviews', async () => {
  const root = await workspace();
  expect(run(root, 'review.ts', 'print', 'unknown').err).toContain('unknown: unknown id');
  expect(run(root, 'review.ts', 'record', 'rue-roue', '--by', 'TEST ONLY').err).toContain('Usage:');
  expect(run(root, 'review.ts', 'print', 'rue-roue', '--ref', 'not valid').err).toContain('Usage:');
  expect(run(root, 'build.ts', '--unknown').err).toContain('Usage:');
  expect(await Bun.file(join(root, 'data/minimal-pairs/reviews.json')).json()).toEqual({ records: [] });
});
