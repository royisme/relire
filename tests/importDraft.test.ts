import { expect, test } from 'bun:test';
import {
  answerKey,
  answerOrigin,
  answerText,
  ImportDraftSchema,
  parseImportDraft,
  prepareImport,
  type ImportSource,
} from '../src/services/exercises/importDraft';
import { draftFixture } from './fixtures/importDraft';

const textSource: ImportSource = { kind: 'text', name: 'Texte collé', pages: [] };
const options = { setId: 'set-1', level: 'B1' as const, createdAt: 1_700_000_000_000 };

function sequentialIds() {
  let n = 0;
  return () => `id${++n}`;
}

test('a draft with null answers, blockers and no questions is valid', () => {
  const draft = ImportDraftSchema.parse(draftFixture);
  expect(draft.units[0].items[0].expectedAnswer).toBeNull();
  const blocked = ImportDraftSchema.parse({
    ...draftFixture,
    units: [{ ...draftFixture.units[0], items: [{ ...draftFixture.units[0].items[0], blockers: ['Missing audio'] }] }],
  });
  expect(blocked.units[0].items[0].blockers).toEqual(['Missing audio']);
  const empty = ImportDraftSchema.parse({ ...draftFixture, units: [{ ...draftFixture.units[0], items: [] }] });
  expect(empty.units[0].items).toEqual([]);
  expect(ImportDraftSchema.parse({ units: [] }).units).toEqual([]);
});

test('confirmed AI answers keep their provenance and never persist original files or model metadata', () => {
  const draft = ImportDraftSchema.parse({
    ...draftFixture,
    units: [
      {
        ...draftFixture.units[0],
        sourceImage: 'data:image/png;base64,SECRET',
        items: [{ ...draftFixture.units[0].items[0], expectedAnswer: 'étudiant', meta: { image: 'SECRET' } }],
      },
    ],
  });
  const source: ImportSource = { kind: 'pdf', name: 'mes-exercices.pdf', pages: [2, 3] };
  const result = prepareImport(draft, source, 'complete', options);
  expect(result.errors).toEqual([]);
  expect(result.units[0].items[0].answerSource).toBe('ai');
  expect(result.units[0]).toMatchObject({
    setId: 'set-1',
    setTitle: 'Mon document',
    level: 'B1',
    createdAt: options.createdAt,
  });
  expect(result.units[0].importSource).toEqual({ ...source, mode: 'complete' });
  expect(JSON.stringify(result)).not.toContain('SECRET');

  const item = draft.units[0].items[0];
  item.printedAnswer = 'étudiant';
  expect(prepareImport(draft, source, 'complete', options).units[0].items[0].answerSource).toBe('material');
  const edited = new Set([answerKey(draft.units[0].id, item.id)]);
  expect(
    prepareImport(draft, source, 'complete', { ...options, editedAnswers: edited }).units[0].items[0].answerSource,
  ).toBe('user');
});

test('promotion generates fresh ids and leaves the draft untouched', () => {
  const draft = ImportDraftSchema.parse(draftFixture);
  draft.units[0].items[0].expectedAnswer = 'étudiant';
  const before = structuredClone(draft);
  const first = prepareImport(draft, textSource, 'complete', { ...options, makeId: sequentialIds() });
  expect(first.units[0].id).toBe('unit-id1');
  expect(first.units[0].items[0].id).toBe('item-id2');
  expect(first.units[0].id).not.toBe(draft.units[0].id);
  expect(draft).toEqual(before);

  const a = prepareImport(draft, textSource, 'complete', options).units[0];
  const b = prepareImport(draft, textSource, 'complete', options).units[0];
  expect(a.id).not.toBe(b.id);
  expect(a.items[0].id).not.toBe(b.items[0].id);
});

test('extract-only keeps printed answers but discards inferred answers', () => {
  const input = ImportDraftSchema.parse(draftFixture);
  input.units[0].items[0].expectedAnswer = 'étudiant';
  expect(parseImportDraft(input, 'extract').units[0].items[0].expectedAnswer).toBeNull();
  const printed = ImportDraftSchema.parse(input);
  printed.units[0].items[0].printedAnswer = 'élève';
  expect(parseImportDraft(printed, 'extract').units[0].items[0].expectedAnswer).toBe('élève');
  printed.units[0].items[0].blockers = ['Missing audio'];
  const blocked = parseImportDraft(printed, 'complete');
  expect(blocked.units[0].items[0].expectedAnswer).toBeNull();
  const result = prepareImport(blocked, { kind: 'image', name: 'a.png', pages: [] }, 'complete', options);
  expect(result.units).toEqual([]);
  expect(result.errors.map((e) => e.code)).toEqual(['blocked']);
});

test('generated exercise answers are never presented as printed original answers', () => {
  const input = ImportDraftSchema.parse(draftFixture);
  input.units[0].items[0].expectedAnswer = 'étudiant';
  input.units[0].items[0].printedAnswer = 'élève';
  const generated = parseImportDraft(input, 'generate');
  expect(generated.units[0].items[0].expectedAnswer).toBe('étudiant');
  expect(generated.units[0].items[0].printedAnswer).toBeNull();
  const result = prepareImport(generated, textSource, 'generate', options);
  expect(result.units[0].items[0].answerSource).toBe('ai');
  expect(result.units[0].importSource?.mode).toBe('generate');
});

test('draft acceptance never weakens the formal exercise validation', () => {
  const draft = ImportDraftSchema.parse(draftFixture);
  const item = draft.units[0].items[0];
  item.type = 'DIALOGUE_ORDER';
  item.options = ['a. Salut', 'b. Au revoir'];
  item.expectedAnswer = ['a', 'z'];
  const result = prepareImport(draft, textSource, 'complete', options);
  expect(result.units).toEqual([]);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].code).toBe('invalid');
  expect(result.errors[0].issues.join(' ')).toContain('Dialogue answer');
});

test('an incomplete draft is valid but cannot become a playable unit', () => {
  const draft = ImportDraftSchema.parse(draftFixture);
  const result = prepareImport(draft, textSource, 'complete', options);
  expect(result.units).toEqual([]);
  expect(result.errors).toEqual([
    { unitId: draft.units[0].id, unitTitle: draft.units[0].title, code: 'missing-answer', issues: [] },
  ]);
});

test('a unit without questions is reported, and other units still promote', () => {
  const ready = structuredClone(draftFixture.units[0]);
  const draft = ImportDraftSchema.parse({
    ...draftFixture,
    units: [
      { ...draftFixture.units[0], id: 'empty', items: [] },
      { ...ready, id: 'ready', items: [{ ...ready.items[0], expectedAnswer: 'étudiant' }] },
    ],
  });
  const result = prepareImport(draft, textSource, 'complete', options);
  expect(result.errors.map((e) => [e.unitId, e.code])).toEqual([['empty', 'no-items']]);
  expect(result.units).toHaveLength(1);
});

test('model output omitting draft-only fields is normalized instead of rejected', () => {
  const sparse = {
    units: [
      {
        id: 'u1',
        section: 'GRAMMAIRE',
        unitNumber: 1,
        title: 'Exercices',
        instruction: 'Write the masculine form.',
        type: 'WORD_TRANSFORM',
        grammarTags: ['gender-number'],
        items: [{ id: 'i1', itemNumber: 1, prompt: 'femme', expectedAnswer: 'mari', grammarTag: 'gender-number' }],
      },
    ],
  };
  const draft = ImportDraftSchema.parse(sparse);
  expect(draft.warnings).toEqual([]);
  expect(draft.materialTitle).toBeUndefined();
  expect(draft.units[0].items[0].printedAnswer).toBeNull();
  expect(draft.units[0].items[0].blockers).toEqual([]);
  expect(parseImportDraft(sparse, 'complete').units[0].items[0].expectedAnswer).toBe('mari');

  // A title that is present must be a real one; nothing is invented when it is absent.
  for (const invalidTitle of [42, null, '', '   '])
    expect(ImportDraftSchema.safeParse({ ...sparse, materialTitle: invalidTitle }).success).toBe(false);
});

test('duplicate ids and unknown grammar tags are rejected in a draft', () => {
  const unit = draftFixture.units[0];
  expect(ImportDraftSchema.safeParse({ units: [unit, unit] }).success).toBe(false);
  expect(ImportDraftSchema.safeParse({ units: [{ ...unit, items: [unit.items[0], unit.items[0]] }] }).success).toBe(
    false,
  );
  expect(
    ImportDraftSchema.safeParse({ units: [{ ...unit, items: [{ ...unit.items[0], grammarTag: 'gender-agreement' }] }] })
      .success,
  ).toBe(false);
});

test('answer helpers', () => {
  expect(answerText(null)).toBe('');
  expect(answerText('a')).toBe('a');
  expect(answerText(['a', 'b'])).toBe('a / b');
  expect(answerKey('u', 'i')).toBe('["u","i"]');
  const item = ImportDraftSchema.parse(draftFixture).units[0].items[0];
  expect(answerOrigin(item)).toBe('ai');
  expect(answerOrigin({ ...item, printedAnswer: ['a'], expectedAnswer: ['a'] })).toBe('material');
  expect(answerOrigin({ ...item, printedAnswer: ['a'], expectedAnswer: ['b'] })).toBe('ai');
  expect(answerOrigin(item, true)).toBe('user');
});

test('review must supply reading and dictation context before promotion', () => {
  const draft = ImportDraftSchema.parse(draftFixture);
  const item = draft.units[0].items[0];
  item.expectedAnswer = 'douze';
  item.type = 'NUMBER_DICTATION';
  expect(prepareImport(draft, textSource, 'complete', options).errors[0].code).toBe('invalid');
  item.audioText = 'douze';
  expect(prepareImport(draft, textSource, 'complete', options).errors).toEqual([]);
  item.type = 'READING_CLOZE';
  item.prompt = 'Le nombre est [___].';
  expect(prepareImport(draft, textSource, 'complete', options).errors[0].code).toBe('invalid');
  draft.units[0].readingPassage = { content: 'Le nombre est douze.' };
  expect(prepareImport(draft, textSource, 'complete', options).errors).toEqual([]);
});
