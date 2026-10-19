/** Owns independent lazy topic/index validation and retryable promise caches; not generation or UI state. */
import {
  GrammarTopicsPackSchema,
  GrammarTagIndexSchema,
  type GrammarTopicsPack,
  type GrammarTagIndex,
} from '../../types/grammarTopic';

let topicsPending: Promise<GrammarTopicsPack> | undefined;
let topicsLoaded: GrammarTopicsPack | undefined;
let indexPending: Promise<GrammarTagIndex> | undefined;
let indexLoaded: GrammarTagIndex | undefined;

export const loadedGrammarTopics = () => topicsLoaded;
export const loadedGrammarTagIndex = () => indexLoaded;

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

export function loadGrammarTagIndex(): Promise<GrammarTagIndex> {
  indexPending ??= (async () => {
    const { default: data } = await import('../../data/grammar/tag-index.json');
    indexLoaded = GrammarTagIndexSchema.parse(data);
    return indexLoaded;
  })().catch((error: unknown) => {
    indexPending = undefined;
    throw error;
  });
  return indexPending;
}

/** Only for isolated loader tests; application callers share immutable artifacts. */
export function resetGrammarTopicsForTests(): void {
  topicsPending = undefined;
  topicsLoaded = undefined;
  indexPending = undefined;
  indexLoaded = undefined;
}
