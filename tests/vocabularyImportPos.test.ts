/** Owner decision: a trailing part-of-speech tag leaves the imported front and leads the back. */
import { expect, test } from 'bun:test';
import { parsePlainText } from '../src/services/vocabulary/import/plainText';
import type { ImportColumns, ImportedNote } from '../src/services/vocabulary/import/prepare';
import { prepareVocabularyImport, splitPartOfSpeech } from '../src/services/vocabulary/import/prepare';
import { vocabularyKey } from '../src/services/vocabulary/identity';

const now = new Date(2026, 9, 25, 12).getTime();
const columns: ImportColumns = { front: 0, back: 1, example: null };
const prepare = (lines: string[], chosen: ImportColumns = columns) =>
  prepareVocabularyImport(parsePlainText(lines.join('\n')), chosen, 'TEST deck', 'zh', now);
const imported = (note: ImportedNote) => {
  const { definition } = note.context;
  if (definition.kind !== 'imported') throw new Error(`Expected an imported definition, got ${definition.kind}`);
  return definition;
};

test('a trailing tag group splits off the front, dot groups and " / " groups kept verbatim', () => {
  for (const pos of [
    'n.m.',
    'n.f.',
    'n.',
    'n.f.inv.',
    'v.pr.',
    'v.t.dir.',
    'prép.',
    'loc.adv.',
    'pron.dém.',
    'adj.interr.',
    'interj.',
    'adj. / n. / n.m.',
    'v.i. / v.t.dir.',
  ])
    expect(splitPartOfSpeech(`femme ${pos}`)).toEqual({ word: 'femme', pos });
  expect(splitPartOfSpeech('femme n.f.')).toEqual({ word: 'femme', pos: 'n.f.' });
});

test('every member of the closed tag set splits alone', () => {
  for (const member of [
    'n',
    'm',
    'f',
    'v',
    't',
    'i',
    'pr',
    'dir',
    'adj',
    'adv',
    'prép',
    'conj',
    'interj',
    'loc',
    'pron',
    'pers',
    'dém',
    'interr',
    'poss',
    'inv',
  ])
    expect(splitPartOfSpeech(`mot ${member}.`)).toEqual({ word: 'mot', pos: `${member}.` });
});

test('a bare tag, a middle tag, a foreign part, a missing dot, capitals and no space stay on the front', () => {
  for (const front of ['n.m.', 'chat n.m. suite', 'chat n.x.', 'chat n.m', 'chat N.M.', 'xn.m.'])
    expect(splitPartOfSpeech(front)).toEqual({ word: front });
  // Bracketed pronunciation is not parsed, so only the tag moves.
  expect(splitPartOfSpeech('club [klœb] n.m.')).toEqual({ word: 'club [klœb]', pos: 'n.m.' });
});

test('the owner file imports with each tag moved to the back and every word still matching its key', () => {
  const batch = prepare([
    '#tags column:3',
    "appeler(s') v.pr.\t名叫\tL1",
    'bienvenue n.f.\t欢迎\tL1',
    'français(e) adj. / n. / n.m.\t法国的；法国人；法语\tL1 L2',
    'club [klœb] n.m.\t〈英〉俱乐部，会，社\tL1',
    'bonjour\t你好\tL1',
  ]);
  expect(batch.rejected).toEqual([]);
  const words = ['appeler(s’)', 'bienvenue', 'français(e)', 'club [klœb]', 'bonjour'];
  expect(batch.notes.map((note) => note.word)).toEqual(words);
  expect(batch.notes.map((note) => imported(note).front)).toEqual(words);
  expect(batch.notes.map((note) => imported(note).back)).toEqual([
    'v.pr. 名叫',
    'n.f. 欢迎',
    'adj. / n. / n.m. 法国的；法国人；法语',
    'n.m. 〈英〉俱乐部，会，社',
    '你好',
  ]);
  for (const note of batch.notes) expect(vocabularyKey(imported(note).front)).toBe(vocabularyKey(note.word));
  expect(batch.notes[4].context.id).toBe(JSON.stringify(['import', 'TEST deck', '6']));
});

test('an example column is untouched by the split', () => {
  const batch = prepare(['#tags column:4', "appeler(s') v.pr.\t名叫\tOn appelle le chat.\tL1"], {
    ...columns,
    example: 2,
  });
  expect(batch.rejected).toEqual([]);
  const note = batch.notes[0];
  expect(note.word).toBe('appeler(s’)');
  expect(imported(note).front).toBe('appeler(s’)');
  expect(imported(note).back).toBe('v.pr. 名叫');
  expect(imported(note).example).toBe('On appelle le chat.');
  expect(note.context.sentence).toBe('On appelle le chat.');
  expect(imported(note).tags).toEqual(['L1']);
});

test('two rows with the same headword and different tags both import', () => {
  const batch = prepare(['livre n.m.\t书', 'livre n.f.\t书']);
  expect(batch.rejected).toEqual([]);
  expect(batch.notes).toHaveLength(2);
  expect(batch.notes.map((note) => note.word)).toEqual(['livre', 'livre']);
  expect(batch.notes.map((note) => imported(note).back)).toEqual(['n.m. 书', 'n.f. 书']);
  expect(new Set(batch.notes.map((note) => note.context.id)).size).toBe(2);
});

test('an empty back stays empty: the tag is not left alone on the back and the row is refused', () => {
  const batch = prepare(["appeler(s') v.pr.\t"]);
  // The tag only leads a real back; with no back the row is refused rather than imported as `v.pr.`.
  expect(batch.notes).toEqual([]);
  expect(batch.rejected).toEqual([
    { row: 1, reason: { key: 'vocab.import.errors.invalidFields', params: { fields: 'definition.back' } } },
  ]);
});

test('a row whose back exists still gets the tag in front of it', () => {
  const batch = prepare(["appeler(s') v.pr.\t名叫", "appeler(s') v.pr.\t"]);
  expect(batch.rejected).toEqual([
    { row: 2, reason: { key: 'vocab.import.errors.invalidFields', params: { fields: 'definition.back' } } },
  ]);
  expect(batch.notes).toHaveLength(1);
  expect(imported(batch.notes[0]).front).toBe('appeler(s’)');
  expect(imported(batch.notes[0]).back).toBe('v.pr. 名叫');
});
