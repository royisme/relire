/** Owns word/sentence lookup sheets and stale-request guards, not key navigation or vocabulary persistence. */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { WordAnalysis, SentenceAnalysis, UserStats } from '../types';
import { fetchWordAnalysis, fetchSentenceAnalysis, MissingApiKeyError } from '../services/api';

interface LookupSheetsOptions {
  lookupOwner: string;
  content: string | undefined;
  requestKey: () => void;
  setStats: Dispatch<SetStateAction<UserStats>>;
  t: TFunction;
}

export function useLookupSheets({ lookupOwner, content, requestKey, setStats, t }: LookupSheetsOptions) {
  // Word Detail Modal state
  const [isWordModalOpen, setIsWordModalOpen] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [wordData, setWordData] = useState<WordAnalysis | null>(null);
  const [isWordLoading, setIsWordLoading] = useState(false);
  const [activeWordSentence, setActiveWordSentence] = useState('');
  // The address and exact Reader content whose source opened the sheet.
  const [wordSheetOwner, setWordSheetOwner] = useState<string | null>(null);
  const wordRequest = useRef(0);
  const wordContext = useRef<string | undefined>(undefined);
  // A lookup belongs to the address that opened it: Back, Forward or a typed address closes the sheet before
  // the new page paints, and the request is dropped so a late answer or failure cannot show on that page,
  // replace a newer lookup or send the learner to Settings from it.
  if (wordSheetOwner && wordSheetOwner !== lookupOwner) {
    setWordSheetOwner(null);
    setIsWordModalOpen(false);
    setIsWordLoading(false);
    setActiveWord(null);
  }
  useEffect(
    () => () => {
      wordRequest.current++;
    },
    [lookupOwner],
  );

  // Sentence Drawer state
  const [isSentenceDrawerOpen, setIsSentenceDrawerOpen] = useState(false);
  const [activeSentence, setActiveSentence] = useState<string | null>(null);
  const [sentenceData, setSentenceData] = useState<SentenceAnalysis | null>(null);
  const [isSentenceLoading, setIsSentenceLoading] = useState(false);
  const [sentenceSheetOwner, setSentenceSheetOwner] = useState<string | null>(null);
  const sentenceRequest = useRef(0);
  if (sentenceSheetOwner && sentenceSheetOwner !== lookupOwner) {
    setSentenceSheetOwner(null);
    setIsSentenceDrawerOpen(false);
    setIsSentenceLoading(false);
    setActiveSentence(null);
  }
  useEffect(
    () => () => {
      sentenceRequest.current++;
    },
    [lookupOwner],
  );

  // AI failures: a missing key sends the user to Settings, anything else is shown in the sheet.
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAiError = (err: unknown, closeSheet: () => void) => {
    if (err instanceof MissingApiKeyError) {
      closeSheet();
      requestKey();
      return;
    }
    setAiError(err instanceof Error ? err.message : String(err));
  };

  // Word Click Handler
  const handleWordClick = async (word: string, sentence: string, context = content) => {
    // Strip leading/trailing punctuation while preserving French accents
    const cleanWord = word.trim().replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
    if (!cleanWord) return;

    const request = ++wordRequest.current;
    wordContext.current = context;
    setWordSheetOwner(lookupOwner);
    setActiveWord(cleanWord);
    setActiveWordSentence(sentence);
    setIsWordModalOpen(true);
    setIsWordLoading(true);
    setWordData(null);
    setAiError(null);

    try {
      const data = await fetchWordAnalysis(cleanWord, sentence, context);
      if (request !== wordRequest.current) return;
      if (data && data.word) {
        setWordData(data);
      } else {
        throw new Error(t('notebook.emptyWordAnalysis'));
      }
    } catch (err) {
      if (request === wordRequest.current) handleAiError(err, () => setIsWordModalOpen(false));
    } finally {
      if (request === wordRequest.current) setIsWordLoading(false);
    }
  };

  const handleRetryWord = () => {
    if (activeWord) {
      void handleWordClick(activeWord, activeWordSentence, wordContext.current);
    }
  };

  // Sentence Click Handler
  const handleSentenceClick = async (sentence: string) => {
    if (!sentence.trim()) return;

    const request = ++sentenceRequest.current;
    setSentenceSheetOwner(lookupOwner);
    setActiveSentence(sentence);
    setIsSentenceDrawerOpen(true);
    setIsSentenceLoading(true);
    setSentenceData(null);
    setAiError(null);

    // Increment sentence analysis stat
    setStats((prev) => ({
      ...prev,
      sentencesAnalyzed: (prev.sentencesAnalyzed || 0) + 1,
    }));

    try {
      const data = await fetchSentenceAnalysis(sentence, content);
      if (request === sentenceRequest.current) setSentenceData(data);
    } catch (err) {
      if (request === sentenceRequest.current) handleAiError(err, () => setIsSentenceDrawerOpen(false));
    } finally {
      if (request === sentenceRequest.current) setIsSentenceLoading(false);
    }
  };

  return {
    activeWord,
    activeSentence,
    wordData,
    handleWordClick,
    handleSentenceClick,
    wordSheet: {
      isOpen: isWordModalOpen,
      onClose: () => {
        wordRequest.current++;
        setWordSheetOwner(null);
        setIsWordModalOpen(false);
        setActiveWord(null);
      },
      wordData,
      isLoading: isWordLoading,
      contextSentence: activeWordSentence,
      onRetry: handleRetryWord,
      activeWord,
      errorMessage: aiError,
    },
    sentenceSheet: {
      isOpen: isSentenceDrawerOpen,
      onClose: () => {
        sentenceRequest.current++;
        setSentenceSheetOwner(null);
        setIsSentenceDrawerOpen(false);
        setActiveSentence(null);
      },
      sentenceData,
      isLoading: isSentenceLoading,
      errorMessage: aiError,
    },
  };
}
