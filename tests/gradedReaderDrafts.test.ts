/** Private contract/storage checks using invented TEST content only; no gates or real content. */
import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ReaderDraftSchema,
  ReaderDraftOutputSchema,
  VerbAnalysisSchema,
  AtomAnalysisSchema,
  VerbGroupSchema,
  CoreSchema,
  CandidatesSchema,
  readDraft,
  storeDraft,
  readCore,
  storeCore,
  readCandidates,
  storeCandidates,
} from '../scripts/graded-readers/drafts';
import { readerDraftFixture, readerCoreFixture, readerCandidatesFixture } from './fixtures/gradedReaderDrafts';

const cleanup: string[] = [];
afterEach(async () => {
  for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true });
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'relire-TEST-reader-drafts-'));
  cleanup.push(path);
  return path;
}
async function rejection(work: Promise<unknown>): Promise<string> {
  return work.then(
    () => 'UNEXPECTED SUCCESS',
    (error: Error) => error.message,
  );
}
function change(value: unknown, path: (string | number)[], replacement: unknown) {
  let parent = value as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  parent[path.at(-1)!] = replacement;
}

test('private TEST envelope and model output parse without rewriting content', () => {
  const draft = readerDraftFixture();
  expect(ReaderDraftSchema.parse(draft)).toEqual(draft);
  const { provenance: _provenance, ...output } = draft;
  expect(ReaderDraftOutputSchema.parse(output)).toEqual(output);
  expect(ReaderDraftOutputSchema.safeParse(draft).success).toBe(false);
  expect(() => z.toJSONSchema(ReaderDraftOutputSchema)).not.toThrow();
  expect(AtomAnalysisSchema.parse(draft.analyses[0])).toEqual(draft.analyses[0]);
  expect(VerbGroupSchema.parse(draft.verbGroups[0])).toEqual(draft.verbGroups[0]);
});

const draftMutations: [string, (string | number)[], unknown][] = [
  ['non-draft status', ['status'], 'reviewed'],
  ['missing body', ['body'], undefined],
  ['body invariant', ['body', 'sentences', 0, 'tokens'], []],
  ['empty analyses', ['analyses'], []],
  ['negative ordinal', ['analyses', 0, 'ordinal'], -1],
  ['fractional ordinal', ['analyses', 0, 'ordinal'], 0.1],
  ['negative part', ['analyses', 0, 'part'], -1],
  ['fractional part', ['analyses', 0, 'part'], 0.1],
  ['bad target id', ['analyses', 0, 'targetId'], 'not a slug'],
  ['bad entry id', ['analyses', 0, 'entryId'], ''],
  ['unknown atom field', ['analyses', 0, 'extra'], true],
  ['unknown verb kind', ['analyses', 2, 'verb'], { kind: 'guess' }],
  ['missing verb groups', ['verbGroups'], undefined],
  ['empty group atoms', ['verbGroups', 0, 'atomIds'], []],
  ['blank atom id', ['verbGroups', 0, 'atomIds', 0], ''],
  ['bad group target', ['verbGroups', 0, 'targetId'], 'not a slug'],
  ['bad group kind', ['verbGroups', 0, 'kind'], 'guess'],
  ['missing finite atom', ['verbGroups', 0, 'finiteAtomId'], undefined],
  ['unknown group field', ['verbGroups', 0, 'extra'], true],
  ['wrong origin', ['provenance', 'origin'], 'human-authored'],
  ['empty model', ['provenance', 'model'], ''],
  ['untrimmed model', ['provenance', 'model'], ' TEST '],
  ['non-NFC model', ['provenance', 'model'], 'TEST e\u0301'],
  ['control in model', ['provenance', 'model'], 'TEST\u0000'],
  ['HTML in model', ['provenance', 'model'], '<b>TEST</b>'],
  ['invalid date', ['provenance', 'generatedAt'], '2026-02-30'],
  ['timestamp instead of date', ['provenance', 'generatedAt'], '2026-10-23T00:00:00Z'],
  ['short prompt hash', ['provenance', 'promptHash'], 'abcd'],
  ['uppercase syllabus hash', ['provenance', 'syllabusHash'], 'A'.repeat(64)],
  ['missing dependencies', ['provenance', 'dependencyHashes'], undefined],
  ['invalid dependency id', ['provenance', 'dependencyHashes'], [{ readerId: '', contentHash: 'a'.repeat(64) }]],
  ['invalid dependency hash', ['provenance', 'dependencyHashes'], [{ readerId: 'test', contentHash: 'bad' }]],
  [
    'unknown dependency field',
    ['provenance', 'dependencyHashes'],
    [{ readerId: 'test', contentHash: 'a'.repeat(64), review: true }],
  ],
  ['unknown provenance field', ['provenance', 'reviewedBy'], 'TEST'],
  ['missing issues', ['issues'], undefined],
  ['blank issue', ['issues'], ['']],
  ['control in issue', ['issues'], ['TEST\n']],
  ['unknown envelope field', ['extra'], true],
];
for (const [name, path, value] of draftMutations) {
  test(`draft rejects ${name}`, () => {
    const draft = readerDraftFixture();
    change(draft, path, value);
    expect(ReaderDraftSchema.safeParse(draft).success).toBe(false);
  });
}

test('all verb variants, persons, tenses, agreements and group kinds are represented structurally', () => {
  for (const tense of ['present', 'imparfait', 'futur', 'conditionnel', 'subjonctif', 'imperatif'])
    for (const person of ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'])
      expect(VerbAnalysisSchema.safeParse({ kind: 'finite', tense, person }).success).toBe(true);
  for (const agreement of ['ms', 'fs', 'mp', 'fp'])
    expect(VerbAnalysisSchema.safeParse({ kind: 'past-participle', agreement }).success).toBe(true);
  for (const kind of ['infinitive', 'present-participle'])
    expect(VerbAnalysisSchema.safeParse({ kind }).success).toBe(true);
  for (const value of [
    { kind: 'finite', tense: 'past', person: '3sg' },
    { kind: 'finite', tense: 'present', person: '4sg' },
    { kind: 'finite', tense: 'present' },
    { kind: 'past-participle' },
    { kind: 'past-participle', agreement: 'guess' },
    { kind: 'infinitive', tense: 'present' },
    { kind: 'present-participle', extra: true },
  ])
    expect(VerbAnalysisSchema.safeParse(value).success).toBe(false);
  for (const kind of ['simple', 'modal-infinitive', 'near-future', 'recent-past', 'passeCompose'])
    expect(VerbGroupSchema.safeParse({ ...readerDraftFixture().verbGroups[0], kind }).success).toBe(true);
  // Linking and tense permission are deliberately deferred to R0-3, not silently claimed here.
  const draft = readerDraftFixture();
  draft.analyses[0].entryId = 'unresolved-test';
  draft.issues = ['TEST unresolved analysis'];
  expect(ReaderDraftSchema.safeParse(draft).success).toBe(true);
});

test('closed core and stage candidates accept distinct senses, never guessed genders or unknown fields', () => {
  const core = readerCoreFixture();
  const candidates = readerCandidatesFixture();
  expect(CoreSchema.parse(core)).toEqual(core);
  expect(CandidatesSchema.parse(candidates)).toEqual(candidates);
  expect(CoreSchema.safeParse([...core, { ...core[0], sense: 'other-sense' }]).success).toBe(true);
  expect(CoreSchema.safeParse([...core, core[0]]).success).toBe(false);
  expect(
    CandidatesSchema.safeParse({ ...candidates, entries: [...candidates.entries, candidates.entries[0]] }).success,
  ).toBe(false);
  for (const patch of [
    { headword: '' },
    { headword: "l'un" },
    { pos: 'noun' },
    { sense: '' },
    { forms: [] },
    { forms: ['le', 'le'] },
    { forms: ['e\u0301'] },
    { gloss: { en: 'TEST', zh: 'TEST' } },
    { extra: true },
  ])
    expect(CoreSchema.safeParse([{ ...core[0], ...patch }]).success).toBe(false);
  for (const patch of [
    { lemma: '' },
    { lemma: "l'un" },
    { pos: 'unknown' },
    { sense: '' },
    { forms: [] },
    { forms: ['livre', 'livre'] },
    { gloss: { en: 'TEST中', zh: '测试' } },
    { gloss: { en: 'TEST', zh: 'TEST' } },
    { gender: undefined },
    { gender: 'unknown' },
    { id: 'unsupported-field' },
  ])
    expect(CandidatesSchema.safeParse({ stage: 1, entries: [{ ...candidates.entries[0], ...patch }] }).success).toBe(
      false,
    );
  expect(
    CandidatesSchema.safeParse({ stage: 1, entries: [{ ...candidates.entries[1], gender: 'masculine' }] }).success,
  ).toBe(false);
  for (const stage of [0, 13, 1.5]) expect(CandidatesSchema.safeParse({ ...candidates, stage }).success).toBe(false);
  expect(CoreSchema.safeParse([]).success).toBe(false);
  expect(CandidatesSchema.safeParse({ stage: 1, entries: [] }).success).toBe(false);
  expect(CandidatesSchema.safeParse({ ...candidates, extra: true }).success).toBe(false);
});

test('reader/writers round-trip, reject invalid inputs and missing/misfiled candidates clearly', async () => {
  const path = await directory();
  expect(await readDraft(path, 1)).toBeUndefined();
  await storeCore(path, readerCoreFixture());
  await storeCandidates(path, readerCandidatesFixture());
  await storeDraft(path, 1, readerDraftFixture());
  expect(await readCore(path)).toEqual(readerCoreFixture());
  expect(await readCandidates(path, 1)).toEqual(readerCandidatesFixture());
  expect(await readDraft(path, 1)).toEqual(readerDraftFixture());
  const before = await Bun.file(join(path, 'drafts-1.json')).text();
  expect(await rejection(storeDraft(path, 1, { ...readerDraftFixture(), status: 'reviewed' } as never))).not.toBe(
    'UNEXPECTED SUCCESS',
  );
  expect(await Bun.file(join(path, 'drafts-1.json')).text()).toBe(before);
  await Bun.write(join(path, 'candidates-2.json'), JSON.stringify(readerCandidatesFixture(1)));
  expect(await rejection(readCandidates(path, 2))).toContain('does not match');
  expect(await rejection(readCore(join(path, 'missing')))).toContain('ENOENT');
  expect(await rejection(readDraft(path, -1))).not.toBe('UNEXPECTED SUCCESS');
  await Bun.write(join(path, 'drafts-3.json'), '{}');
  expect(await rejection(readDraft(path, 3))).not.toBe('UNEXPECTED SUCCESS');
});

test('atomic replacement changes inode and concurrent readers only see complete old/new JSON', async () => {
  const path = await directory();
  const file = join(path, 'drafts-1.json');
  const draft = readerDraftFixture();
  await storeDraft(path, 1, draft);
  const inode = (await stat(file)).ino;
  await storeDraft(path, 1, { ...draft, issues: ['TEST first replacement'] });
  expect((await stat(file)).ino).not.toBe(inode);
  let complete = false;
  const writing = (async () => {
    for (let i = 0; i < 10; i++) await storeDraft(path, 1, { ...draft, issues: [`TEST revision ${i}`] });
    complete = true;
  })();
  let reads = 0;
  while (!complete) {
    expect(ReaderDraftSchema.safeParse(await Bun.file(file).json()).success).toBe(true);
    reads++;
  }
  await writing;
  expect(reads).toBeGreaterThan(0);
  expect(await readdir(path)).toEqual(['drafts-1.json']);
});

test('failed rename removes its temporary file without damaging existing drafts', async () => {
  const path = await directory();
  await storeDraft(path, 1, readerDraftFixture());
  const before = await Bun.file(join(path, 'drafts-1.json')).text();
  await mkdir(join(path, 'drafts-2.json'));
  expect(await rejection(storeDraft(path, 2, readerDraftFixture()))).not.toBe('UNEXPECTED SUCCESS');
  expect(await Bun.file(join(path, 'drafts-1.json')).text()).toBe(before);
  expect((await readdir(path)).sort()).toEqual(['drafts-1.json', 'drafts-2.json']);
});
