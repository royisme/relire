/**
 * `question`: the reader sentence rewritten as an est-ce que question, computed by rule.
 * Null means the rule does not cover this sentence; a skipped sentence is not an error.
 * No AI, no key, no IO.
 */
import type { ReaderGlossaryEntry, Sentence } from '../../../types/gradedReader';
import { readerWords } from '../../../utils/readerTokens';
import { elides, entriesOf, verbOf } from './words';

export function transformQuestion(sentence: Sentence, glossary: ReaderGlossaryEntry[]): { answer: string } | null {
  // Only a final period is declarative; a question or an exclamation stays as written.
  if (!sentence.fr.endsWith('.')) return null;
  // A verbless line (`Bonjour, madame.`) is not a statement that est-ce que can turn into a question.
  if (!verbOf(sentence, glossary)) return null;
  const first = readerWords(sentence.fr)[0];
  if (!first) return null;
  // Elision reads the written word: `j’`, `c’` and `l’` start with a consonant letter, so they keep `que`.
  const que = elides(first.text.toLowerCase()) ? 'Est-ce qu’' : 'Est-ce que ';
  // A glossary proper noun keeps its capital; any other sentence lowercases its first letter.
  const proper = entriesOf(sentence, glossary, first.ordinal).some((entry) => entry.pos === 'proper');
  const body = proper ? sentence.fr : sentence.fr[0].toLowerCase() + sentence.fr.slice(1);
  return { answer: que + body.slice(0, -1) + ' ?' };
}
