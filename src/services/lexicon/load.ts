/**
 * Owns the lexicon loaders: one form or one lemma from the content service, validated whole. A 404 is a normal
 * answer (the service holds only about 5,000 common lemmas), so it is `undefined`; every other failure keeps its
 * real text. No service configured means no request. Does not own the matching or what the word sheet draws.
 */
import {
  LexiconFormResponseSchema,
  LexiconLemmaResponseSchema,
  type LexiconFormResponse,
  type LexiconLemmaResponse,
} from '../../types/lexicon';
import { normalizeLookupToken } from '../grammarPack/lookup';
import { contentRequest } from '../grammarTopics/request';
import { ContentServiceHttpError, contentServiceUrl } from '../grammarTopics/service';

async function lexiconRequest<T>(path: string, parse: (data: unknown) => T): Promise<T | undefined> {
  if (!contentServiceUrl()) return undefined;
  try {
    return await contentRequest(path, parse);
  } catch (error) {
    if (error instanceof ContentServiceHttpError && error.status === 404) return undefined;
    throw error;
  }
}

/** The lemmas a written form belongs to; the token is folded like the pack lookup's keys. */
export const lexiconForm = (token: string): Promise<LexiconFormResponse | undefined> =>
  lexiconRequest(`/v1/lexicon/form/${encodeURIComponent(normalizeLookupToken(token))}`, (data) =>
    LexiconFormResponseSchema.parse(data),
  );

/** The entries of one lemma, asked exactly as given (a lemma from `lexiconForm` is already as stored). */
export const lexiconLemma = (lemma: string): Promise<LexiconLemmaResponse | undefined> =>
  lexiconRequest(`/v1/lexicon/${encodeURIComponent(lemma)}`, (data) => LexiconLemmaResponseSchema.parse(data));
