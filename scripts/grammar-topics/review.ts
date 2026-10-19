/** Owns owner-only hash recording/removal; never generates content or changes a draft's status. */
import { join } from 'node:path';
import { TopicManifestSchema } from '../grammar-pack/topics';
import { TopicReviewsSchema, topicContentHash } from '../grammar-pack/gate';
import { PrivateDraftSchema, readDrafts } from './drafts';
import { repositoryRoot } from './reference';

export async function review(args: string[], root = repositoryRoot): Promise<void> {
  const [command, ...rest] = args;
  const by = rest.indexOf('--by');
  const ids = [...new Set(rest.slice(0, by === -1 ? rest.length : by))];
  if (
    !ids.length ||
    ids.some((id) => id.startsWith('--')) ||
    (command !== 'mark' && command !== 'unmark') ||
    (command === 'mark' && (by < 1 || rest.length !== by + 2)) ||
    (command === 'unmark' && by !== -1)
  )
    throw new Error('Usage: review.ts mark <topicId...> --by "<name>" | unmark <topicId...>');
  const manifest = TopicManifestSchema.parse(await Bun.file(join(root, 'data/grammar-topics/manifest.json')).json());
  for (const id of ids) if (!manifest.topics.some((entry) => entry.id === id)) throw new Error(`${id}: unknown topic`);
  const file = join(root, 'data/grammar-topics/reviews.json');
  const reviews = TopicReviewsSchema.parse(await Bun.file(file).json());
  if (command === 'unmark') reviews.records = reviews.records.filter((record) => !ids.includes(record.topicId));
  else {
    const reviewedAt = new Date().toISOString().slice(0, 10);
    for (const id of ids) {
      const entry = manifest.topics.find((entry) => entry.id === id)!;
      const drafts = (await readDrafts(join(root, '.local/grammar-topics'), entry.chapter)).map((value) =>
        PrivateDraftSchema.parse(value),
      );
      const matches = drafts.filter((draft) => draft.id === id);
      if (matches.length !== 1) throw new Error(`${id}: expected one draft, found ${matches.length}`);
      const { include: _include, reference, ...metadata } = entry;
      const topic = PrivateDraftSchema.parse({
        ...matches[0],
        ...metadata,
        provenance: { ...matches[0].provenance, reference },
      });
      reviews.records.push({ topicId: id, contentHash: topicContentHash(topic), reviewedBy: rest[by + 1], reviewedAt });
    }
  }
  await Bun.write(file, JSON.stringify(TopicReviewsSchema.parse(reviews), null, 2) + '\n');
}

if (import.meta.main) {
  try {
    await review(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
