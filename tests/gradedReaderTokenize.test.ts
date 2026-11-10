/** Invented TEST spellings only; tokenizer goldens are not linguistic approval. */
import { expect, test } from 'bun:test';
import { tokenize, targetInventory } from '../scripts/graded-readers/tokenize';
import { gradedReaderFixture } from './fixtures/gradedReaders';

const policy = { compounds: ['peut-être', 'aujourd’hui'] };
for (const [source, readings] of [
  ['l’école', [['le', 'la'], ['école']]],
  ['j’aime', [['je'], ['aime']]],
  ['qu’il', [['que'], ['il']]],
  ['d’eau', [['de'], ['eau']]],
  ['n’est', [['ne'], ['est']]],
  ['s’appelle', [['se', 'si'], ['appelle']]],
  ['c’est', [['ce'], ['est']]],
  ['m’appelle', [['me'], ['appelle']]],
  ['t’appelles', [['te'], ['appelles']]],
  ['s’il', [['si'], ['il']]],
  ['s’ils', [['si'], ['ils']]],
  ['est-ce', [['est'], ['ce']]],
  ['peut-être', [['peut-être']]],
  ['parle-t-il', [['parle'], ['il']]],
  ['parlez-vous', [['parlez'], ['vous']]],
  ['lève-toi', [['lève'], ['toi']]],
  ['qu’aujourd’hui', [['que'], ['aujourd’hui']]],
] as const) {
  test(`G1 TEST golden ${source}`, () => {
    const result = tokenize({ id: 'test-target', text: source }, policy, 'test-reader');
    expect(result.diagnostics).toEqual([]);
    expect(result.atoms.map((atom) => atom.readings)).toEqual(readings.map((reading) => [...reading]));
    expect(result.words[0].text).toBe(source);
    expect(result.atoms.map((atom) => atom.id)).toEqual(readings.map((_, part) => `test-target:0:${part}`));
    for (const atom of result.atoms) expect(source.slice(atom.start, atom.end)).toBe(atom.spelling);
    expect(tokenize({ id: 'test-target', text: `${source}#` }, policy).diagnostics.length).toBeGreaterThan(0);
  });
}
for (const source of [
  'un 1',
  'un １２',
  'un €',
  'un +',
  'un /',
  'un 😀',
  'un–livre',
  'un—livre',
  'un‑livre',
  "l'école",
  'l‘école',
  'l`école',
  'un -',
  'un ’',
  '’un',
  '-un',
  'arc-en-ciel',
  'donne-le',
  'vingt-deux',
  'z’école',
  'qu’aujourd’hui',
  'e\u0301cole',
  'un…',
  'un:',
]) {
  test(`G1 rejects unsupported TEST source ${JSON.stringify(source)}`, () => {
    expect(tokenize({ id: 'test', text: source }).diagnostics.length).toBeGreaterThan(0);
  });
}
test('G1 punctuation, spans, casing and nonlexical liaison are preserved', () => {
  const text = '« L’école, parle-t-il ? »';
  const result = tokenize({ id: 's1', text }, policy);
  expect(result.diagnostics).toEqual([]);
  expect(result.words.map(({ start, end }) => text.slice(start, end))).toEqual(['L’école', 'parle-t-il']);
  expect(result.words[1].liaison).toBe(true);
  expect(result.atoms).toHaveLength(4);
  expect(result.atoms[0].spelling).toBe('L’');
});
test('G0 derives every target including distractors and acceptable answers, never feedback prose', () => {
  const body = gradedReaderFixture();
  body.learning.checkpoints[0].questions[1].question.acceptableAnswers = ['livre'];
  const targets = targetInventory(body);
  expect(targets.map((target) => target.id)).toEqual([
    'title',
    's1',
    's2',
    's3',
    'q-recognize-book-scaffold',
    'q-recognize-book-option-0',
    'q-recognize-book-option-1',
    'q-recognize-book-answer-0',
    'q-type-size-scaffold',
    'q-type-size-answer-0',
    'q-type-size-answer-1',
  ]);
  expect(targets.find((target) => target.id === 'q-recognize-book-scaffold')?.text).toBe('C’est .');
  expect(targets.find((target) => target.id === 'q-type-size-scaffold')?.completed).toBe('Le livre est petit.');
});
