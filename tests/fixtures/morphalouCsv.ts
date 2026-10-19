/** Owns a tiny invented Morphalou CSV set in the real 18-column layout (lemmas marked TEST); not real data. */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type Form = [form: string, number: string, mode: string, gender: string, tense: string, person: string];
type Block = [lemma: string, category: string, gender: string, forms: Form[]];

const HEADER = [
  ...Array.from({ length: 14 }, (_, i) => `Invented fixture preamble ${i + 1}`),
  'LEMME;;;;;;;;;FLEXION;;;;;;;;',
  'GRAPHIE;ID;CATÉGORIE;SOUS CATÉGORIE;LOCUTION;GENRE;AUTRES LEMMES LIÉS;PHONÉTIQUE;ORIGINES;GRAPHIE;ID;NOMBRE;MODE;GENRE;TEMPS;PERSONNE;PHONÉTIQUE;ORIGINES',
];
const form = ([text, ...rest]: Form) => [text, '1', ...rest, '', 'fixture'].join(';');
// Only the first line of a block carries the lemma columns.
const lines = ([lemma, category, gender, forms]: Block) =>
  forms.map((f, i) => `${i ? ';;;;;;;;' : `${lemma};1;${category};;;${gender};;;fixture`};${form(f)}`);

const f = (text: string, number: string, mode: string, tense: string, person: string, gender = '-'): Form => [
  text,
  number,
  mode,
  gender,
  tense,
  person,
];
const ind = (text: string, tense: string, person: string, number: string) =>
  f(text, number, 'indicative', tense, person);
const participle = (text: string, number: string, gender: string, tense = 'past') =>
  f(text, number, 'participle', tense, '-', gender);
const word = (text: string, number: string, gender = '-') => f(text, number, '-', '-', '-', gender);

const VERBS: Block[] = [
  [
    'testmarcher',
    'Verbe',
    '-',
    [
      f('testmarcher', '-', 'infinitive', '-', '-'),
      ind('testmarche', 'present', 'firstPerson', 'singular'),
      ind('testmarche2', 'present', 'firstPerson', 'singular'),
      ind('testmarches', 'present', 'secondPerson', 'singular'),
      ind('testmarche', 'present', 'thirdPerson', 'singular'),
      ind('testmarchons', 'present', 'firstPerson', 'plural'),
      ind('testmarchez', 'present', 'secondPerson', 'plural'),
      ind('testmarchent', 'present', 'thirdPerson', 'plural'),
      ind('testmarchais', 'imperfect', 'firstPerson', 'singular'),
      ind('testmarcherai', 'future', 'firstPerson', 'singular'),
      f('testmarcherais', 'singular', 'conditional', 'present', 'firstPerson'),
      f('testmarchesub', 'singular', 'subjunctive', 'present', 'firstPerson'),
      f('testmarche', 'singular', 'imperative', 'present', 'secondPerson'),
      f('testmarchons', 'plural', 'imperative', 'present', 'firstPerson'),
      f('testmarchez', 'plural', 'imperative', 'present', 'secondPerson'),
      // Tenses the app does not have must not reach the data or the form index.
      ind('testmarchai', 'simplePast', 'firstPerson', 'singular'),
      f('testmarchasse', 'singular', 'subjunctive', 'imperfect', 'firstPerson'),
      participle('testmarchant', '-', '-', 'present'),
      participle('testmarché', 'singular', 'masculine'),
      participle('testmarchée', 'singular', 'feminine'),
      participle('testmarchés', 'plural', 'masculine'),
      participle('testmarchées', 'plural', 'feminine'),
    ],
  ],
  // A second block of the same lemma adds a variant instead of replacing the first.
  ['testmarcher', 'Verbe', '-', [ind('testmarcheb', 'present', 'firstPerson', 'singular')]],
  // Decomposed accents (NFD) in the lemma and the forms; an invariable participle fills all four agreements.
  [
    'testirrégulier',
    'Verbe',
    '-',
    [ind('testvá', 'present', 'thirdPerson', 'singular'), participle('testallé', 'invariable', 'invariable')],
  ],
  [
    'se testlaver',
    'Verbe',
    '-',
    [f('testlaver', '-', 'infinitive', '-', '-'), ind('testlave', 'present', 'firstPerson', 'singular')],
  ],
  // This infinitive is listed with its pronoun (a space), which is not a word form.
  [
    'se testgominer',
    'Verbe',
    '-',
    [f('se testgominer', '-', 'infinitive', '-', '-'), ind('testgomine', 'present', 'firstPerson', 'singular')],
  ],
  ['test rock and roller', 'Verbe', '-', [ind('testrocke', 'present', 'firstPerson', 'singular')]],
  ['testnonlisted', 'Verbe', '-', [ind('testnonlistes', 'present', 'firstPerson', 'singular')]],
];

const NOUNS: Block[] = [
  ['testmaison', 'Nom commun', 'feminine', [word('testmaison', 'singular'), word('testmaisons', 'plural')]],
  // Uppercase in a form of a lowercase lemma: the lookup key is lowercase, the stored form is as Morphalou has it.
  ['testsigle', 'Nom commun', 'masculine', [word('Testsigle', 'singular'), word('testsigles', 'plural')]],
  ['testinvar', 'Nom commun', 'invariable', [word('testinvar', 'invariable')]],
  ['testangle', 'Nom commun', 'masculine', [word('testangle', 'singular')]],
  // A capitalised lemma (a gentilé) is not merged into the common noun.
  ['Testangle', 'Nom commun', 'feminine', [word('Testangle', 'singular')]],
  ['test ad libitum', 'Nom commun', 'masculine', [word('test ad libitum', 'invariable')]],
  // The one entity in the real file: `&amp;` carries a semicolon inside a cell.
  ['testamp', 'Nom commun', 'masculine', [word('test&amp;x', 'singular')]],
  ['testambigu', 'Nom commun', 'masculine', [word('testambigu', 'singular')]],
  ['testambigu', 'Nom commun', 'feminine', [word('testambigue', 'singular')]],
  ['testnogender', 'Nom commun', '-', [word('testnogender', 'singular')]],
];

const ADJECTIVES: Block[] = [
  [
    'testbeau',
    'Adjectif qualificatif',
    '-',
    [
      word('testbeau', 'singular', 'masculine'),
      word('testbelle', 'singular', 'feminine'),
      word('testbeaux', 'plural', 'masculine'),
      word('testbelles', 'plural', 'feminine'),
    ],
  ],
  [
    'testrouge',
    'Adjectif qualificatif',
    '-',
    [word('testrouge', 'singular', 'invariable'), word('testrouges', 'plural', 'invariable')],
  ],
  ['testchic', 'Adjectif qualificatif', '-', [word('testchic', 'invariable', 'invariable')]],
  ['test à priori', 'Adjectif qualificatif', '-', [word('test à priori', 'invariable', 'invariable')]],
];

export const ALLOWLIST = [
  'verb:testmarcher',
  'verb:testirrégulier'.normalize('NFC'),
  'verb:se testlaver',
  'verb:se testgominer',
  'noun:testmaison',
  'noun:testsigle',
  'noun:testinvar',
  'noun:testangle',
  'noun:testamp',
  'noun:testambigu',
  'noun:testnogender',
  'adjective:testbeau',
  'adjective:testrouge',
  'adjective:testchic',
]
  .sort()
  .join('\n');

/** Writes the three CSV files under `dir`; `reverse` lists the blocks backwards (same data, other file order). */
export async function writeMorphalouFixture(dir: string, reverse = false, extra = '') {
  await mkdir(dir, { recursive: true });
  const files: [string, Block[]][] = [
    ['verb_Morphalou3.1_CSV.csv', VERBS],
    ['commonNoun_Morphalou3.1_CSV.csv', NOUNS],
    ['adjective_Morphalou3.1_CSV.csv', ADJECTIVES],
  ];
  for (const [name, blocks] of files) {
    const ordered = reverse ? [...blocks].reverse() : blocks;
    // The real files use CRLF.
    await Bun.write(join(dir, name), [...HEADER, ...ordered.flatMap(lines)].join('\r\n') + '\r\n' + extra);
  }
}
