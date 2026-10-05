import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ReaderView } from './components/ReaderView';
import { WordDetailModal } from './components/WordDetailModal';
import { SentenceDrawer } from './components/SentenceDrawer';
import { VocabularyView } from './components/VocabularyView';
import { PracticeView } from './components/PracticeView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ArticleImporterModal } from './components/ArticleImporterModal';
import { SettingsModal } from './components/SettingsModal';

import { Article, VocabWord, WordAnalysis, SentenceAnalysis, UserStats, PronunciationAssessment } from './types';
import { SAMPLE_ARTICLES, INITIAL_VOCAB } from './data/sampleArticles';
import { fetchWordAnalysis, fetchSentenceAnalysis, MissingApiKeyError } from './services/api';
import { isDueToday, formatDate } from './utils/srs';
import { setGlobalVoice } from './utils/frenchSpeech';

const LOCAL_STORAGE_ARTICLES = 'eclair_articles_v1';
const LOCAL_STORAGE_VOCAB = 'eclair_vocab_v1';
const LOCAL_STORAGE_STATS = 'eclair_stats_v1';

export default function App() {
  // Navigation tab
  const [currentTab, setCurrentTab] = useState<'reader' | 'vocab' | 'practice' | 'analytics'>('reader');
  const [selectedVoice, setSelectedVoice] = useState<'Kore' | 'Charon'>('Kore');

  const handleSelectVoice = (voice: 'Kore' | 'Charon') => {
    setSelectedVoice(voice);
    setGlobalVoice(voice);
  };

  // Articles state
  const [articles, setArticles] = useState<Article[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_ARTICLES);
      return saved ? JSON.parse(saved) : SAMPLE_ARTICLES;
    } catch {
      return SAMPLE_ARTICLES;
    }
  });

  const [currentArticle, setCurrentArticle] = useState<Article>(() => articles[0] || SAMPLE_ARTICLES[0]);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Vocabulary state
  const [vocabList, setVocabList] = useState<VocabWord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_VOCAB);
      return saved ? JSON.parse(saved) : INITIAL_VOCAB;
    } catch {
      return INITIAL_VOCAB;
    }
  });

  // User Stats state
  const [stats, setStats] = useState<UserStats>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_STATS);
      return saved ? JSON.parse(saved) : {
        streak: 3,
        lastActiveDate: formatDate(new Date()),
        totalWordsLearned: 15,
        sentencesAnalyzed: 8,
        shadowingSessionsCompleted: 6,
        averagePronunciationScore: 88,
        pronunciationHistory: [
          {
            date: '2026-10-02',
            text: "On ne voit bien qu'avec le cœur.",
            score: 91,
          },
          {
            date: '2026-10-03',
            text: "C'est un véritable théâtre à ciel ouvert.",
            score: 86,
          },
        ],
      };
    } catch {
      return {
        streak: 3,
        lastActiveDate: formatDate(new Date()),
        totalWordsLearned: 15,
        sentencesAnalyzed: 8,
        shadowingSessionsCompleted: 6,
        averagePronunciationScore: 88,
        pronunciationHistory: [],
      };
    }
  });

  // Word Detail Modal state
  const [isWordModalOpen, setIsWordModalOpen] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [wordData, setWordData] = useState<WordAnalysis | null>(null);
  const [isWordLoading, setIsWordLoading] = useState(false);
  const [activeWordSentence, setActiveWordSentence] = useState('');

  // Sentence Drawer state
  const [isSentenceDrawerOpen, setIsSentenceDrawerOpen] = useState(false);
  const [activeSentence, setActiveSentence] = useState<string | null>(null);
  const [sentenceData, setSentenceData] = useState<SentenceAnalysis | null>(null);
  const [isSentenceLoading, setIsSentenceLoading] = useState(false);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_ARTICLES, JSON.stringify(articles));
    } catch (e) {
      console.error(e);
    }
  }, [articles]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_VOCAB, JSON.stringify(vocabList));
    } catch (e) {
      console.error(e);
    }
  }, [vocabList]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_STATS, JSON.stringify(stats));
    } catch (e) {
      console.error(e);
    }
  }, [stats]);

  // AI failures: a missing key sends the user to Settings, anything else is shown in the sheet.
  const [aiError, setAiError] = useState<string | null>(null);
  const [settingsNeedKey, setSettingsNeedKey] = useState(false);

  const handleAiError = (err: unknown, closeSheet: () => void) => {
    if (err instanceof MissingApiKeyError) {
      closeSheet();
      setSettingsNeedKey(true);
      setIsSettingsOpen(true);
      return;
    }
    setAiError(err instanceof Error ? err.message : String(err));
  };

  // Word Click Handler
  const handleWordClick = async (word: string, sentence: string) => {
    // Strip leading/trailing punctuation while preserving French accents
    const cleanWord = word.trim().replace(/^[^a-zA-ZÀ-ÿœŒæÆ]+|[^a-zA-ZÀ-ÿœŒæÆ]+$/g, '');
    if (!cleanWord) return;

    setActiveWord(cleanWord);
    setActiveWordSentence(sentence);
    setIsWordModalOpen(true);
    setIsWordLoading(true);
    setWordData(null);
    setAiError(null);

    try {
      const data = await fetchWordAnalysis(cleanWord, sentence, currentArticle.content);
      if (data && data.word) {
        setWordData(data);
      } else {
        throw new Error('Empty word analysis returned');
      }
    } catch (err) {
      handleAiError(err, () => setIsWordModalOpen(false));
    } finally {
      setIsWordLoading(false);
    }
  };

  const handleRetryWord = () => {
    if (activeWord) {
      handleWordClick(activeWord, activeWordSentence);
    }
  };

  // Sentence Click Handler
  const handleSentenceClick = async (sentence: string) => {
    if (!sentence.trim()) return;

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
      const data = await fetchSentenceAnalysis(sentence, currentArticle.content);
      setSentenceData(data);
    } catch (err) {
      handleAiError(err, () => setIsSentenceDrawerOpen(false));
    } finally {
      setIsSentenceLoading(false);
    }
  };

  // Toggle Vocabulary handler
  const handleToggleVocab = (data: WordAnalysis, contextSentence: string) => {
    const exists = vocabList.some(
      (w) => w.word.toLowerCase() === data.word.toLowerCase()
    );

    if (exists) {
      setVocabList((prev) =>
        prev.filter((w) => w.word.toLowerCase() !== data.word.toLowerCase())
      );
    } else {
      const newWord: VocabWord = {
        id: 'v-' + Date.now(),
        word: data.word,
        lemma: data.lemma || data.word,
        ipa: data.ipa || '',
        translation: data.translation,
        partOfSpeech: data.partOfSpeech,
        contextSentence: contextSentence || '',
        contextTense: data.contextTense,
        phoneticsGuide: data.phoneticsGuide,
        addedAt: formatDate(new Date()),
        repetitions: 0,
        intervalDays: 1,
        easeFactor: 2.5,
        nextReviewDate: formatDate(new Date()), // due immediately or tomorrow
        reviewHistory: [],
        tags: [currentArticle.category || '阅读生词'],
      };

      setVocabList((prev) => [newWord, ...prev]);
    }
  };

  const handleUpdateWord = (updatedWord: VocabWord) => {
    setVocabList((prev) =>
      prev.map((w) => (w.id === updatedWord.id ? updatedWord : w))
    );
  };

  const handleDeleteWord = (wordId: string) => {
    setVocabList((prev) => prev.filter((w) => w.id !== wordId));
  };

  const handleImportArticle = (newArticle: Article) => {
    setArticles((prev) => [newArticle, ...prev]);
    setCurrentArticle(newArticle);
    setCurrentTab('reader');
  };

  const handleRecordAssessmentComplete = (
    assessment: PronunciationAssessment,
    sentenceText: string
  ) => {
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

  const isCurrentWordInVocab = wordData
    ? vocabList.some((w) => w.word.toLowerCase() === wordData.word.toLowerCase())
    : false;

  const dueCount = vocabList.filter(isDueToday).length;

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenImporter={() => setIsImporterOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        dueCount={dueCount}
        totalVocabCount={vocabList.length}
        selectedVoice={selectedVoice}
        onSelectVoice={handleSelectVoice}
      />

      {/* Main View Area */}
      <main className="flex-1 pb-16">
        {currentTab === 'reader' && (
          <ReaderView
            articles={articles}
            currentArticle={currentArticle}
            onSelectArticle={setCurrentArticle}
            onOpenImporter={() => setIsImporterOpen(true)}
            onWordClick={handleWordClick}
            onSentenceClick={handleSentenceClick}
            activeWord={activeWord}
            activeSentence={activeSentence}
          />
        )}

        {currentTab === 'vocab' && (
          <VocabularyView
            vocabList={vocabList}
            onUpdateWord={handleUpdateWord}
            onDeleteWord={handleDeleteWord}
          />
        )}

        {currentTab === 'practice' && (
          <PracticeView
            currentArticle={currentArticle}
            onRecordAssessmentComplete={handleRecordAssessmentComplete}
          />
        )}

        {currentTab === 'analytics' && (
          <AnalyticsDashboard
            stats={stats}
            vocabList={vocabList}
          />
        )}
      </main>

      {/* Word Detail Floating Modal */}
      <WordDetailModal
        isOpen={isWordModalOpen}
        onClose={() => {
          setIsWordModalOpen(false);
          setActiveWord(null);
        }}
        wordData={wordData}
        isLoading={isWordLoading}
        contextSentence={activeWordSentence}
        isSavedInVocab={isCurrentWordInVocab}
        onToggleVocab={handleToggleVocab}
        onRetry={handleRetryWord}
        activeWord={activeWord}
        errorMessage={aiError}
      />

      {/* Sentence Breakdown & Shadowing Drawer */}
      <SentenceDrawer
        isOpen={isSentenceDrawerOpen}
        onClose={() => {
          setIsSentenceDrawerOpen(false);
          setActiveSentence(null);
        }}
        sentence={activeSentence || ''}
        sentenceData={sentenceData}
        isLoading={isSentenceLoading}
        errorMessage={aiError}
        onRecordAssessmentComplete={handleRecordAssessmentComplete}
      />

      {/* Article Importer / Pasting Modal */}
      <ArticleImporterModal
        isOpen={isImporterOpen}
        onClose={() => setIsImporterOpen(false)}
        onImport={handleImportArticle}
        articles={articles}
      />

      {/* Settings */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          setSettingsNeedKey(false);
        }}
        needsKey={settingsNeedKey}
        onSettingsSaved={(newSettings) => {
          if (newSettings.ttsVoice) {
            handleSelectVoice(newSettings.ttsVoice as any);
          }
        }}
      />
    </div>
  );
}
