/** Owns the terminal-only private review sheet; never records an owner review or reads reference prose. */
import { join } from 'node:path';
import { normalizeFrench } from '../../src/services/exercises/normalizeFrench';
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
      if (draft.learning) {
        lines.push(
          'Learning review objectives (structural validation is not linguistic approval):',
          '- Linguistic correctness; supported scope and C1 ceiling.',
          '- Compact teaching and taught-before-tested contrasts; fresh typed contexts.',
          '- Plausible distractors and no answer leakage; faithful bilingual feedback.',
          'Full learning payload (EN/ZH instructions, checkpoint titles, teaching, prompts, answers and all feedback):',
          JSON.stringify(draft.learning, null, 2),
        );
        draft.learning.checkpoints.forEach((checkpoint, i) => {
          lines.push(`Checkpoint ${i + 1}: ${checkpoint.id} | ${JSON.stringify(checkpoint.title)}`);
          checkpoint.questions.forEach((question, j) => {
            const key = (answer: string) => normalizeFrench(answer, true);
            lines.push(
              `Question ${i * 2 + j + 1}: ${question.id} | ${question.type}`,
              `Expected key: ${JSON.stringify(key(question.expectedAnswer))}`,
              `Accepted keys: ${JSON.stringify([question.expectedAnswer, ...(question.acceptableAnswers ?? [])].map(key))}`,
            );
            if (question.type === 'CHOICE_SELECT') {
              const options = question.prompt
                .match(/\{([^{}]+)\}/)![1]
                .split('|')
                .map((option) => option.trim());
              lines.push(`Options: ${JSON.stringify(options)}`, `Option keys: ${JSON.stringify(options.map(key))}`);
            }
            lines.push(
              `Feedback matches (answer/key): ${JSON.stringify((question.feedback.byAnswer ?? []).map(({ answer }) => ({ answer, key: key(answer) })))}`,
              'Normalized collisions: none (schema validated)',
            );
          });
        });
      }
      lines.push(`Warnings: ${JSON.stringify(draft.warnings ?? [])}`);
      lines.push(`Uncertain: ${JSON.stringify(draft.uncertain ?? [])}`, '');
    }
  }
  return lines.join('\n');
}
