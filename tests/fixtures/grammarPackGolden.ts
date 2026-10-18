/**
 * Hand-typed golden tables of the four control verbs (être, aller, avoir,
 * s’appeler), all seven tenses and the participles. Typed by hand, never
 * generated: the leads are literal strings too, so a bug common to the
 * generator and the checks cannot hide here. `rows` only reshapes tuples
 * `[lead, ...forms]` into cells. The reference they were typed from is named
 * in the review record (P2); until then they are the author's own, flagged
 * for the language reviewer.
 */
import type { Cell, ImperativePerson, Person, Verb } from '../../src/types/grammarPack';

export type GoldenVerb = Omit<Verb, 'prov'>;
type Row = [lead: string, ...forms: string[]];

const PERSONS: Person[] = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
const IMPERATIVE: ImperativePerson[] = ['2sg', '1pl', '2pl'];

const cell = ([lead, ...forms]: Row): Cell => ({ lead, forms });
const rows = (r: [Row, Row, Row, Row, Row, Row]) =>
  Object.fromEntries(PERSONS.map((person, i) => [person, cell(r[i])])) as Record<Person, Cell>;
const imperatif = (r: [Row, Row, Row]) =>
  Object.fromEntries(IMPERATIVE.map((person, i) => [person, cell(r[i])])) as Record<ImperativePerson, Cell>;

export const GOLDEN: Record<string, GoldenVerb> = {
  etre: {
    id: 'etre',
    infinitive: 'être',
    pronominal: false,
    aux: 'avoir',
    rule: 'irregular',
    tenses: {
      present: rows([
        ['je', 'suis'],
        ['tu', 'es'],
        ['il/elle', 'est'],
        ['nous', 'sommes'],
        ['vous', 'êtes'],
        ['ils/elles', 'sont'],
      ]),
      passeCompose: rows([
        ['j’', 'ai été'],
        ['tu', 'as été'],
        ['il/elle', 'a été'],
        ['nous', 'avons été'],
        ['vous', 'avez été'],
        ['ils/elles', 'ont été'],
      ]),
      imparfait: rows([
        ['j’', 'étais'],
        ['tu', 'étais'],
        ['il/elle', 'était'],
        ['nous', 'étions'],
        ['vous', 'étiez'],
        ['ils/elles', 'étaient'],
      ]),
      futur: rows([
        ['je', 'serai'],
        ['tu', 'seras'],
        ['il/elle', 'sera'],
        ['nous', 'serons'],
        ['vous', 'serez'],
        ['ils/elles', 'seront'],
      ]),
      conditionnel: rows([
        ['je', 'serais'],
        ['tu', 'serais'],
        ['il/elle', 'serait'],
        ['nous', 'serions'],
        ['vous', 'seriez'],
        ['ils/elles', 'seraient'],
      ]),
      subjonctif: rows([
        ['que je', 'sois'],
        ['que tu', 'sois'],
        ['qu’il/elle', 'soit'],
        ['que nous', 'soyons'],
        ['que vous', 'soyez'],
        ['qu’ils/elles', 'soient'],
      ]),
      imperatif: imperatif([
        ['', 'sois'],
        ['', 'soyons'],
        ['', 'soyez'],
      ]),
    },
    participles: { present: 'étant', past: { ms: 'été', fs: 'été', mp: 'été', fp: 'été' } },
  },
  avoir: {
    id: 'avoir',
    infinitive: 'avoir',
    pronominal: false,
    aux: 'avoir',
    rule: 'irregular',
    tenses: {
      present: rows([
        ['j’', 'ai'],
        ['tu', 'as'],
        ['il/elle', 'a'],
        ['nous', 'avons'],
        ['vous', 'avez'],
        ['ils/elles', 'ont'],
      ]),
      passeCompose: rows([
        ['j’', 'ai eu'],
        ['tu', 'as eu'],
        ['il/elle', 'a eu'],
        ['nous', 'avons eu'],
        ['vous', 'avez eu'],
        ['ils/elles', 'ont eu'],
      ]),
      imparfait: rows([
        ['j’', 'avais'],
        ['tu', 'avais'],
        ['il/elle', 'avait'],
        ['nous', 'avions'],
        ['vous', 'aviez'],
        ['ils/elles', 'avaient'],
      ]),
      futur: rows([
        ['j’', 'aurai'],
        ['tu', 'auras'],
        ['il/elle', 'aura'],
        ['nous', 'aurons'],
        ['vous', 'aurez'],
        ['ils/elles', 'auront'],
      ]),
      conditionnel: rows([
        ['j’', 'aurais'],
        ['tu', 'aurais'],
        ['il/elle', 'aurait'],
        ['nous', 'aurions'],
        ['vous', 'auriez'],
        ['ils/elles', 'auraient'],
      ]),
      subjonctif: rows([
        ['que j’', 'aie'],
        ['que tu', 'aies'],
        ['qu’il/elle', 'ait'],
        ['que nous', 'ayons'],
        ['que vous', 'ayez'],
        ['qu’ils/elles', 'aient'],
      ]),
      imperatif: imperatif([
        ['', 'aie'],
        ['', 'ayons'],
        ['', 'ayez'],
      ]),
    },
    participles: { present: 'ayant', past: { ms: 'eu', fs: 'eue', mp: 'eus', fp: 'eues' } },
  },
  aller: {
    id: 'aller',
    infinitive: 'aller',
    pronominal: false,
    aux: 'etre',
    rule: 'irregular',
    tenses: {
      present: rows([
        ['je', 'vais'],
        ['tu', 'vas'],
        ['il/elle', 'va'],
        ['nous', 'allons'],
        ['vous', 'allez'],
        ['ils/elles', 'vont'],
      ]),
      passeCompose: rows([
        ['je', 'suis allé', 'suis allée'],
        ['tu', 'es allé', 'es allée'],
        ['il/elle', 'est allé', 'est allée'],
        ['nous', 'sommes allés', 'sommes allées'],
        ['vous', 'êtes allés', 'êtes allées'],
        ['ils/elles', 'sont allés', 'sont allées'],
      ]),
      imparfait: rows([
        ['j’', 'allais'],
        ['tu', 'allais'],
        ['il/elle', 'allait'],
        ['nous', 'allions'],
        ['vous', 'alliez'],
        ['ils/elles', 'allaient'],
      ]),
      futur: rows([
        ['j’', 'irai'],
        ['tu', 'iras'],
        ['il/elle', 'ira'],
        ['nous', 'irons'],
        ['vous', 'irez'],
        ['ils/elles', 'iront'],
      ]),
      conditionnel: rows([
        ['j’', 'irais'],
        ['tu', 'irais'],
        ['il/elle', 'irait'],
        ['nous', 'irions'],
        ['vous', 'iriez'],
        ['ils/elles', 'iraient'],
      ]),
      subjonctif: rows([
        ['que j’', 'aille'],
        ['que tu', 'ailles'],
        ['qu’il/elle', 'aille'],
        ['que nous', 'allions'],
        ['que vous', 'alliez'],
        ['qu’ils/elles', 'aillent'],
      ]),
      imperatif: imperatif([
        ['', 'va'],
        ['', 'allons'],
        ['', 'allez'],
      ]),
    },
    participles: { present: 'allant', past: { ms: 'allé', fs: 'allée', mp: 'allés', fp: 'allées' } },
  },
  's-appeler': {
    id: 's-appeler',
    infinitive: 's’appeler',
    pronominal: true,
    aux: 'etre',
    rule: 'er-eler-double',
    tenses: {
      present: rows([
        ['je m’', 'appelle'],
        ['tu t’', 'appelles'],
        ['il/elle s’', 'appelle'],
        ['nous nous', 'appelons'],
        ['vous vous', 'appelez'],
        ['ils/elles s’', 'appellent'],
      ]),
      passeCompose: rows([
        ['je me', 'suis appelé', 'suis appelée'],
        ['tu t’', 'es appelé', 'es appelée'],
        ['il/elle s’', 'est appelé', 'est appelée'],
        ['nous nous', 'sommes appelés', 'sommes appelées'],
        ['vous vous', 'êtes appelés', 'êtes appelées'],
        ['ils/elles se', 'sont appelés', 'sont appelées'],
      ]),
      imparfait: rows([
        ['je m’', 'appelais'],
        ['tu t’', 'appelais'],
        ['il/elle s’', 'appelait'],
        ['nous nous', 'appelions'],
        ['vous vous', 'appeliez'],
        ['ils/elles s’', 'appelaient'],
      ]),
      futur: rows([
        ['je m’', 'appellerai'],
        ['tu t’', 'appelleras'],
        ['il/elle s’', 'appellera'],
        ['nous nous', 'appellerons'],
        ['vous vous', 'appellerez'],
        ['ils/elles s’', 'appelleront'],
      ]),
      conditionnel: rows([
        ['je m’', 'appellerais'],
        ['tu t’', 'appellerais'],
        ['il/elle s’', 'appellerait'],
        ['nous nous', 'appellerions'],
        ['vous vous', 'appelleriez'],
        ['ils/elles s’', 'appelleraient'],
      ]),
      subjonctif: rows([
        ['que je m’', 'appelle'],
        ['que tu t’', 'appelles'],
        ['qu’il/elle s’', 'appelle'],
        ['que nous nous', 'appelions'],
        ['que vous vous', 'appeliez'],
        ['qu’ils/elles s’', 'appellent'],
      ]),
      imperatif: imperatif([
        ['', 'appelle-toi'],
        ['', 'appelons-nous'],
        ['', 'appelez-vous'],
      ]),
    },
    participles: { present: 'appelant', past: { ms: 'appelé', fs: 'appelée', mp: 'appelés', fp: 'appelées' } },
  },
};
