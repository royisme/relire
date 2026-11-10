/** Owns summary-list and individual-topic validation; never fetches a whole topic pack. */
import { GrammarTopicListSchema, GrammarTopicSchema } from '../../types/grammarTopic';
import { contentRequest } from './request';

export const loadGrammarTopics = () => contentRequest('/v1/topics', (data) => GrammarTopicListSchema.parse(data));
export const loadGrammarTopic = (id: string) =>
  contentRequest(`/v1/topics/${encodeURIComponent(id)}`, (data) => GrammarTopicSchema.parse(data));
