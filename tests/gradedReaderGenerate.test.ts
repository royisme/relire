/** Stage generator tests: invented TEST fixtures and fake executable dispatch only, no real AI. */
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import syllabusJson from '../data/graded-readers/syllabus.json';
import { ReaderSyllabusSchema } from '../src/types/gradedReader';
import { vocabularyHash } from '../src/services/vocabulary/book';
import { ReaderDraftSchema, readDraft, storeDraft, storeCore, storeCandidates } from '../scripts/graded-readers/drafts';
import { policyHash } from '../scripts/graded-readers/gateInputs';
import { generateReader, model, type GenerateOptions } from '../scripts/graded-readers/generator';
import { readerDraftFixture, readerCoreFixture, readerCandidatesFixture } from './fixtures/gradedReaderDrafts';

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
  temporary: string;
  task: string;
  taskFile: string;
  model: string;
  log: string;
  limit: string;
  files: string[];
  properties: string[];
  envClean: boolean;
};
async function setup(modes = ['good'], stage = 1) {
  const root = await mkdtemp(join(tmpdir(), 'relire-TEST-reader-generate-'));
  cleanup.push(root);
  const directory = join(root, 'private');
  const syllabus = ReaderSyllabusSchema.parse(structuredClone(syllabusJson));
  const body = readerDraftFixture().body;
  for (const row of syllabus.stages) {
    row.readerId = `test-reader-${row.order}`;
    row.topicIds = body.topics;
  }
  const draft = readerDraftFixture();
  draft.body.id = syllabus.stages[stage - 1].readerId;
  draft.body.order = stage;
  const { provenance: _provenance, ...output } = draft;
  await storeCore(directory, readerCoreFixture());
  await storeCandidates(directory, readerCandidatesFixture(stage));
  const dispatch = join(root, 'fake-dispatch.ts');
  await copyFile(new URL('./fixtures/gradedReaderDispatch.ts', import.meta.url), dispatch);
  await chmod(dispatch, 0o755);
  await Bun.write(join(root, 'dispatch-fixture.json'), JSON.stringify({ modes, output }));
  const calls = async (): Promise<Call[]> =>
    (await Bun.file(join(root, 'calls.json')).exists()) ? Bun.file(join(root, 'calls.json')).json() : [];
  const options: GenerateOptions = { syllabus, stage, retries: 0, dispatch };
  const run = async (overrides: Partial<GenerateOptions> = {}) => {
    try {
      return await generateReader({ ...options, ...overrides }, directory);
    } finally {
      for (const call of await calls()) if (!cleanup.includes(call.temporary)) cleanup.push(call.temporary);
    }
  };
  return { root, directory, draft, output, options, calls, run };
}

for (const [mode, outcome, detail] of [
  ['json', 'invalid-json', 'SyntaxError'],
  ['schema', 'schema', 'body'],
  ['identity', 'schema', 'order'],
  ['provenance', 'schema', 'provenance'],
  ['none', 'no-output', 'Missing out/draft.json'],
  ['dispatch', 'dispatch', 'exit code 23'],
  ['watchdog', 'timeout', 'exit 124'],
  ['timeout', 'timeout', 'signal'],
] as const) {
  test(`fake ${mode} reports ${outcome} and preserves an earlier draft byte-for-byte`, async () => {
    const env = await setup([mode]);
    await storeDraft(env.directory, 1, env.draft);
    const file = Bun.file(join(env.directory, 'drafts-1.json'));
    const before = await file.text();
    const result = await env.run({ force: true, ...(mode === 'timeout' ? { timeoutMs: 500 } : {}) });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].outcome).toBe(outcome);
    expect(result.failures[0].detail).toContain(detail);
    expect(await file.text()).toBe(before);
    expect(await Bun.file(result.failures[0].log).text()).toBe('TEST fake dispatch log');
    expect(await Bun.file(join(result.failures[0].temporary, 'task.md')).exists()).toBe(true);
  });
}

test('a failed first generation writes no draft; unlaunchable dispatch reports the OS error', async () => {
  const env = await setup(['json']);
  expect((await env.run()).failures[0].outcome).toBe('invalid-json');
  expect(await readDraft(env.directory, 1)).toBeUndefined();
  const result = await env.run({ dispatch: join(env.root, 'TEST-no-such-executable') });
  cleanup.push(result.failures[0].temporary);
  expect(result.failures[0].outcome).toBe('dispatch');
  expect(result.failures[0].detail).toContain('ENOENT');
  expect(await readDraft(env.directory, 1)).toBeUndefined();
});

test('valid fake output gets tool-owned provenance, skips on resume and replaces only with force', async () => {
  const env = await setup();
  const before = Date.now();
  expect((await env.run()).failures).toEqual([]);
  const draft = (await readDraft(env.directory, 1))!;
  expect(draft.body).toEqual(env.draft.body);
  expect(draft.status).toBe('draft');
  expect(draft.provenance.model).toBe(model);
  expect(draft.provenance.origin).toBe('ai-authored');
  expect(draft.provenance.generatedAt).toBe(new Date(before).toISOString().slice(0, 10));
  expect(draft.provenance.promptHash).toMatch(/^[a-f0-9]{64}$/);
  expect(draft.provenance.dependencyHashes).toEqual([]);
  expect((await env.run()).skipped).toBe(true);
  expect(await env.calls()).toHaveLength(1);
  expect((await env.run({ force: true })).failures).toEqual([]);
  expect(await env.calls()).toHaveLength(2);
  expect((await readdir(env.directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  for (const call of await env.calls()) expect(await Bun.file(join(call.temporary, 'task.md')).exists()).toBe(false);
});

test('generation remains schema-only: caps, unresolved analyses and issues are not approval gates', async () => {
  const env = await setup();
  env.options.syllabus.stages[0].maxSentenceWords = 1;
  env.options.syllabus.stages[0].maxTextWords = 1;
  env.output.analyses[0].entryId = 'test-unresolved';
  env.output.issues = ['TEST unresolved concern, not publication approval'];
  await Bun.write(join(env.root, 'dispatch-fixture.json'), JSON.stringify({ modes: ['good'], output: env.output }));
  expect((await env.run()).failures).toEqual([]);
  expect((await readDraft(env.directory, 1))!.issues).toEqual(env.output.issues);
});

test('retry uses a fresh isolated directory and succeeds without touching earlier drafts', async () => {
  const env = await setup(['json', 'good']);
  expect((await env.run({ retries: 1 })).failures).toEqual([]);
  const calls = await env.calls();
  expect(calls).toHaveLength(2);
  expect(calls[0].temporary).not.toBe(calls[1].temporary);
  expect(await Bun.file(join(calls[0].temporary, 'task.md')).exists()).toBe(true);
  expect(ReaderDraftSchema.safeParse(await readDraft(env.directory, 1)).success).toBe(true);
});

test('prompt binds caps, exact core, known senses and closed candidates, with no private paths', async () => {
  const env = await setup(['good'], 3);
  for (const stage of [1, 2]) {
    const draft = readerDraftFixture();
    draft.body.id = env.options.syllabus.stages[stage - 1].readerId;
    draft.body.order = stage;
    draft.body.glossary[0].sense = `test-sense-${stage}`;
    if (stage === 1) draft.body.glossary[1].forms.push('suis');
    await storeDraft(env.directory, stage, draft);
  }
  const firstBefore = await Bun.file(join(env.directory, 'drafts-1.json')).text();
  const result = await env.run();
  expect(result.failures).toEqual([]);
  const [call] = await env.calls();
  const stage = env.options.syllabus.stages[2];
  for (const key of ['newWordBudget', 'maxSentenceWords', 'maxTextWords', 'maxSentences'] as const)
    expect(call.task).toContain(`"${key}": ${stage[key]}`);
  expect(call.task).toContain(JSON.stringify(stage, null, 2));
  expect(call.task).toContain(JSON.stringify(readerCoreFixture(), null, 2));
  expect(call.task).toContain(JSON.stringify(readerCandidatesFixture(3), null, 2));
  expect(call.task).toContain('test-sense-1');
  expect(call.task).toContain('test-sense-2');
  const known = JSON.parse(call.task.split('KNOWN SET K(n)\n')[1].split('\n\nCLOSED STAGE CANDIDATES')[0]);
  expect(known).toHaveLength(8);
  expect(known.find((entry: { lemma: string }) => entry.lemma === 'être').forms).toEqual(['est', 'suis']);
  expect(call.task).not.toContain('{{');
  for (const path of [env.root, env.directory, call.temporary, call.log, '.local/', '.pi-runs/', '/Users/'])
    expect(call.task).not.toContain(path);
  expect(call.files).toEqual(['schema.json', 'task.md']);
  expect(call.properties).toEqual(['analyses', 'body', 'issues', 'status', 'verbGroups']);
  expect(call.model).toBe(model);
  expect(call.limit).toBe('900');
  expect(call.taskFile).toBe(join(call.temporary, 'task.md'));
  const generated = (await readDraft(env.directory, 3))!;
  expect(generated.provenance.promptHash).toBe(createHash('sha256').update(call.task).digest('hex'));
  expect(generated.provenance.dependencyHashes).toEqual(
    await Promise.all(
      [1, 2].map(async (order) => {
        const previous = (await readDraft(env.directory, order))!;
        return { readerId: previous.body.id, contentHash: await vocabularyHash(previous.body) };
      }),
    ),
  );
  expect(generated.provenance.syllabusHash).toBe(policyHash(env.options.syllabus, readerCoreFixture(), 3));
  expect(await Bun.file(join(env.directory, 'drafts-1.json')).text()).toBe(firstBefore);
});

test('missing core, candidates or preceding draft fail before dispatch, without guessing inputs', async () => {
  const env = await setup(['good'], 2);
  expect(await rejection(env.run())).toContain('earlier stage 1');
  const draft = readerDraftFixture();
  draft.body.id = env.options.syllabus.stages[0].readerId;
  await storeDraft(env.directory, 1, draft);
  await rm(join(env.directory, 'candidates-2.json'));
  expect(await rejection(env.run())).toContain('ENOENT');
  await storeCandidates(env.directory, readerCandidatesFixture(2));
  await rm(join(env.directory, 'core.json'));
  expect(await rejection(env.run())).toContain('ENOENT');
  expect(await env.calls()).toEqual([]);
});

test('normalizes French NFC/apostrophes before schema validation, leaving EN/ZH apostrophes intact', async () => {
  const env = await setup(['normalize']);
  env.output.body.title.fr = 'L’été';
  env.output.body.title.en = "TEST don't";
  env.output.body.title.zh += " TEST don't";
  env.output.body.learning.checkpoints[0].questions[1].question.acceptableAnswers = ['est petit'];
  await Bun.write(
    join(env.root, 'dispatch-fixture.json'),
    JSON.stringify({ modes: ['normalize'], output: env.output }),
  );
  expect((await env.run()).failures).toEqual([]);
  const draft = (await readDraft(env.directory, 1))!;
  expect(draft.body).toEqual(env.output.body);
  expect(ReaderDraftSchema.safeParse(draft).success).toBe(true);
});

test('child environment excludes credential-like names and external reference paths', async () => {
  const env = await setup();
  const before = { key: process.env.TEST_READER_API_KEY, ref: process.env.GRAMMAR_REFERENCE_DIR };
  process.env.TEST_READER_API_KEY = 'TEST ONLY not a credential';
  process.env.GRAMMAR_REFERENCE_DIR = '/TEST/private-reference';
  try {
    expect((await env.run()).failures).toEqual([]);
  } finally {
    if (before.key === undefined) delete process.env.TEST_READER_API_KEY;
    else process.env.TEST_READER_API_KEY = before.key;
    if (before.ref === undefined) delete process.env.GRAMMAR_REFERENCE_DIR;
    else process.env.GRAMMAR_REFERENCE_DIR = before.ref;
  }
  expect((await env.calls())[0].envClean).toBe(true);
});

test('CLI help and invalid arguments do not dispatch or read private inputs', async () => {
  const file = new URL('../scripts/graded-readers/generate.ts', import.meta.url).pathname;
  for (const args of [
    ['--help'],
    ['generate', '--stage', '0'],
    ['generate', '--stage', '1', '--retries=-1'],
    ['unknown'],
  ]) {
    const child = Bun.spawn([process.execPath, file, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(args[0] === '--help' ? 0 : 1);
    expect(stdout + stderr).toContain('Usage:');
  }
});

test('the author sees only core words the stage inventory has introduced', async () => {
  const env = await setup(['good'], 1);
  const core = readerCoreFixture();
  // du is introduced at stage 5, so a stage 1 author must not be offered it; unlisted TEST words pass through.
  await storeCore(env.directory, [
    ...core,
    { headword: 'du', pos: 'function', sense: 'article', forms: ['du'], gloss: core[0].gloss },
  ]);
  const result = await env.run();
  expect(result.failures).toEqual([]);
  const [call] = await env.calls();
  expect(call.task).not.toContain('"headword": "du"');
  for (const entry of core) expect(call.task).toContain(`"headword": "${entry.headword}"`);
  // The policy hash still covers the whole core, so the filter cannot hide a core change from review.
  const draft = (await readDraft(env.directory, 1))!;
  expect(draft.provenance.syllabusHash).toBe(
    policyHash(
      env.options.syllabus,
      [...core, { headword: 'du', pos: 'function', sense: 'article', forms: ['du'], gloss: core[0].gloss }],
      1,
    ),
  );
});
