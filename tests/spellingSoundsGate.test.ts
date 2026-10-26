/** Owns fixture-only spelling gates and counterexamples; not language review or real content. */
import { expect, test } from 'bun:test';
import { checkPatterns, type PatternNotes } from '../scripts/spelling-sounds/build';
import type { SpellingSoundPattern } from '../src/types/spellingSounds';
import { spellingInputs } from './fixtures/spellingSounds';

function gate(rows: SpellingSoundPattern[]) {
  const notes: PatternNotes = { en: {}, zh: {} };
  for (const row of rows) notes.en[row.id] = notes.zh[row.id] = 'TEST ONLY';
  return checkPatterns(rows, notes);
}
const nasal = (): SpellingSoundPattern => ({
  id: 'on',
  spelling: 'on',
  group: 'nasals',
  sound: ['ɔ̃'],
  examples: ['bon', 'pont', 'long'],
});

test('valid fixtures pass; duplicate ids and duplicate words fail independently', () => {
  const { source, notes } = spellingInputs();
  expect(checkPatterns(source.patterns, notes)).toEqual([]);
  const duplicate = { ...source.patterns[0], examples: ['tout', 'fou', 'roue'] };
  expect(gate([...source.patterns, duplicate])).toContain('ou: duplicate pattern id');
  const equalSound = { ...source.patterns[0], id: 'second', examples: ['vous', 'tout', 'fou'] };
  expect(gate([...source.patterns, equalSound])).toContain('second: vous: duplicate example across the pack');
});

test('each example must contain its own spelling', () => {
  const row = spellingInputs().source.patterns[0];
  expect(gate([row])).toEqual([]);
  row.examples[1] = 'chat';
  expect(gate([row])).toContain('ou: chat: must contain spelling ou');
});

test('other non-silent spellings with different arrays fail; equal arrays and silent spellings are allowed', () => {
  const eau: SpellingSoundPattern = {
    id: 'eau',
    spelling: 'eau',
    group: 'vowels',
    sound: ['o'],
    examples: ['beau', 'peau', 'eau'],
  };
  const au: SpellingSoundPattern = {
    id: 'au',
    spelling: 'au',
    group: 'vowels',
    sound: ['o'],
    examples: ['aussi', 'autre', 'jaune'],
  };
  expect(gate([eau, au])).toEqual([]);
  au.sound = ['ɔ'];
  expect(gate([eau, au]).join('\n')).toContain('eau: beau: contains different-sound spelling au');
  const oi: SpellingSoundPattern = {
    id: 'oi',
    spelling: 'oi',
    group: 'vowels',
    sound: ['w', 'a'],
    examples: ['roi', 'loi', 'oiseau'],
  };
  expect(gate([eau, oi]).join('\n')).toContain('oi: oiseau: contains different-sound spelling eau');
  // The comparison is of complete ordered arrays, not their first symbol or their set.
  const second = { ...au, spelling: 'au', sound: ['o', 'w'] };
  expect(gate([eau, second]).join('\n')).toContain('different-sound spelling au');
  second.sound = ['a', 'w'];
  oi.sound = ['w', 'a'];
  expect(gate([oi, second]).join('\n')).toContain('different-sound spelling au');
  const silent: SpellingSoundPattern = {
    id: 'h',
    spelling: 'h',
    group: 'silent',
    sound: [],
    examples: ['haut', 'huit', 'hier'],
  };
  expect(gate([spellingInputs().source.patterns[1], silent])).toEqual([]);
});

test('equal nasal arrays permit in inside ain', () => {
  const row = { ...nasal(), id: 'in', spelling: 'in', sound: ['ɛ̃'], examples: ['vin', 'fin', 'matin'] };
  const ain = { ...row, id: 'ain', spelling: 'ain', examples: ['pain', 'bain', 'main'] };
  expect(gate([row, ain])).toEqual([]);
});

test('nasals allow word end or consonants except n/m, checking every occurrence', () => {
  expect(gate([nasal()])).toEqual([]);
  for (const word of ['bonne', 'pommeonm', 'ona', 'oné', 'ony', 'on-on', 'on’on', 'onbonna']) {
    const row = nasal();
    row.examples[0] = word;
    expect(gate([row]).join('\n')).toContain(
      'nasal spelling must end the word or precede a consonant other than n or m',
    );
  }
  const ain = { ...nasal(), id: 'ain', spelling: 'ain', sound: ['ɛ̃'], examples: ['pain', 'bain', 'semaine'] };
  expect(gate([ain]).join('\n')).toContain('ain: semaine: nasal spelling');
});

test('oi cannot precede n, including later occurrences', () => {
  const row: SpellingSoundPattern = {
    id: 'oi',
    spelling: 'oi',
    group: 'vowels',
    sound: ['w', 'a'],
    examples: ['roi', 'loi', 'fois'],
  };
  expect(gate([row])).toEqual([]);
  for (const word of ['loin', 'roiloin']) {
    row.examples[0] = word;
    expect(gate([row])).toContain(`oi: ${word}: oi must not be followed by n`);
  }
});

test('silent spelling must start every word', () => {
  const row: SpellingSoundPattern = {
    id: 'h',
    spelling: 'h',
    group: 'silent',
    sound: [],
    examples: ['haut', 'huit', 'hier'],
  };
  expect(gate([row])).toEqual([]);
  row.examples[0] = 'ah';
  expect(gate([row])).toContain('h: ah: silent spelling must start the word');
});

test('both locale notes must exist and not be blank', () => {
  for (const language of ['en', 'zh'] as const) {
    for (const missing of [undefined, '', ' \t ']) {
      const { source, notes } = spellingInputs();
      expect(checkPatterns(source.patterns, notes)).toEqual([]);
      if (missing === undefined) delete notes[language].ou;
      else notes[language].ou = missing;
      expect(checkPatterns(source.patterns, notes)).toEqual([`${language}: missing or blank spellingSounds.notes.ou`]);
    }
  }
});
