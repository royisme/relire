/** Read-only collection tiers and context; no scheduling or writes. */
import type { VocabularyRow } from '../../../types/vocabulary';
import { MATURE_DAYS } from './challenge';
import { LEECH_LAPSES } from './regions';

export function tierOf(row: VocabularyRow): 'new' | 'learning' | 'young' | 'mature' {
  const schedule = row.schedule;
  if (!schedule || schedule.phase === 'new') return 'new';
  if (schedule.phase !== 'review') return 'learning';
  return schedule.scheduledDays < MATURE_DAYS ? 'young' : 'mature';
}

export function leechesOf(rows: readonly VocabularyRow[], leechLapses: number): VocabularyRow[] {
  return rows.filter((row) => row.schedule && row.schedule.lapses >= leechLapses);
}

export function contextOf(row: VocabularyRow) {
  return {
    memoryTricks: [
      ...new Set(
        row.contexts.flatMap((context) =>
          context.definition.kind === 'ai' && context.definition.analysis.memoryTrick?.trim()
            ? [context.definition.analysis.memoryTrick]
            : [],
        ),
      ),
    ],
    examples: [
      ...new Set([
        ...(row.bookSource?.senses.flatMap((sense) => sense.examples.map((example) => example.fr)) ?? []),
        ...row.contexts.flatMap((context) => [
          ...(context.sentence.trim() ? [context.sentence] : []),
          ...(context.definition.kind === 'ai'
            ? (context.definition.analysis.usageExamples?.map((example) => example.fr) ?? [])
            : []),
        ]),
      ]),
    ],
  };
}

/** No extra context can mount before reveal, even for a due leech. */
export function bossContextOf(row: VocabularyRow | undefined, revealed: boolean) {
  if (!revealed || !row?.schedule || row.schedule.lapses < LEECH_LAPSES) return null;
  return { ...contextOf(row), lapses: row.schedule.lapses };
}
