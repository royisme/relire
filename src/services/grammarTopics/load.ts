/** Owns lazy topic validation and its retryable cache; not tag-index loading or UI state. */
import { GrammarTopicsPackSchema, type GrammarTopicsPack } from '../../types/grammarTopic';

let topicsPending: Promise<GrammarTopicsPack> | undefined;
let topicsLoaded: GrammarTopicsPack | undefined;

export const loadedGrammarTopics = () => topicsLoaded;

export function loadGrammarTopics(): Promise<GrammarTopicsPack> {
  topicsPending ??= (async () => {
    const { default: data } = await import('../../data/grammar/topics.json');
    topicsLoaded = GrammarTopicsPackSchema.parse(data);
    return topicsLoaded;
  })().catch((error: unknown) => {
    topicsPending = undefined;
    throw error;
  });
  return topicsPending;
}

/** Only for isolated loader tests; application callers share immutable artifacts. */
export function resetGrammarTopicsForTests(): void {
  topicsPending = undefined;
  topicsLoaded = undefined;
}
