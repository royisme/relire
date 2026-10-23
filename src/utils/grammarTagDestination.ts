/** Chooses a tag's destination from the published index; loading and uncovered tags have none. */
import type { GrammarTag } from '../types/grammar';
import type { GrammarTagIndex } from '../types/grammarTagIndex';
import type { Route } from './routes';

export function grammarTagDestination(index: GrammarTagIndex | undefined, tag: GrammarTag): Route | undefined {
  const topics = index?.[tag];
  if (!topics?.length) return undefined;
  return topics.length === 1 ? { name: 'grammarTopic', topicId: topics[0] } : { name: 'grammar', tag };
}
