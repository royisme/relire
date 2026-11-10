/** Owns the offline real LexiconIndex adapter; private CSV reads happen only inside loadLexicon. */
import { join } from 'node:path';
import { loadLexicon, morphalouDir, parseAllowlist } from '../lexicon/lexicon';
import { GrammarPackSchema } from '../../src/types/grammarPack';
import { reverseLookup } from '../../src/services/grammarPack/reverse';
import { memoryLexicon, type LexiconIndex, type LexiconCandidate } from './lexiconIndex';

export async function offlineLexicon(root: string): Promise<LexiconIndex> {
  const wanted = new Set(parseAllowlist(await Bun.file(join(root, 'data/lexicon/lemmas.txt')).text()));
  const directory = morphalouDir(root);
  let lexicon;
  try {
    lexicon = await loadLexicon(directory, wanted);
  } catch (cause) {
    throw new Error(
      `Cannot load offline Morphalou at ${directory}: ${cause instanceof Error ? cause.message : String(cause)}. ` +
        'Install the private CSV locally; CI uses synthetic adapters.',
      { cause },
    );
  }
  const pack = GrammarPackSchema.parse(await Bun.file(join(root, 'src/data/grammar-pack/pack.json')).json());
  pack.verbs = pack.verbs.filter((verb) => verb.prov.status === 'reviewed');
  const rows: (LexiconCandidate & { form: string })[] = [];
  for (const entry of lexicon.values()) {
    for (const [slot, forms] of entry.cells)
      for (const form of forms) rows.push({ form, lemma: entry.lemma, pos: entry.pos, slot });
    if (entry.pos === 'verb') rows.push({ form: entry.lemma, lemma: entry.lemma, pos: 'verb', slot: 'infinitive' });
  }
  const forms = new Set<string>();
  for (const verb of pack.verbs) {
    rows.push({ form: verb.infinitive, lemma: verb.infinitive, pos: 'verb', slot: 'infinitive' });
    for (const cells of Object.values(verb.tenses))
      for (const cell of Object.values(cells)) for (const form of cell.forms) forms.add(form);
    if (verb.participles.present) forms.add(verb.participles.present);
    for (const form of Object.values(verb.participles.past)) forms.add(form);
    // Pack imperative strings contain the reviewed postposed reflexive clitic.
    if (verb.pronominal) {
      for (const [person, cell] of Object.entries(verb.tenses.imperatif ?? {}))
        for (const form of cell.forms)
          rows.push({
            form: form.replace(/-(toi|nous|vous)$/u, ''),
            lemma: verb.infinitive,
            pos: 'verb',
            slot: `tenses.imperatif.${person}`,
          });
    }
  }
  for (const form of forms) {
    for (const hit of reverseLookup(pack, form)) {
      const verb = pack.verbs.find((entry) => entry.id === hit.verbId)!;
      const slot =
        'tense' in hit
          ? `tenses.${hit.tense}.${hit.person}`
          : hit.participle === 'present'
            ? 'participles.present'
            : `participles.past.${hit.participle}`;
      rows.push({ form, lemma: verb.infinitive, pos: 'verb', slot });
    }
  }
  return memoryLexicon(rows, pack.verbs);
}
