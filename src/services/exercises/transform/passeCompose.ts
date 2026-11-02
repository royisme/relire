/**
 * `passe-compose`: present regular -er verbs, avoir and être rewritten with avoir, computed by rule.
 * Negation, clitics needing agreement and être-auxiliary verbs are skipped, never guessed.
 * No AI, no key, no IO; forms and participles come from the conjugation data and rules.
 */
import irregulars from '../../../../data/grammar-pack/irregulars.json';
import type { ReaderGlossaryEntry, Sentence } from '../../../types/gradedReader';
import { FINITE_PERSONS, isPronominalInfinitive } from '../../../types/grammarPack';
import { AUXILIARY_FORMS, REGULAR_RULES, pastParticiples } from '../../conjugation/rules';
import { cliticOf, entriesOf, verbOf } from './words';

/** Even a transitive use of these verbs is outside this avoir-only rule. */
const ETRE_VERBS = [
  'aller',
  'venir',
  'arriver',
  'partir',
  'entrer',
  'sortir',
  'monter',
  'descendre',
  'rester',
  'tomber',
  'naître',
  'mourir',
  'retourner',
  'devenir',
  'revenir',
  'rentrer',
  'passer',
];

export function transformPasseCompose(sentence: Sentence, glossary: ReaderGlossaryEntry[]): { answer: string } | null {
  if (/[?!]$/.test(sentence.fr)) return null;
  const verb = verbOf(sentence, glossary);
  if (!verb) return null;
  // Relative objects can need agreement; commas can introduce a vocative before an imperative.
  if (
    sentence.fr.slice(0, verb.word.start).includes(',') ||
    verb.words.some(
      (word, index) =>
        index < verb.index && (word.text.toLowerCase() === 'que' || word.prefix.toLowerCase().startsWith('qu')),
    )
  )
    return null;
  const lemma = verb.entry.lemma;
  if (isPronominalInfinitive(lemma) || ETRE_VERBS.some((verb) => lemma.endsWith(verb))) return null;
  const irregular = lemma === 'avoir' ? 'avoir' : lemma === 'être' ? 'etre' : null;
  if (!irregular && !lemma.endsWith('er')) return null;
  // An elided ne sits on the verb or an earlier word; pas/jamais also catch omitted ne.
  if (
    verb.words.some(
      (word, index) =>
        ['ne', 'pas', 'jamais', 'plus', 'rien', 'personne', 'aucun', 'aucune', 'ni'].includes(
          word.text.toLowerCase(),
        ) ||
        (index <= verb.index && word.prefix[0]?.toLowerCase() === 'n'),
    )
  )
    return null;
  const before = verb.words[verb.index - 1];
  const existential =
    lemma === 'avoir' && before?.text.toLowerCase() === 'y' && verb.words[verb.index - 2]?.text.toLowerCase() === 'il';
  const clitics = before
    ? entriesOf(sentence, glossary, before.ordinal).filter((entry) => entry.pos === 'function')
    : [];
  if (clitics.some((entry) => entry.sense !== 'subject' && !(existential && entry.sense === 'existential')))
    return null;
  if (before && (['me', 'te', 'se'].includes(before.text.toLowerCase()) || /^[jmts]/i.test(before.prefix))) return null;
  // Only je can elide onto this verb. c’est and reflexive/object prefixes need another construction.
  const clitic = verb.word.prefix ? cliticOf(sentence, glossary, verb.word) : null;
  if (verb.word.prefix && clitic?.text.toLowerCase() !== 'je') return null;
  if (!before && !clitic) return null;
  const je = clitic?.text.toLowerCase() === 'je' || before?.text.toLowerCase() === 'je';
  const form = verb.word.lookup.toLowerCase();
  const regular = irregular ? null : REGULAR_RULES['er-regular'](lemma.slice(0, -2));
  const person = irregular
    ? AUXILIARY_FORMS[irregular].present.indexOf(form)
    : FINITE_PERSONS.findIndex(
        (person, index) =>
          (index !== 0 || je) &&
          regular!.present(person).some((stem) => stem + regular!.presentEndings[index] === form),
      );
  if (person === -1) return null;
  const participle = pastParticiples(irregular ? irregulars[irregular].participles.past : regular!.past!).ms;
  const auxiliary = AUXILIARY_FORMS.avoir.present[person];
  const start = je && before && !clitic ? before.start : verb.word.start;
  const lead = je ? (sentence.fr[start] === 'J' ? 'J’' : 'j’') : '';
  return {
    answer: sentence.fr.slice(0, start) + lead + auxiliary + ' ' + participle + sentence.fr.slice(verb.word.end),
  };
}
