/** Weighted area counts and deterministic weak-tag selection over real attempt totals. */
import type { TagAccuracy } from '../../storage/exerciseAttempts';
import { GRAMMAR_AREA_IDS, GRAMMAR_TAGS, grammarAreaOf, type GrammarAreaId } from '../../types/grammar';

export interface AreaAccuracy {
  area: GrammarAreaId;
  correct: number;
  total: number;
  accuracy: number;
}

export function accuracyByArea(tags: readonly TagAccuracy[]): AreaAccuracy[] {
  const counts = new Map<GrammarAreaId, { correct: number; total: number }>();
  for (const tag of tags) {
    if (tag.total <= 0) continue;
    const area = grammarAreaOf(tag.grammarTag);
    const count = counts.get(area) ?? { correct: 0, total: 0 };
    count.correct += tag.correct;
    count.total += tag.total;
    counts.set(area, count);
  }
  return GRAMMAR_AREA_IDS.filter((area) => counts.has(area)).map((area) => {
    const count = counts.get(area)!;
    return { area, ...count, accuracy: count.correct / count.total };
  });
}

export function weakGrammarTags(tags: readonly TagAccuracy[]) {
  return tags
    .filter((tag) => tag.total > 0 && tag.correct < tag.total)
    .toSorted(
      (a, b) =>
        a.correct / a.total - b.correct / b.total ||
        GRAMMAR_TAGS.indexOf(a.grammarTag) - GRAMMAR_TAGS.indexOf(b.grammarTag),
    )
    .slice(0, 3)
    .map((tag) => tag.grammarTag);
}
