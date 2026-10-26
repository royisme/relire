/** Owns pure book-order grouping and navigation; studied marks and loading stay with callers. */
import type { GrammarTopicList, GrammarTopicListEntry } from '../../types/grammarTopic';

export function orderedChapters(list: GrammarTopicList) {
  const chapters = new Map<string, GrammarTopicListEntry[]>();
  for (const entry of [...list].sort((a, b) => a.position - b.position)) {
    const topics = chapters.get(entry.chapter);
    if (topics) topics.push(entry);
    else chapters.set(entry.chapter, [entry]);
  }
  return [...chapters].map(([chapter, topics]) => ({ chapter, topics }));
}

export function nextTopicEntry(list: GrammarTopicList, studied: ReadonlySet<string>) {
  return [...list].sort((a, b) => a.position - b.position).find((entry) => !studied.has(entry.id));
}

export function topicAfter(list: GrammarTopicList, topicId: string) {
  const current = list.find((entry) => entry.id === topicId);
  if (!current) return undefined;
  return [...list].sort((a, b) => a.position - b.position).find((entry) => entry.position > current.position);
}
