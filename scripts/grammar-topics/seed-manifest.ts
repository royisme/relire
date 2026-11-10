/** Owns hand-proposed ids/tags and one-time metadata seeding; never reads topic prose or overwrites entries. */
import { Database } from 'bun:sqlite';
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import type { GrammarTag } from '../../src/types/grammar';
import { TopicManifestSchema, type TopicManifest } from '../grammar-pack/topics';
import { referenceDirectory, repositoryRoot } from './reference';

export const proposals: [string, string, GrammarTag[]][] = [
  ['K001', 'noun-gender-feminine', ['gender-number']],
  ['K002', 'noun-plurals', ['gender-number']],
  ['K003', 'definite-article-forms', ['articles']],
  ['K004', 'article-contraction-a', ['articles', 'prepositions']],
  ['K005', 'article-contraction-de', ['articles', 'prepositions']],
  ['K006', 'definite-article-uses', ['articles']],
  ['K007', 'articles-proper-names', ['articles']],
  ['K008', 'country-prepositions', ['prepositions', 'articles']],
  ['K009', 'indefinite-article-forms', ['articles']],
  ['K010', 'indefinite-article-reference', ['articles']],
  ['K011', 'indefinite-article-description', ['articles']],
  ['K012', 'des-before-adjectives', ['articles', 'adjective-position']],
  ['K013', 'partitive-article-forms', ['partitive-quantity']],
  ['K014', 'partitive-article-uses', ['partitive-quantity']],
  ['K015', 'uncountable-noun-articles', ['partitive-quantity']],
  ['K016', 'articles-in-negation', ['articles', 'negation']],
  ['K017', 'possessive-determiners', ['possessive-demonstrative']],
  ['K018', 'demonstrative-determiners', ['possessive-demonstrative']],
  ['K019', 'interrogative-quel', ['questions']],
  ['K020', 'determiner-tout', ['possessive-demonstrative']],
  ['K021', 'cardinal-numbers', ['numbers-time']],
  ['K022', 'ordinal-numbers', ['numbers-time']],
  ['K023', 'fractions', ['numbers-time']],
  ['K024', 'percentages-decimals', ['numbers-time']],
  ['K025', 'subject-pronouns', ['subject-object-pronouns']],
  ['K026', 'reflexive-pronouns', ['subject-object-pronouns', 'pronominal-verbs']],
  ['K027', 'stressed-pronouns', ['subject-object-pronouns']],
  ['K028', 'indirect-object-pronouns', ['subject-object-pronouns']],
  ['K029', 'direct-object-pronouns', ['subject-object-pronouns']],
  ['K030', 'pronoun-y', ['y-en']],
  ['K031', 'pronoun-en', ['y-en']],
  ['K032', 'pronoun-position', ['subject-object-pronouns', 'word-order']],
  ['K033', 'pronoun-on', ['other-pronouns']],
  ['K034', 'pronoun-tout', ['other-pronouns']],
  ['K035', 'pronoun-ca', ['other-pronouns']],
  ['K036', 'adjective-agreement', ['adjective-agreement']],
  ['K037', 'adjective-feminine', ['adjective-agreement']],
  ['K038', 'adjective-plurals', ['adjective-agreement']],
  ['K039', 'irregular-adjective-forms', ['adjective-agreement']],
  ['K040', 'adjective-position', ['adjective-position']],
  ['K041', 'verb-conjugation-overview', ['present']],
  ['K042', 'present-tense-forms', ['present']],
  ['K043', 'present-tense-uses', ['present']],
  ['K044', 'compound-past-formation', ['passe-compose', 'past-participle-agreement']],
  ['K045', 'past-participles', ['passe-compose']],
  ['K046', 'compound-past-uses', ['passe-compose']],
  ['K047', 'imperfect-forms', ['imparfait']],
  ['K048', 'imperfect-uses', ['imparfait']],
  ['K049', 'past-tense-choice', ['tense-choice-past']],
  ['K050', 'recent-past', ['infinitive-gerund']],
  ['K051', 'simple-future', ['future']],
  ['K052', 'near-future', ['future']],
  ['K053', 'imperative-forms', ['imperative']],
  ['K054', 'pronominal-verb-uses', ['pronominal-verbs']],
  ['K055', 'pronominal-imperative-past', ['pronominal-verbs', 'imperative']],
  ['K056', 'jouer-prepositions', ['prepositions']],
  ['K057', 'questions-comment', ['questions']],
  ['K058', 'questions-combien', ['questions']],
  ['K059', 'questions-ou', ['questions']],
  ['K060', 'degree-adverbs', ['adverbs']],
  ['K061', 'quantity-adverbs', ['adverbs', 'partitive-quantity']],
  ['K062', 'preposition-overview', ['prepositions']],
  ['K063', 'preposition-a', ['prepositions']],
  ['K064', 'preposition-en', ['prepositions']],
  ['K065', 'preposition-pour', ['prepositions']],
  ['K066', 'preposition-dans', ['prepositions']],
  ['K067', 'preposition-avec', ['prepositions']],
  ['K068', 'conjunction-si', ['connectors', 'hypothesis-si']],
  ['K069', 'conjunction-quand', ['connectors']],
  ['K070', 'yes-no-questions', ['questions']],
  ['K071', 'information-questions', ['questions']],
  ['K072', 'questions-qui', ['questions']],
  ['K073', 'questions-que-quoi', ['questions']],
  ['K074', 'questions-est-ce-que', ['questions']],
  ['K075', 'negation-ne-pas', ['negation']],
  ['K076', 'negation-ne-plus', ['negation']],
  ['K077', 'pattern-cest', ['word-order']],
  ['K078', 'pattern-il-y-a', ['word-order']],
  ['K079', 'pattern-il-faut', ['word-order']],
  ['K080', 'telling-time', ['numbers-time']],
  ['K081', 'time-prepositions', ['numbers-time', 'prepositions']],
  ['K082', 'expressing-cause', ['connectors']],
  ['K083', 'expressing-purpose', ['connectors']],
  ['K084', 'weather-expressions', ['vocabulary-usage']],
  ['K085', 'future-expressions', ['future']],
  ['K086', 'greetings', ['vocabulary-usage']],
  ['K087', 'introductions', ['vocabulary-usage']],
  ['K088', 'shopping', ['vocabulary-usage']],
  ['K089', 'asking-directions', ['vocabulary-usage', 'prepositions']],
  ['K090', 'dates', ['numbers-time', 'vocabulary-usage']],
  ['K091', 'hobbies', ['vocabulary-usage']],
  ['K092', 'holidays', ['vocabulary-usage']],
  ['K093', 'sports', ['vocabulary-usage']],
];
export const chapterIds = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].map(
  (word) => `chapter-${word}`,
);

export async function seedManifest(reference: string, file: string): Promise<TopicManifest> {
  const directory = await referenceDirectory(reference);
  const existing = (await Bun.file(file).exists())
    ? TopicManifestSchema.parse(await Bun.file(file).json())
    : { packVersion: '0.1.0', topics: [] };
  const db = new Database(join(directory, 'library.sqlite3'), { readonly: true });
  try {
    const topics = db.query<{ id: string; chapter: string }, []>('SELECT id, chapter FROM topic ORDER BY rowid').all();
    const chapters = [...new Set(topics.map((topic) => topic.chapter))];
    if (chapters.length > chapterIds.length) throw new Error('Expected at most ten chapters');
    const links = db
      .query<{ topic: string; node: string }, []>(
        'SELECT link.topic, link.node FROM link JOIN node ON node.id = link.node',
      )
      .all();
    const ids = new Map(proposals.map(([reference, id]) => [reference, id]));
    for (const topic of existing.topics) ids.set(topic.reference, topic.id);
    const present = new Set(topics.map((topic) => topic.id));
    for (const topic of topics) {
      if (existing.topics.some((entry) => entry.reference === topic.id)) continue;
      const proposal = proposals.find(([reference]) => reference === topic.id);
      if (!proposal) throw new Error(`No hand-authored proposal for ${topic.id}`);
      const nodes = new Set(links.filter((link) => link.topic === topic.id).map((link) => link.node));
      const related = [
        ...new Set(
          links
            .filter((link) => link.topic !== topic.id && present.has(link.topic) && nodes.has(link.node))
            .map((link) => ids.get(link.topic)!),
        ),
      ];
      existing.topics.push({
        id: proposal[1],
        reference: topic.id,
        level: 'A1',
        chapter: chapterIds[chapters.indexOf(topic.chapter)],
        tags: proposal[2],
        related,
        include: false,
      });
    }
    const manifest = TopicManifestSchema.parse(existing);
    await Bun.write(file, JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { reference: { type: 'string' } } });
  await seedManifest(
    values.reference ?? process.env.GRAMMAR_REFERENCE_DIR!,
    join(repositoryRoot, 'data/grammar-topics/manifest.json'),
  );
}
