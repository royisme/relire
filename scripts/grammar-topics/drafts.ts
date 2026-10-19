/** Owns private draft contracts and atomic array storage shared by generation, sheets and owner review. */
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GrammarTopicSchema } from '../../src/types/grammarTopic';
import { repositoryRoot } from './reference';

const uncertain = z.array(z.string()).optional();
export const DraftOutputSchema = z.object({
  title: GrammarTopicSchema.shape.title,
  blocks: GrammarTopicSchema.shape.blocks,
  uncertain,
});
// Warnings are private sheet metadata, never model output or published content.
export const PrivateDraftSchema = GrammarTopicSchema.safeExtend({
  status: z.literal('draft'),
  uncertain,
  warnings: z.array(z.string()).optional(),
});
export type PrivateDraft = z.infer<typeof PrivateDraftSchema>;
export const privateDraftDirectory = join(repositoryRoot, '.local/grammar-topics');

export async function readDrafts(directory: string, chapter: string): Promise<unknown[]> {
  const file = Bun.file(join(directory, `drafts-${chapter}.json`));
  return (await file.exists()) ? z.array(z.unknown()).parse(await file.json()) : [];
}

export async function storeDraft(directory: string, chapter: string, draft: PrivateDraft): Promise<void> {
  const drafts = await readDrafts(directory, chapter);
  const next = drafts.filter(
    (value) => !(value && typeof value === 'object' && 'id' in value && value.id === draft.id),
  );
  next.push(draft);
  await mkdir(directory, { recursive: true });
  const file = join(directory, `drafts-${chapter}.json`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await Bun.write(temporary, JSON.stringify(next, null, 2) + '\n');
  await rename(temporary, file);
}
