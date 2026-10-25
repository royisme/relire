/**
 * What the word sheet asks of the lexicon about verbs: the verb lines for a tapped form, and the entry of a lemma
 * the AI named. Owns those two questions and nothing else; nouns and adjectives are not asked, and no cell is made up.
 */
import { errorMessage } from '../ai/errors';
import { loadGrammarPack } from '../grammarPack/load';
import { normalizeLookupToken } from '../grammarPack/lookup';
import { lookupVerbForms } from '../grammarPack/reverse';
import type { VerbData } from '../../types/lexicon';
import { lexiconForm, lexiconLemma } from './load';
import { matchVerbForm, type VerbFormMatch } from './match';

export interface LexiconVerbLine {
  infinitive: string;
  match: VerbFormMatch;
}
/** The lines to add under the pack's, or the real reason they could not be asked. */
export interface LexiconVerbLines {
  lines: LexiconVerbLine[];
  error?: string;
}

/** At most as many lines as the pack's own lookup draws. */
const MAX_LINES = 4;

/** Verbs of the lexicon that write `word`, except those the pack already names; a word the bundle does not hold is no line. */
export async function lexiconVerbLines(word: string): Promise<LexiconVerbLines> {
  try {
    const [form, pack] = await Promise.all([lexiconForm(word), loadGrammarPack().catch(() => undefined)]);
    const shown = new Set(
      (pack ? lookupVerbForms(pack, word) : []).map((group) => normalizeLookupToken(group.verb.infinitive)),
    );
    const lemmas = (form?.lemmas ?? [])
      .filter(({ pos, lemma }) => pos === 'verb' && !shown.has(normalizeLookupToken(lemma)))
      .slice(0, Math.max(0, MAX_LINES - shown.size));
    const found = await Promise.all(lemmas.map(({ lemma }) => lexiconLemma(lemma)));
    const lines = found.flatMap((response) => {
      const entry = response?.entries.find((candidate) => candidate.pos === 'verb');
      if (!response || entry?.pos !== 'verb') return [];
      const match = matchVerbForm(entry.data, word);
      // A tap on the infinitive itself writes no cell: nothing to name.
      return match.tenses.length || match.participles.length ? [{ infinitive: response.lemma, match }] : [];
    });
    return { lines };
  } catch (error) {
    return { lines: [], error: errorMessage(error) };
  }
}

/**
 * The verb data of a lemma the AI named. The lexicon's pronominal verbs carry the pronoun in their lemma
 * (`se laver`, `s'appeler`), so a pronominal lemma is tried as written and then without the pronoun; the
 * first lemma the lexicon has as a verb wins.
 */
export async function lexiconVerb(lemma: string): Promise<VerbData | undefined> {
  const key = normalizeLookupToken(lemma);
  const bare = key.replace(/^(se |s')/, '');
  for (const candidate of bare === key ? [key] : [key, bare]) {
    const entry = (await lexiconLemma(candidate))?.entries.find((each) => each.pos === 'verb');
    if (entry?.pos === 'verb') return entry.data;
  }
  return undefined;
}
