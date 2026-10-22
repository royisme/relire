/** Section examples survive the import merge, schema validation and promotion without duplication. */
import { expect, test } from 'bun:test';
import { ImportDraftSchema, parseImportDraft, prepareImport } from '../src/services/exercises/importDraft';
import { ExerciseUnitSchema } from '../src/types/exercises';
import { worksheetDraftFixture } from './fixtures/importDraft';

const source = { kind: 'text' as const, name: 'TEST worksheet', pages: [] };
const options = { setId: 'TEST-set', level: 'B1' as const, createdAt: 1_700_000_000_000 };

function sections(examples: ReadonlyArray<string | undefined>) {
  return {
    ...worksheetDraftFixture,
    units: examples.map((example, index) => ({ ...worksheetDraftFixture.units[index], example })),
  };
}

test('different examples stay in source order and survive validation and promotion', () => {
  const draft = parseImportDraft(sections(['Marie est étudiante.', 'Paul a vingt ans.']), 'complete');
  expect(draft.units).toHaveLength(1);
  expect(draft.units[0].example).toBe('Marie est étudiante.\nPaul a vingt ans.');
  expect(ImportDraftSchema.safeParse(draft).success).toBe(true);
  const promoted = prepareImport(draft, source, 'complete', options);
  expect(promoted.errors).toEqual([]);
  expect(promoted.units).toHaveLength(1);
  expect(promoted.units[0].example).toBe(draft.units[0].example);
  expect(promoted.units[0].items).toHaveLength(3);
  expect(ExerciseUnitSchema.safeParse(promoted.units[0]).success).toBe(true);
});

test('identical examples are not repeated, even after a different example', () => {
  expect(parseImportDraft(sections(['Paul a vingt ans.', 'Paul a vingt ans.']), 'complete').units[0].example).toBe(
    'Paul a vingt ans.',
  );
  const draft = parseImportDraft(
    sections(['Marie est étudiante.', 'Paul a vingt ans.', 'Marie est étudiante.']),
    'complete',
  );
  expect(draft.units[0].example).toBe('Marie est étudiante.\nPaul a vingt ans.');
});

test.each([
  { examples: [undefined, 'Paul a vingt ans.'] },
  { examples: ['Paul a vingt ans.', undefined] },
  { examples: [undefined, 'Paul a vingt ans.', undefined] },
])('a section with no example contributes nothing (%j)', ({ examples }) => {
  const draft = parseImportDraft(sections(examples), 'complete');
  expect(draft.units[0].example).toBe('Paul a vingt ans.');
});

test('merging sections without examples keeps the example absent', () => {
  const draft = parseImportDraft(sections([undefined, undefined]), 'complete');
  expect(draft.units[0].example).toBeUndefined();
});

test('a single section keeps its example and every other field unchanged', () => {
  const input = sections(['Marie est étudiante.\nPaul a vingt ans.']);
  expect(parseImportDraft(input, 'complete')).toEqual(ImportDraftSchema.parse(input));
});
