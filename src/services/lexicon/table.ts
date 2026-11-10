/** Dictionary simple-tense display cells; keeps the input bare for matching and never guesses h elision. */
import {
  FINITE_PERSONS,
  isPronominalInfinitive,
  type Cell,
  type ImperativePerson,
  type Person,
} from '../../types/grammarPack';
import { LEXICON_TENSES, type VerbData } from '../../types/lexicon';
import { bareInfinitive, withClitic } from '../conjugation/assemble';
import { engineInfinitive } from '../conjugation/infinitive';
import { composeLead } from '../conjugation/rules';

export function lexiconTable(lemma: string, data: VerbData) {
  const infinitive = engineInfinitive(lemma);
  const pronominal = isPronominalInfinitive(infinitive);
  // Morphalou has no aspirated-h flag: leave these verbs to the Conjugation page.
  if (pronominal && bareInfinitive(infinitive).startsWith('h')) return undefined;
  const tenses: Partial<Record<(typeof LEXICON_TENSES)[number], Partial<Record<Person, Cell>>>> = {};
  for (const tense of LEXICON_TENSES) {
    const source: Partial<Record<Person, string[]>> | undefined = data.tenses[tense];
    if (!source) continue;
    const cells: Partial<Record<Person, Cell>> = {};
    for (const person of FINITE_PERSONS) {
      const forms = source[person];
      if (!forms) continue;
      cells[person] = {
        lead: pronominal ? composeLead(tense, person, { pronominal }, forms[0]) : '',
        forms: tense === 'imperatif' ? withClitic(pronominal, person as ImperativePerson, forms) : forms,
      };
    }
    tenses[tense] = cells;
  }
  return { pronominal, tenses };
}
