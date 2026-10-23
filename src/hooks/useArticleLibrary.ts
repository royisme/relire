/** Owns the article editor and durable-first library actions, not startup loading or debounced persistence. */
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Article } from '../types';
import { SAMPLE_ARTICLES } from '../data/sampleArticles';
import { deleteArticleData, saveArticle, restoreMissingArticles } from '../storage/db';
import { LIBRARY, parseRoute } from '../utils/routes';
import { navigate } from './useRoute';

export function useArticleLibrary(
  articles: Article[],
  setArticles: Dispatch<SetStateAction<Article[]>>,
  reportSave: (name: string, error: unknown) => void,
) {
  const [editor, setEditor] = useState<{ article: Article | null } | null>(null);

  const openArticle = (article: Article) => {
    navigate({ name: 'reader', articleId: article.id });
  };

  // Add or edit only after commit. A new article opens; an edit stays where it is.
  const handleSaveArticle = async (article: Article): Promise<void> => {
    await saveArticle(article);
    const exists = articles.some((a) => a.id === article.id);
    setArticles((prev) =>
      prev.some((a) => a.id === article.id) ? prev.map((a) => (a.id === article.id ? article : a)) : [article, ...prev],
    );
    if (!exists) openArticle(article);
  };

  const handleDeleteArticle = async (article: Article) => {
    // The article and its recordings go in one transaction; the list changes only once that committed.
    try {
      await deleteArticleData(article.id);
    } catch (err) {
      reportSave('articles', err);
      return;
    }
    reportSave('articles', null);
    setArticles((prev) => prev.filter((a) => a.id !== article.id));
    const here = parseRoute(window.location.hash).route;
    if (here.name === 'reader' && here.articleId === article.id) navigate(LIBRARY, { replace: true });
  };

  const missingSamples = SAMPLE_ARTICLES.filter((sample) => !articles.some((a) => a.id === sample.id));
  const handleRestoreSamples = async () => {
    try {
      const restored = await restoreMissingArticles(missingSamples);
      setArticles((prev) => [...prev.filter((a) => !restored.some((row) => row.id === a.id)), ...restored]);
      reportSave('articles', null);
    } catch (err) {
      reportSave('articles', err);
    }
  };

  return {
    editor,
    setEditor,
    openArticle,
    handleSaveArticle,
    handleDeleteArticle,
    missingSamples,
    handleRestoreSamples,
  };
}
