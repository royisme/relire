/** Owns disposable build/review/CLI/bundle regressions; never records real reviews or writes repository content. */
import { afterEach, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as viteBuild } from 'vite';
import { build, buildPack, readInputs, rowHash } from '../scripts/spelling-sounds/build';
import { review } from '../scripts/spelling-sounds/review';
import { SpellingSoundsReviewsSchema } from '../src/types/spellingSounds';
import { spellingInputs, spellingSource, spellingNotes, spellingPack } from './fixtures/spellingSounds';

const repo = fileURLToPath(new URL('../', import.meta.url));
const workspaces: string[] = [];
afterEach(() => {
  for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function workspace(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'relire-spelling-sounds-'));
  workspaces.push(root);
  for (const file of [
    'scripts/spelling-sounds/build.ts',
    'scripts/spelling-sounds/review.ts',
    'src/types/spellingSounds.ts',
    'src/services/spellingSounds/load.ts',
    'src/data/frenchIpa.ts',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(repo, file), join(root, file));
  }
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir');
  await Bun.write(join(root, 'data/spelling-sounds/patterns.json'), JSON.stringify(spellingSource()));
  await Bun.write(join(root, 'data/spelling-sounds/reviews.json'), JSON.stringify({ records: [] }));
  for (const language of ['en', 'zh'] as const) {
    await Bun.write(
      join(root, `src/i18n/locales/${language}.json`),
      JSON.stringify({ spellingSounds: { notes: spellingNotes()[language] } }),
    );
  }
  return root;
}
function run(root: string, script: string, ...args: string[]) {
  const result = Bun.spawnSync({
    cmd: ['timeout', '300', process.execPath, join(root, 'scripts/spelling-sounds', script), ...args],
    cwd: root,
  });
  return {
    code: result.exitCode,
    out: new TextDecoder().decode(result.stdout),
    err: new TextDecoder().decode(result.stderr),
  };
}
async function bundledLoader(root: string, name: string) {
  await viteBuild({
    root,
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    build: {
      outDir: name,
      lib: { entry: join(root, 'src/services/spellingSounds/load.ts'), formats: ['es'], fileName: 'loader' },
    },
  });
  return import(pathToFileURL(join(root, name, 'loader.mjs')).href) as Promise<
    typeof import('../src/services/spellingSounds/load')
  >;
}

test('matching fixture reviews derive honest metadata and deterministic content-addressed versions', () => {
  const input = spellingInputs();
  expect(buildPack(input)).toEqual(spellingPack());
  expect(JSON.stringify(buildPack(input))).toBe(JSON.stringify(buildPack(input)));
  expect(buildPack(input).patterns[0].review).toEqual({ kind: 'ai', by: 'AI review: TEST ONLY', at: '2026-10-24' });
  const row = input.source.patterns[0];
  expect(rowHash(Object.fromEntries(Object.entries(row).reverse()) as typeof row, input.notes)).toBe(
    rowHash(row, input.notes),
  );
  expect(rowHash(row, input.notes)).toMatch(/^[a-f0-9]{64}$/);
});

test('missing, partial, changed rows and either changed locale note refuse publication', () => {
  for (const records of [[], spellingInputs().reviews.records.slice(0, 1)]) {
    expect(() => buildPack({ ...spellingInputs(), reviews: { records } })).toThrow('no matching review');
  }
  for (const change of [
    { examples: ['tout', 'fou', 'roue'] },
    { spelling: 'o' },
    { group: 'consonants' as const },
    { sound: ['y'] },
  ]) {
    const input = spellingInputs();
    Object.assign(input.source.patterns[0], change);
    expect(() => buildPack(input)).toThrow('ou: review lapsed (row or locale note changed)');
  }
  const renamed = spellingInputs();
  renamed.source.patterns[0].id = 'new-id';
  expect(() => buildPack(renamed)).toThrow('new-id: build refuses pattern with no matching review');
  for (const language of ['en', 'zh'] as const) {
    const input = spellingInputs();
    input.notes[language].ou += ' changed';
    expect(() => buildPack(input)).toThrow('ou: review lapsed (row or locale note changed)');
  }
});

test('latest review wins, not any matching historical hash; build actually runs the linguistic gate', () => {
  const input = spellingInputs();
  const stale = { ...input.reviews.records[0], rowHash: '0'.repeat(64) };
  input.reviews.records.unshift(stale);
  expect(buildPack(input)).toEqual(spellingPack());
  input.reviews.records.push(stale);
  expect(() => buildPack(input)).toThrow('review lapsed');
  const bad = spellingInputs();
  bad.source.patterns[0].examples[0] = 'chou';
  bad.reviews.records[0].rowHash = rowHash(bad.source.patterns[0], bad.notes);
  expect(() => buildPack(bad)).toThrow('contains different-sound spelling ch');
});

test('CLI refuses unreviewed build/check with no output, and zero-match glob builds and fails readably', async () => {
  const root = await workspace();
  for (const args of [[], ['--check']]) {
    const result = run(root, 'build.ts', ...args);
    expect(result.code).toBe(1);
    expect(result.err).toContain('ou: build refuses pattern with no matching review');
    expect(existsSync(join(root, 'src/data/spelling-sounds/patterns.json'))).toBe(false);
  }
  const loader = await bundledLoader(root, 'dist-absent');
  const message = await loader.loadSpellingSoundsPack().then(
    () => '',
    (error: Error) => error.message,
  );
  expect(message).toContain('no reviewed pack has been built');
  expect(loader.loadedSpellingSoundsPack()).toBeUndefined();
  expect(await loader.loadSpellingSoundsPack(spellingPack())).toEqual(spellingPack());
});

test('fixture print/AI record/build/check round trip preserves provenance and append-only records', async () => {
  const root = await workspace();
  const printed = run(root, 'review.ts', 'print');
  expect(printed.code).toBe(0);
  for (const text of [
    'spelling\tou',
    'group\tvowels',
    'sound\tu',
    'examples\tvous, jour, rouge',
    'en\tTEST ONLY ou note',
    'zh\tTEST ONLY ou locale note',
    'review\tno review',
    'spelling\tch',
  ]) {
    expect(printed.out).toContain(text);
  }
  const record = () =>
    run(root, 'review.ts', 'record', 'ou', 'ch', '--by', 'TEST ONLY', '--kind', 'ai', '--ref', 'Synthetic fixture');
  expect(record()).toEqual({ code: 0, out: '', err: '' });
  const file = Bun.file(join(root, 'data/spelling-sounds/reviews.json'));
  const first = SpellingSoundsReviewsSchema.parse(await file.json());
  expect(first.records.map(({ kind, reviewedBy, reference }) => ({ kind, reviewedBy, reference }))).toEqual([
    { kind: 'ai', reviewedBy: 'AI review: TEST ONLY', reference: 'Synthetic fixture' },
    { kind: 'ai', reviewedBy: 'AI review: TEST ONLY', reference: 'Synthetic fixture' },
  ]);
  expect(first.records.map(({ rowHash: hash }) => hash)).toEqual(
    spellingSource().patterns.map((row) => rowHash(row, spellingNotes())),
  );
  expect(first.records[0].reviewedAt).toBe(new Date().toISOString().slice(0, 10));
  expect(record().code).toBe(0);
  expect((await file.json()).records).toEqual([...first.records, ...first.records]);
  const currentSheet = await review(['print', 'ou'], root);
  expect(currentSheet).toContain('AI review: TEST ONLY');
  expect(currentSheet).toContain('; current');
  expect(currentSheet).not.toContain('spelling\tch');
  expect(run(root, 'build.ts', '--check').err).toContain('no committed src/data/spelling-sounds/patterns.json');
  expect(run(root, 'build.ts')).toEqual({ code: 0, out: '', err: '' });
  const output = Bun.file(join(root, 'src/data/spelling-sounds/patterns.json'));
  const bytes = await output.text();
  expect(bytes.endsWith('\n')).toBe(true);
  expect(bytes).not.toContain('"status"');
  expect(run(root, 'build.ts', '--check')).toEqual({ code: 0, out: '', err: '' });
  expect(run(root, 'build.ts').code).toBe(0);
  expect(await output.text()).toBe(bytes);
  const loader = await bundledLoader(root, 'dist-present');
  expect(await loader.loadSpellingSoundsPack()).toEqual(JSON.parse(bytes));
  expect(loader.loadedSpellingSoundsPack()?.patterns.every(({ review }) => review.kind === 'ai')).toBe(true);
  await Bun.write(output, bytes + '\n');
  const mismatch = run(root, 'build.ts', '--check');
  expect(mismatch.code).toBe(1);
  expect(mismatch.err).toContain('patterns.json differs from the generated pack');
  expect(await output.text()).toBe(bytes + '\n');
});

test('root and locale injection work, note edits lapse both build and review sheet state', async () => {
  const root = await workspace();
  await Bun.write(join(root, 'data/spelling-sounds/reviews.json'), JSON.stringify(spellingInputs().reviews));
  const notes = spellingNotes();
  await Bun.write(join(root, 'src/i18n/locales/en.json'), '{}');
  const missing = run(root, 'build.ts');
  expect(missing.code).toBe(1);
  expect(missing.err).toContain('en: missing or blank spellingSounds.notes.ou');
  expect(await readInputs(root, notes)).toEqual(spellingInputs());
  await build([], root, notes);
  const original = await Bun.file(join(root, 'src/data/spelling-sounds/patterns.json')).text();
  notes.en.ou += ' changed';
  const message = await build([], root, notes).then(
    () => '',
    (error: Error) => error.message,
  );
  expect(message).toContain('review lapsed');
  expect(await review(['print'], root, notes)).toContain('lapsed');
  expect(await Bun.file(join(root, 'src/data/spelling-sounds/patterns.json')).text()).toBe(original);
});

test('human fixture reviews preserve the kind and required prefix too', async () => {
  const root = await workspace();
  await review(['record', 'ou', 'ch', '--by', 'TEST ONLY', '--kind', 'human', '--ref', 'TEST'], root);
  const pack = buildPack(await readInputs(root));
  expect(pack.patterns.every(({ review }) => review.kind === 'human' && review.by === 'Human review: TEST ONLY')).toBe(
    true,
  );
});

test('review CLI rejects unknown ids and missing/invalid flags with usage and leaves records alone', async () => {
  const root = await workspace();
  for (const args of [
    ['print', 'unknown'],
    ['record', 'unknown', '--by', 'TEST ONLY', '--kind', 'ai', '--ref', 'TEST'],
    ['record', 'ou', '--by', 'TEST ONLY', '--ref', 'TEST'],
    ['record', 'ou', '--kind', 'ai', '--ref', 'TEST'],
    ['record', 'ou', '--kind', 'ai', '--by', 'TEST ONLY'],
    ['record', 'ou', '--by', 'TEST ONLY', '--kind', 'other', '--ref', 'TEST'],
    ['record', 'ou', '--by', ' ', '--kind', 'ai', '--ref', 'TEST'],
    ['record', 'ou', '--by', 'TEST', '--kind', 'ai', '--ref', ' '],
    ['record'],
    ['print', '--by', 'TEST ONLY'],
    ['print', '--unknown'],
  ]) {
    const result = run(root, 'review.ts', ...args);
    expect(result.code).toBe(1);
    expect(result.err).toContain('Usage:');
  }
  expect(run(root, 'review.ts', 'print', 'unknown').err).toContain('unknown: unknown id');
  expect(await Bun.file(join(root, 'data/spelling-sounds/reviews.json')).json()).toEqual({ records: [] });
  const invalidBuild = run(root, 'build.ts', '--unknown');
  expect(invalidBuild.code).toBe(1);
  expect(invalidBuild.err).toContain('Usage:');
});
