/** Owns the terminal-only private review sheet; never records an owner review or reads reference prose. */
import { join } from 'node:path';
import { TopicManifestSchema } from '../grammar-pack/topics';
import { PrivateDraftSchema, readDrafts } from './drafts';
import { promptFile, promptHash } from './generator';
import { repositoryRoot } from './reference';

export async function sheet(
  outputDirectory: string,
  chapter?: string,
  status?: string,
  root = repositoryRoot,
): Promise<string> {
  const manifest = TopicManifestSchema.parse(await Bun.file(join(root, 'data/grammar-topics/manifest.json')).json());
  if (chapter && !manifest.topics.some((entry) => entry.chapter === chapter))
    throw new Error(`Unknown chapter ${chapter}`);
  if (status !== undefined && status !== 'draft') throw new Error('The only private status is draft');
  const currentHash = promptHash(await Bun.file(promptFile).text());
  const chapters = [
    ...new Set(manifest.topics.filter((entry) => !chapter || entry.chapter === chapter).map((entry) => entry.chapter)),
  ];
  const lines: string[] = [];
  for (const chapter of chapters) {
    for (const value of await readDrafts(outputDirectory, chapter)) {
      const draft = PrivateDraftSchema.parse(value);
      lines.push(
        `${draft.id} | ${draft.provenance.reference} | ${draft.tags.join(', ')} | ${draft.level} | draft${draft.provenance.promptHash !== currentHash ? ' | STALE PROMPT' : ''}`,
      );
      lines.push(`Title: ${JSON.stringify(draft.title)}`);
      draft.blocks.forEach((block, index) => {
        lines.push(`Block ${index + 1}: ${block.type}${block.heading ? ' | ' + JSON.stringify(block.heading) : ''}`);
        lines.push(JSON.stringify(block, null, 2));
      });
      lines.push(`Warnings: ${JSON.stringify(draft.warnings ?? [])}`);
      lines.push(`Uncertain: ${JSON.stringify(draft.uncertain ?? [])}`, '');
    }
  }
  return lines.join('\n');
}
