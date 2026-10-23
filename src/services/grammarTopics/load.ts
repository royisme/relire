/** Owns summary-list and individual-topic validation; never fetches a whole topic pack. */
import { GrammarTopicSchema, GrammarTopicSummarySchema } from '../../types/grammarTopic';
import { contentRequest } from './request';

const summaries = GrammarTopicSummarySchema.array();
export const loadGrammarTopics = () => contentRequest('/v1/topics', (data) => summaries.parse(data));
export const loadGrammarTopic = (id: string) =>
  contentRequest(`/v1/topics/${encodeURIComponent(id)}`, (data) => GrammarTopicSchema.parse(data));
