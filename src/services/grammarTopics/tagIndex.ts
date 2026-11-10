/** Owns tag-index validation and in-flight sharing; never imports topic content or schemas. */
import { GrammarTagIndexSchema, type GrammarTagIndex } from '../../types/grammarTagIndex';
import { contentRequest } from './request';

let pending: Promise<GrammarTagIndex> | undefined;
export function loadGrammarTagIndex(): Promise<GrammarTagIndex> {
  pending ??= contentRequest('/v1/tag-index', (data) => GrammarTagIndexSchema.parse(data)).finally(() => {
    pending = undefined;
  });
  return pending;
}
