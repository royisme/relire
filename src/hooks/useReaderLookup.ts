/**
 * Owns what the reader and lookups share: the document the route opens, the word and sentence sheets, the bookmark and
 * the pronunciation stats callback. Not the key request, the article library or vocabulary storage.
 */
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { Article, PronunciationAssessment, UserStats } from '../types';
import type { VocabularyModel } from './useVocabulary';
import { useVocabularyBookmark } from './useVocabularyBookmark';
import { useLookupSheets } from './useLookupSheets';
import { useReaderUnits } from './useReaderUnits';
import { passageDocument, type ReaderSource } from '../types/readerSource';
import { setLabel } from '../services/exercises/setLabel';
import { formatDate } from '../utils/srs';
import { routeHref, type Route } from '../utils/routes';

export function useReaderLookup(
  route: Route,
  articles: Article[],
  vocabulary: VocabularyModel,
  requestKey: () => void,
  setStats: Dispatch<SetStateAction<UserStats>>,
) {
  const { t, i18n } = useTranslation();
  const currentArticle = route.name === 'reader' ? (articles.find((a) => a.id === route.articleId) ?? null) : null;
  const readerUnits = useReaderUnits();
  const passageUnit = route.name === 'passage' ? readerUnits.units?.find((u) => u.id === route.unitId) : undefined;
  const readerDocument =
    currentArticle ??
    (passageUnit
      ? passageDocument(passageUnit, setLabel(t, passageUnit, i18n.resolvedLanguage), i18n.resolvedLanguage)
      : null);
  const readerSource: ReaderSource | null =
    route.name === 'reader'
      ? { kind: 'article', articleId: route.articleId }
      : route.name === 'passage'
        ? { kind: 'passage', unitId: route.unitId }
        : null;
  const lookupOwner = JSON.stringify([routeHref(route), readerDocument?.content]);

  const {
    lookup,
    activeWord,
    activeSentence,
    wordData,
    handleWordClick,
    handleSentenceClick,
    wordSheet,
    sentenceSheet,
  } = useLookupSheets({ lookupOwner, content: readerDocument?.content, requestKey, setStats, t });

  const bookmark = useVocabularyBookmark(vocabulary, lookup, wordData ? { kind: 'ai', analysis: wordData } : null);

  const handleRecordAssessmentComplete = (assessment: PronunciationAssessment, sentenceText: string) => {
    setStats((prev) => {
      const newHistory = [
        ...(prev.pronunciationHistory || []),
        {
          date: formatDate(new Date()),
          text: sentenceText.slice(0, 45) + (sentenceText.length > 45 ? '...' : ''),
          score: assessment.overallScore,
        },
      ];

      const sum = newHistory.reduce((acc, h) => acc + h.score, 0);
      const avg = Math.round(sum / newHistory.length);

      return {
        ...prev,
        shadowingSessionsCompleted: (prev.shadowingSessionsCompleted || 0) + 1,
        averagePronunciationScore: avg,
        pronunciationHistory: newHistory,
      };
    });
  };

  return {
    readerDocument,
    readerSource,
    passageUnit,
    readerUnits,
    activeWord,
    activeSentence,
    handleWordClick,
    handleSentenceClick,
    wordSheet,
    sentenceSheet,
    bookmark,
    handleRecordAssessmentComplete,
  };
}
