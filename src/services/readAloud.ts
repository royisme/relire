/** Resolves a durable read-aloud selection without changing sources or guessing a vanished sentence. */
import type { Article } from '../types';
import { splitArticle } from '../utils/sentences';

export function resolveReadAloud(articles: Article[], articleId: string, sentence?: string) {
  const article = articles.find((entry) => entry.id === articleId);
  if (!article) return undefined;
  const sentences = splitArticle(article.content).flat();
  const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
  const index =
    sentence === undefined ? 0 : sentences.findIndex((entry) => normalize(entry.text) === normalize(sentence));
  if (!sentences[index]) return undefined;
  return { article, sentences, index };
}
