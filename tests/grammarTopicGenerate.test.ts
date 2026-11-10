/** Fake dispatch and invented TEST references only; never invokes a model or a real reference. */
import { afterEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { chmod, cp, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateTopics, type GenerateOptions } from '../scripts/grammar-topics/generator';
import { referenceDirectory, repositoryRoot } from '../scripts/grammar-topics/reference';
import { PrivateDraftSchema, type PrivateDraft } from '../scripts/grammar-topics/drafts';
import { sheet } from '../scripts/grammar-topics/sheet';
import { review } from '../scripts/grammar-topics/review';
import { topicContentHash } from '../scripts/grammar-pack/gate';
import { buildTopics, readTopicInputs, type TopicManifest } from '../scripts/grammar-pack/topics';
import { buildPublishSql } from '../scripts/grammar-topics/publish';
import { pathToFileURL } from 'node:url';
import { GrammarTopicSchema } from '../src/types/grammarTopic';
import { learningFixture, testBilingual } from './fixtures/grammarLearning';
import { createWorkerDb, workerRequest } from './fixtures/workerDb';
import { handle } from '../worker/src/index';
import { topicFixture } from './fixtures/grammarTopics';

const cleanup: string[] = [];
afterEach(async () => {
  for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true });
});

async function rejection(work: Promise<unknown>): Promise<string> {
  return work.then(
    () => 'UNEXPECTED SUCCESS',
    (error: Error) => error.message,
  );
}

type Call = {
  refs: string[];
  temporary: string;
  files: string[];
  envClean: boolean;
  properties: string[];
  arguments: string[];
};
async function setup(
  modes: Record<string, string[]> = {},
  references: number | string[] = 1,
  fixture = topicFixture(),
) {
  const root = await mkdtemp(join(tmpdir(), 'relire-TEST-generator-'));
  cleanup.push(root);
  const reference = join(root, 'reference');
  await mkdir(join(reference, 'topics'), { recursive: true });
  const db = new Database(join(reference, 'library.sqlite3'));
  db.exec(
    'CREATE TABLE topic(id TEXT, title TEXT, chapter TEXT, path TEXT, markdown_sha256 TEXT); CREATE TABLE node(id TEXT, parent TEXT, title TEXT, path TEXT, referenced_page INTEGER); CREATE TABLE link(topic TEXT, node TEXT, role TEXT); CREATE TABLE source_ref(id TEXT); CREATE TABLE table_ref(id TEXT); CREATE TABLE review(id TEXT)',
  );
  const manifest: TopicManifest = { packVersion: '0.1.0', topics: [] };
  const refs =
    typeof references === 'number'
      ? Array.from({ length: references }, (_, i) => `K${String(i + 1).padStart(3, '0')}`)
      : references;
  for (const [i, ref] of refs.entries()) {
    await Bun.write(join(reference, 'topics', `${ref}.md`), `TEST ONLY: invented schema probe ${ref}\nTEST\n`);
    db.query('INSERT INTO topic VALUES (?, ?, ?, ?, ?)').run(ref, 'TEST ONLY', 'TEST ONLY', '', '');
    manifest.topics.push({
      id: `test-${String.fromCharCode(97 + i)}`,
      reference: ref,
      chapter: 'test-only',
      tags: ['articles'],
      level: 'A1',
      related: [],
      include: false,
    });
  }
  db.close();
  await Bun.write(join(root, 'data/grammar-topics/manifest.json'), JSON.stringify(manifest));
  await Bun.write(join(root, 'data/grammar-topics/reviews.json'), '{"records":[]}\n');
  const dispatch = join(root, 'fake-dispatch.ts');
  const callsFile = join(root, 'calls.json');
  await Bun.write(
    dispatch,
    `#!${Bun.which('bun')}
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
const [directory, model, prompt, log, limit] = Bun.argv.slice(2);
const file = Bun.file(${JSON.stringify(callsFile)});
const calls = await file.exists() ? await file.json() : [];
const refs = (await readdir(join(directory, 'topics'))).sort().map(name => name.slice(0, -3));
const schema = await Bun.file(join(directory, 'schema.json')).json();
const envClean = !Object.keys(process.env).some(name => name === 'GRAMMAR_REFERENCE_DIR' || /KEY|TOKEN|SECRET/i.test(name));
const modes = ${JSON.stringify(modes)};
const selected = refs.map(ref => (modes[ref] ?? ['good'])[Math.min(calls.filter(call => call.refs.includes(ref)).length, (modes[ref] ?? ['good']).length - 1)]);
calls.push({refs, temporary: directory, files: (await readdir(directory)).sort(), envClean, properties: Object.keys(schema.properties).sort(), arguments: [model,prompt,log,limit]});
await Bun.write(file, JSON.stringify(calls));
await Bun.write(log, 'TEST fake dispatch log');
console.error('TEST fake stderr');
if (selected.includes('dispatch')) process.exit(23);
if (selected.includes('watchdog')) process.exit(124);
if (selected.includes('signal')) process.kill(process.pid, 'SIGTERM');
for (let i=0;i<refs.length;i++) {
  const mode = selected[i];
  if (mode === 'none') continue;
  const value = ${JSON.stringify({ title: fixture.title, blocks: fixture.blocks, learning: fixture.learning, uncertain: ['TEST DOUBT'], status: 'reviewed', reviewedBy: 'TEST NOT TRUSTED' })};
  if (mode === 'schema') delete value.title;
  if (mode === 'language') value.title.zh = 'TEST NO CJK';
  if (mode === 'ragged') value.blocks[2].rows[0] = [];
  if (mode === 'tables') value.blocks.push(value.blocks[2]);
  if (mode === 'dialogue') value.blocks[3].items.forEach((item, index) => item.speaker = index === 0 ? 'A' : 'B');
  if (mode === 'normalize') value.blocks[3].items[0].fr = "TEST e\\u0301 l'apostrophe";
  if (mode === 'learning-missing-feedback') delete value.learning.checkpoints[0].questions[0].feedback.byAnswer;
  if (mode === 'learning-collision') value.learning.checkpoints[0].questions[1].acceptableAnswers = [' ÉCOLE '];
  if (mode === 'learning-ragged') value.learning.checkpoints[0].teaching = [{type:'table', header:[{fr:'TEST'}, {fr:'TEST'}], rows:[[{fr:'TEST'}]]}];
  if (mode === 'learning-language') value.learning.instruction.zh = 'TEST NO CJK';
  if (mode === 'learning-normalize') {
    const cp = value.learning.checkpoints[0];
    cp.teaching.push({type:'examples', items:[{fr:"TEST e\\u0301 l'apostrophe", en:"TEST e\\u0301 don't", zh:"\\u6d4b\\u8bd5 e\\u0301 l'"}]});
    const [choice, typed] = cp.questions;
    choice.prompt = "TEST {l'e\\u0301te\\u0301|l‘hiver|TEST}";
    choice.expectedAnswer = "l'e\\u0301te\\u0301";
    choice.feedback.byAnswer[0].answer = 'l‘hiver';
    choice.feedback.byAnswer[1].answer = 'TEST';
    typed.prompt = "TEST l'e\\u0301te\\u0301 [___]";
    typed.expectedAnswer = "l'e\\u0301cole";
    typed.acceptableAnswers = ["l‘e\\u0301tage"];
    typed.feedback.byAnswer = [{answer:"l'essai", message: typed.feedback.incorrect}];
  }
  await Bun.write(join(directory, 'out', refs[i]+'.json'), mode === 'json' ? '{TEST bad JSON' : JSON.stringify(value));
}
`,
  );
  await chmod(dispatch, 0o755);
  const output = join(root, '.local/grammar-topics');
  const options: GenerateOptions = { manifest, reference, chapter: 'test-only', retries: 0, dispatch };
  const calls = async (): Promise<Call[]> => ((await Bun.file(callsFile).exists()) ? Bun.file(callsFile).json() : []);
  const run = async (overrides: Partial<GenerateOptions> = {}) => {
    const result = await generateTopics({ ...options, ...overrides }, output);
    cleanup.push(result.runDirectory);
    for (const call of await calls()) if (!cleanup.includes(call.temporary)) cleanup.push(call.temporary);
    return result;
  };
  return { root, reference, manifest, dispatch, output, calls, run };
}

for (const [mode, outcome, detail] of [
  ['json', 'invalid-json', 'SyntaxError'],
  ['schema', 'schema', 'title'],
  ['none', 'no-output', 'Missing out/K001.json'],
  ['language', 'language-check', 'title.zh: Chinese text needs a CJK character'],
  ['ragged', 'schema', 'blocks.2.rows.0: row width must match header'],
  ['dispatch', 'dispatch', 'exit code 23'],
  ['watchdog', 'dispatch', 'exit code 124 (watchdog gave up)'],
  ['signal', 'timeout', 'timeout or signal SIGTERM'],
] as const) {
  test(`fake ${mode} reports ${outcome}, the real error and writes nothing`, async () => {
    const env = await setup({ K001: [mode] });
    const { failures } = await env.run();
    expect(failures).toHaveLength(1);
    expect(failures[0].outcome).toBe(outcome);
    expect(failures[0].detail).toContain(detail);
    expect(await Bun.file(join(env.output, 'drafts-test-only.json')).exists()).toBe(false);
    expect(await Bun.file(failures[0].log).text()).toBe('TEST fake dispatch log');
    expect(await Bun.file(join(failures[0].temporary, 'task.md')).exists()).toBe(true);
  });
}

test('fake valid output is always draft, keeps uncertainty/warnings, resumes and supports force', async () => {
  const env = await setup();
  expect((await env.run()).failures).toEqual([]);
  const file = Bun.file(join(env.output, 'drafts-test-only.json'));
  const [draft] = await file.json();
  expect(draft.status).toBe('draft');
  expect(draft).not.toHaveProperty('reviewedBy');
  expect(draft).not.toHaveProperty('reviewedAt');
  expect(draft.uncertain).toEqual(['TEST DOUBT']);
  expect(draft.warnings[0]).toContain('verbatim example');
  expect(draft.provenance.promptHash).toMatch(/^[a-f0-9]{8}$/);
  expect(draft.provenance.generatedAt).toBe(new Date().toISOString().slice(0, 10));
  expect(draft.provenance.reference).toBe('K001');
  expect(await Bun.file(join(env.root, 'data/grammar-topics/reviews.json')).text()).toBe('{"records":[]}\n');
  await env.run();
  expect(await env.calls()).toHaveLength(1);
  await env.run({ force: true });
  expect(await env.calls()).toHaveLength(2);
  expect(await file.json()).toHaveLength(1);
  const text = await sheet(env.output, 'test-only', 'draft', env.root);
  expect(text).toContain('TEST DOUBT');
  expect(text).toContain('verbatim example');
  expect(text).toContain('Block 3: table');
  expect(text).toContain(draft.title.zh);
  expect(text).not.toContain('STALE PROMPT');
  draft.provenance.promptHash = '00000000';
  await Bun.write(file, JSON.stringify([draft]));
  expect(await sheet(env.output, undefined, undefined, env.root)).toContain('STALE PROMPT');
});

test('synthetic K001, K053 and K086 probes validate tables, notes and dialogue without real topic text', async () => {
  const env = await setup({ K053: ['tables'], K086: ['dialogue'] }, ['K001', 'K053', 'K086']);
  expect((await env.run()).failures).toEqual([]);
  const drafts: PrivateDraft[] = (await Bun.file(join(env.output, 'drafts-test-only.json')).json()).map(
    (value: unknown) => PrivateDraftSchema.parse(value),
  );
  expect(drafts).toHaveLength(3);
  expect(drafts[0].blocks.some((block) => block.type === 'note')).toBe(true);
  expect(drafts[1].blocks.filter((block) => block.type === 'table')).toHaveLength(2);
  const dialogue = drafts[2].blocks.find((block) => block.type === 'examples');
  expect(dialogue?.items.map((item) => item.speaker)).toEqual(['A', 'B']);
});

test('an unlaunchable fake dispatch reports the operating system error without writing a draft', async () => {
  const env = await setup();
  const { failures } = await env.run({ dispatch: join(env.root, 'TEST-no-such-executable') });
  expect(failures[0].outcome).toBe('dispatch');
  expect(failures[0].detail).toContain('ENOENT');
  cleanup.push(failures[0].temporary);
  expect(await Bun.file(join(env.output, 'drafts-test-only.json')).exists()).toBe(false);
});

test('failed forced generation preserves the previous draft byte for byte', async () => {
  const env = await setup({ K001: ['good', 'json'] });
  await env.run();
  const file = Bun.file(join(env.output, 'drafts-test-only.json'));
  const before = await file.text();
  expect((await env.run({ force: true })).failures[0].outcome).toBe('invalid-json');
  expect(await file.text()).toBe(before);
});

test('retries dispatch only failures in a fresh directory and batches stay sequential at six', async () => {
  const env = await setup({ K002: ['none', 'good'] }, 8);
  expect((await env.run({ retries: 1 })).failures).toEqual([]);
  const calls = await env.calls();
  expect(calls.map((call) => call.refs)).toEqual([
    ['K001', 'K002', 'K003', 'K004', 'K005', 'K006'],
    ['K007', 'K008'],
    ['K002'],
  ]);
  expect(new Set(calls.map((call) => call.temporary)).size).toBe(3);
  expect(await Bun.file(join(env.output, 'drafts-test-only.json')).json()).toHaveLength(8);
});

test('only filters by reference and an invalid existing draft does not count as resumable', async () => {
  const env = await setup({}, 2);
  await Bun.write(join(env.output, 'drafts-test-only.json'), JSON.stringify([{ id: 'test-a' }]));
  await env.run({ only: ['K001'] });
  expect((await env.calls()).map((call) => call.refs)).toEqual([['K001']]);
  expect(await Bun.file(join(env.output, 'drafts-test-only.json')).json()).toHaveLength(1);
  expect(await rejection(env.run({ only: ['K003'] }))).toContain('not in chapter');
});

test('throwaway contains only group topic inputs, schema, task and dispatch files; child env is scrubbed', async () => {
  const env = await setup({ K001: ['normalize'] });
  const old = process.env.TEST_API_KEY;
  const oldRef = process.env.GRAMMAR_REFERENCE_DIR;
  process.env.TEST_API_KEY = 'TEST ONLY NOT A CREDENTIAL';
  process.env.GRAMMAR_REFERENCE_DIR = env.reference;
  try {
    await env.run();
  } finally {
    if (old === undefined) delete process.env.TEST_API_KEY;
    else process.env.TEST_API_KEY = old;
    if (oldRef === undefined) delete process.env.GRAMMAR_REFERENCE_DIR;
    else process.env.GRAMMAR_REFERENCE_DIR = oldRef;
  }
  const [call] = await env.calls();
  expect(call.files).toEqual(['dispatch-output.log', 'dispatch.md', 'log', 'schema.json', 'task.md', 'topics']);
  expect(call.refs).toEqual(['K001']);
  expect(call.envClean).toBe(true);
  expect(call.properties).toEqual(['blocks', 'learning', 'title', 'uncertain']);
  expect(call.arguments).toEqual([
    'antigravity/gemini-3.8-flash',
    join(call.temporary, 'dispatch.md'),
    join(call.temporary, 'log'),
    '900',
  ]);
  const [draft] = await Bun.file(join(env.output, 'drafts-test-only.json')).json();
  expect(draft.blocks[3].items[0].fr).toBe('TEST é l’apostrophe');
  expect(PrivateDraftSchema.safeParse(draft).success).toBe(true);
});

test('complete TEST learning survives generation, sheet, hash review, assembly, SQL and body delivery', async () => {
  const fixture = learningFixture();
  fixture.learning.checkpoints[0].teaching.push({
    type: 'examples',
    items: [{ fr: 'TEST', ...testBilingual('TEST compact example') }],
  });
  const env = await setup({}, 1, fixture);
  expect((await env.run()).failures).toEqual([]);
  const [draft] = await Bun.file(join(env.output, 'drafts-test-only.json')).json();
  expect(draft.learning).toEqual(fixture.learning);
  expect(draft.status).toBe('draft');
  expect(draft.warnings).toContain('learning.checkpoints.0.teaching.1.items.0.fr: verbatim example in reference K001');
  const text = await sheet(env.output, undefined, undefined, env.root);
  expect(text).toContain('Linguistic correctness');
  expect(text).toContain('C1 ceiling');
  expect(text).toContain('taught-before-tested');
  expect(text).toContain('no answer leakage');
  expect(text).toContain('faithful bilingual feedback');
  expect(text).toContain('not linguistic approval');
  for (const checkpoint of fixture.learning.checkpoints) {
    expect(text).toContain(checkpoint.id);
    for (const question of checkpoint.questions) {
      expect(text).toContain(question.id);
      expect(text).toContain(`Expected key: ${JSON.stringify(question.expectedAnswer)}`);
      expect(text).toContain('Normalized collisions: none (schema validated)');
    }
  }
  expect(text).toContain('Options: ["été","hiver","printemps"]');
  expect(text).toContain('Accepted keys: ["école","collège"]');
  const questions = fixture.learning.checkpoints.flatMap((checkpoint) => checkpoint.questions);
  let previous = -1;
  for (const [index, question] of questions.entries()) {
    const position = text.indexOf(`Question ${index + 1}: ${question.id} | ${question.type}`);
    expect(position).toBeGreaterThan(previous);
    previous = position;
  }
  // Full JSON remains visible too: every translation, teaching block and optional detail/match.
  expect(text).toContain(JSON.stringify(draft.learning, null, 2));
  env.manifest.topics[0].include = true;
  await Bun.write(join(env.root, 'data/grammar-topics/manifest.json'), JSON.stringify(env.manifest));
  await review(['mark', 'test-a', '--by', 'TEST ONLY synthetic reviewer'], env.root);
  const input = await readTopicInputs(pathToFileURL(env.root + '/'));
  const assembled = buildTopics(input).pack.topics[0];
  expect(assembled.learning).toEqual(fixture.learning);
  expect(assembled.reviewedBy).toBe('TEST ONLY synthetic reviewer');
  expect(assembled).not.toHaveProperty('warnings');
  const { db, env: worker } = await createWorkerDb();
  try {
    db.exec(buildPublishSql(input).sql);
    const response = await handle(workerRequest('https://content.test/v1/topics/test-a'), worker);
    expect(response.status).toBe(200);
    expect(GrammarTopicSchema.parse(await response.json())).toEqual(assembled);
  } finally {
    db.close();
  }
});

test('learning French fields normalize NFC/apostrophes without rewriting bilingual prose or grading keys', async () => {
  const env = await setup({ K001: ['learning-normalize'] }, 1, learningFixture());
  expect((await env.run()).failures).toEqual([]);
  const [draft] = await Bun.file(join(env.output, 'drafts-test-only.json')).json();
  const cp = draft.learning.checkpoints[0];
  expect(cp.teaching[1].items[0]).toEqual({ fr: 'TEST é l’apostrophe', en: "TEST é don't", zh: "\u6d4b\u8bd5 é l'" });
  expect(cp.questions[0].prompt).toBe('TEST {l’été|l’hiver|TEST}');
  expect(cp.questions[0].expectedAnswer).toBe('l’été');
  expect(cp.questions[0].feedback.byAnswer[0].answer).toBe('l’hiver');
  expect(cp.questions[1].prompt).toBe('TEST l’été [___]');
  expect(cp.questions[1].expectedAnswer).toBe('l’école');
  expect(cp.questions[1].acceptableAnswers).toEqual(['l’étage']);
  expect(cp.questions[1].feedback.byAnswer[0].answer).toBe('l’essai');
  expect(PrivateDraftSchema.safeParse(draft).success).toBe(true);
  const text = await sheet(env.output, undefined, undefined, env.root);
  expect(text).toContain(`Expected key: "l'école"`);
  expect(text).toContain(`Accepted keys: ["l'école","l'étage"]`);
  expect(text).toContain(`Option keys: ["l'été","l'hiver","test"]`);
  expect(text).toContain(`Feedback matches (answer/key): [{"answer":"l’essai","key":"l'essai"}]`);
});

for (const mode of ['learning-missing-feedback', 'learning-collision', 'learning-ragged', 'learning-language'])
  test(`malformed ${mode} is not accepted, even by a forced retry over a valid draft`, async () => {
    const env = await setup({ K001: [mode, 'good', mode] }, 1, learningFixture());
    expect((await env.run()).failures).toHaveLength(1);
    const file = join(env.output, 'drafts-test-only.json');
    expect(await Bun.file(file).exists()).toBe(false);
    expect((await env.run()).failures).toEqual([]);
    const valid = await Bun.file(file).text();
    expect((await env.run({ force: true })).failures).toHaveLength(1);
    expect(await Bun.file(file).text()).toBe(valid);
    const [draft] = await Bun.file(file).json();
    if (mode === 'learning-language') draft.learning.instruction.zh = 'TEST NO CJK';
    else if (mode === 'learning-ragged')
      draft.learning.checkpoints[0].teaching[0] = { type: 'table', header: [], rows: [] };
    else if (mode === 'learning-collision') draft.learning.checkpoints[0].questions[1].acceptableAnswers = [' ÉCOLE '];
    else delete draft.learning.checkpoints[0].questions[0].feedback.byAnswer;
    await Bun.write(file, JSON.stringify([draft]));
    expect(await rejection(sheet(env.output, undefined, undefined, env.root))).not.toBe('UNEXPECTED SUCCESS');
  });

test('reference guard refuses in-repo paths, symlinks into the repo and missing required entries', async () => {
  const env = await setup();
  expect(await rejection(referenceDirectory(repositoryRoot))).toContain('outside the repository');
  await symlink(repositoryRoot, join(env.root, 'alias'));
  expect(await rejection(env.run({ reference: join(env.root, 'alias') }))).toContain('outside the repository');
  expect(await rejection(env.run({ reference: env.root }))).toContain('needs topics/');
  await mkdir(join(env.root, 'topics'));
  expect(await rejection(env.run({ reference: env.root }))).toContain('needs library.sqlite3');
  expect(await rejection(env.run({ reference: undefined }))).toContain('Set GRAMMAR_REFERENCE_DIR');
  expect(await env.calls()).toEqual([]);
});

test('review mark/unmark runs against a temporary copy only, hashes effective manifest metadata', async () => {
  const env = await setup();
  await env.run();
  env.manifest.topics[0].tags = ['present'];
  await Bun.write(join(env.root, 'data/grammar-topics/manifest.json'), JSON.stringify(env.manifest));
  await review(['mark', 'test-a', '--by', 'TEST OWNER'], env.root);
  const file = Bun.file(join(env.root, 'data/grammar-topics/reviews.json'));
  const records = (await file.json()).records;
  const [draft] = await Bun.file(join(env.output, 'drafts-test-only.json')).json();
  expect(records[0].contentHash).toBe(topicContentHash({ ...draft, tags: ['present'] }));
  expect(records[0].reviewedBy).toBe('TEST OWNER');
  expect(draft.status).toBe('draft');
  await review(['mark', 'test-a', '--by', 'TEST OWNER TWO'], env.root);
  expect((await file.json()).records).toHaveLength(2);
  await review(['unmark', 'test-a'], env.root);
  expect((await file.json()).records).toEqual([]);
  expect(await rejection(review(['mark', 'test-a', '--by', ''], env.root))).toContain('Too small');
  expect(await rejection(review(['unmark', 'test-unknown'], env.root))).toContain('unknown topic');
});

// Copy entrypoints rather than introducing a CLI output-directory override for tests.
test('actual CLIs use the private path, report errors on stderr and exit 1 on a failed topic', async () => {
  const env = await setup({ K001: ['json', 'good'] });
  const repo = join(env.root, 'repository');
  const output = join(repo, '.local/grammar-topics');
  await cp(join(env.root, 'data'), join(repo, 'data'), { recursive: true });
  await cp(join(repositoryRoot, 'scripts/grammar-topics'), join(repo, 'scripts/grammar-topics'), { recursive: true });
  await cp(join(repositoryRoot, 'scripts/grammar-pack'), join(repo, 'scripts/grammar-pack'), { recursive: true });
  await cp(join(repositoryRoot, 'src/types'), join(repo, 'src/types'), { recursive: true });
  await mkdir(join(repo, 'src/services/exercises'), { recursive: true });
  await cp(
    join(repositoryRoot, 'src/services/exercises/normalizeFrench.ts'),
    join(repo, 'src/services/exercises/normalizeFrench.ts'),
  );
  // Exercise metadata also validates reader and spelling-sound provenance, so the copied contracts need their pure dependencies.
  for (const file of [
    'services/grammarPack/lookup.ts',
    'utils/readerTokens.ts',
    'utils/sentences.ts',
    'data/frenchIpa.ts',
  ]) {
    const destination = join(repo, 'src', file);
    await mkdir(join(destination, '..'), { recursive: true });
    await cp(join(repositoryRoot, 'src', file), destination);
  }
  await symlink(join(repositoryRoot, 'node_modules'), join(repo, 'node_modules'));
  const cli = async (file: string, args: string[]) => {
    const child = Bun.spawn(['bun', file, ...args], {
      cwd: repo,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, GRAMMAR_REFERENCE_DIR: env.reference },
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  };
  const failed = await cli('scripts/grammar-topics/generate.ts', [
    'generate',
    '--chapter',
    'test-only',
    '--dispatch',
    env.dispatch,
  ]);
  expect(failed.code).toBe(1);
  expect(failed.stderr).toContain('test-a: invalid-json');
  expect(failed.stderr).toContain('SyntaxError');
  const passed = await cli('scripts/grammar-topics/generate.ts', [
    'generate',
    '--chapter',
    'test-only',
    '--retries',
    '1',
    '--dispatch',
    env.dispatch,
  ]);
  expect(passed.code).toBe(0);
  expect(await Bun.file(join(output, 'drafts-test-only.json')).exists()).toBe(true);
  const printed = await cli('scripts/grammar-topics/generate.ts', ['sheet', '--status', 'draft']);
  expect(printed.code).toBe(0);
  expect(printed.stdout).toContain('TEST DOUBT');
  const marked = await cli('scripts/grammar-topics/review.ts', ['mark', 'test-a', '--by', 'TEST CLI OWNER']);
  expect(marked.code).toBe(0);
  expect((await Bun.file(join(repo, 'data/grammar-topics/reviews.json')).json()).records).toHaveLength(1);
  expect((await cli('scripts/grammar-topics/review.ts', ['unmark', 'test-a'])).code).toBe(0);
  for (const call of await env.calls()) cleanup.push(call.temporary);
  expect(await readdir(output)).toEqual(['drafts-test-only.json']);
  for (const name of ['topics.json', 'tag-index.json'])
    expect(await Bun.file(new URL(`../src/data/grammar/${name}`, import.meta.url)).exists()).toBe(false);
});
