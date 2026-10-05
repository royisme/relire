import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Volume2, BookOpen, Sparkles, SlidersHorizontal, Eye,
  ChevronDown, Type, Bookmark, Layers, MessageSquare, PlusCircle, Square, Gauge
} from 'lucide-react';
import { Article, WordAnalysis, SentenceAnalysis } from '../types';
import { speakFrench, stopSpeech, setGlobalRate, getGlobalRate } from '../utils/frenchSpeech';
import { formatLevel, formatArticleSource, cleanArticleTitle } from '../utils/i18nHelpers';

interface ReaderViewProps {
  articles: Article[];
  currentArticle: Article;
  onSelectArticle: (article: Article) => void;
  onOpenImporter: () => void;
  onWordClick: (word: string, sentence: string) => void;
  onSentenceClick: (sentence: string) => void;
  activeWord: string | null;
  activeSentence: string | null;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  articles,
  currentArticle,
  onSelectArticle,
  onOpenImporter,
  onWordClick,
  onSentenceClick,
  activeWord,
  activeSentence,
}) => {
  const { t, i18n } = useTranslation();
  // Reading preferences
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('lg');
  const [theme, setTheme] = useState<'parchment' | 'white' | 'sepia' | 'dark'>('parchment');
  const [hoveredSentence, setHoveredSentence] = useState<string | null>(null);

  // Audio Playback & Speed Controller (0.5x to 1.5x)
  const [playbackRate, setPlaybackRate] = useState<number>(0.85);
  const [playingSentence, setPlayingSentence] = useState<string | null>(null);
  const [isSpeedControlOpen, setIsSpeedControlOpen] = useState<boolean>(false);

  const handlePlaybackRateChange = (newRate: number) => {
    setPlaybackRate(newRate);
    setGlobalRate(newRate);
  };

  const handlePlaySentence = (sentenceText: string) => {
    if (playingSentence === sentenceText) {
      stopSpeech();
      setPlayingSentence(null);
      return;
    }

    setPlayingSentence(sentenceText);
    speakFrench(sentenceText, {
      rate: playbackRate,
      onEnd: () => setPlayingSentence(null),
      onError: () => setPlayingSentence(null),
    });
  };

  // Helper to tokenize sentence into clickable words
  const renderSentenceWords = (sentenceText: string) => {
    // Normalize typographical quotes and apostrophes to standard ASCII
    const normalizedText = sentenceText.replace(/[’‘`]/g, "'");
    
    // Regex splits words (including accents, internal apostrophes and hyphens) and punctuation
    const tokens = normalizedText.split(/([a-zA-ZÀ-ÿœŒæÆ]+(?:'|-[a-zA-ZÀ-ÿœŒæÆ]+)?)/g);

    return tokens.map((token, idx) => {
      // Check if token contains French word letters
      const isWord = /[a-zA-ZÀ-ÿœŒæÆ]/.test(token);

      if (!isWord) {
        return <span key={idx}>{token}</span>;
      }

      // If token starts with l', d', c', s', n', qu', j', m', t'
      // handle word click cleanly
      let cleanWord = token.trim();
      if (/^[ldcsnjmt]'/i.test(cleanWord) && cleanWord.length > 2) {
        // e.g. l'amour -> amour, d'accord -> accord
        const prefix = cleanWord.slice(0, 2);
        const root = cleanWord.slice(2);
        return (
          <span key={idx}>
            <span className="text-stone-400 font-french-serif">{prefix}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onWordClick(root, sentenceText);
              }}
              className={`cursor-pointer rounded-sm px-0.5 transition-all hover:bg-amber-200 hover:text-amber-950 hover:underline decoration-amber-500 decoration-2 ${
                activeWord && activeWord.toLowerCase() === root.toLowerCase()
                  ? 'bg-amber-300 font-bold text-amber-950'
                  : ''
              }`}
            >
              {root}
            </span>
          </span>
        );
      }

      if (/^qu'/i.test(cleanWord) && cleanWord.length > 3) {
        const prefix = cleanWord.slice(0, 3);
        const root = cleanWord.slice(3);
        return (
          <span key={idx}>
            <span className="text-stone-400 font-french-serif">{prefix}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onWordClick(root, sentenceText);
              }}
              className={`cursor-pointer rounded-sm px-0.5 transition-all hover:bg-amber-200 hover:text-amber-950 hover:underline decoration-amber-500 decoration-2 ${
                activeWord && activeWord.toLowerCase() === root.toLowerCase()
                  ? 'bg-amber-300 font-bold text-amber-950'
                  : ''
              }`}
            >
              {root}
            </span>
          </span>
        );
      }

      return (
        <span
          key={idx}
          onClick={(e) => {
            e.stopPropagation();
            onWordClick(cleanWord, sentenceText);
          }}
          className={`cursor-pointer rounded-sm px-0.5 transition-all hover:bg-amber-200 hover:text-amber-950 hover:underline decoration-amber-500 decoration-2 ${
            activeWord && activeWord.toLowerCase() === cleanWord.toLowerCase()
              ? 'bg-amber-300 font-bold text-amber-950'
              : ''
          }`}
        >
          {token}
        </span>
      );
    });
  };

  // Split article content into paragraphs and sentences
  const paragraphs = currentArticle.content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'sm':
        return 'text-base leading-relaxed';
      case 'base':
        return 'text-lg leading-loose';
      case 'lg':
        return 'text-xl leading-loose tracking-wide';
      case 'xl':
        return 'text-2xl leading-loose tracking-wide';
    }
  };

  const getThemeClass = () => {
    switch (theme) {
      case 'parchment':
        return 'bg-[#FAF8F5] text-stone-900 border-amber-900/10';
      case 'white':
        return 'bg-white text-stone-900 border-stone-200 shadow-sm';
      case 'sepia':
        return 'bg-[#F4ECD8] text-[#433422] border-[#E2D2B0]';
      case 'dark':
        return 'bg-stone-900 text-stone-100 border-stone-800';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Top Header & Article Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-stone-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={currentArticle.id}
              onChange={(e) => {
                const found = articles.find((a) => a.id === e.target.value);
                if (found) onSelectArticle(found);
              }}
              className="appearance-none bg-stone-50 hover:bg-stone-100 border border-stone-300 text-stone-900 font-french-serif font-bold text-base py-2 pl-3.5 pr-8 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600 cursor-pointer"
            >
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {cleanArticleTitle(a.title)} ({formatLevel(a.level, i18n.language)})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <span className="text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-900 font-medium">
            {currentArticle.category}
          </span>
        </div>

        {/* Reader Preferences (Font Size & Theme) */}
        <div className="flex items-center gap-3">
          {/* Font size */}
          <div className="flex items-center bg-stone-100 p-1 rounded-lg border border-stone-200">
            {(['sm', 'base', 'lg', 'xl'] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => setFontSize(sz)}
                className={`px-2 py-0.5 text-xs font-semibold rounded-md transition-all ${
                  fontSize === sz
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                {sz.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Color theme */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTheme('parchment')}
              className={`w-5 h-5 rounded-full bg-[#FAF8F5] border-2 transition-all ${
                theme === 'parchment' ? 'border-amber-600 scale-110' : 'border-stone-300'
              }`}
              title={t('reader.themeParchment')}
            />
            <button
              onClick={() => setTheme('white')}
              className={`w-5 h-5 rounded-full bg-white border-2 transition-all ${
                theme === 'white' ? 'border-amber-600 scale-110' : 'border-stone-300'
              }`}
              title={t('reader.themeWhite')}
            />
            <button
              onClick={() => setTheme('sepia')}
              className={`w-5 h-5 rounded-full bg-[#F4ECD8] border-2 transition-all ${
                theme === 'sepia' ? 'border-amber-600 scale-110' : 'border-stone-300'
              }`}
              title={t('reader.themeSepia')}
            />
            <button
              onClick={() => setTheme('dark')}
              className={`w-5 h-5 rounded-full bg-stone-900 border-2 transition-all ${
                theme === 'dark' ? 'border-amber-600 scale-110' : 'border-stone-600'
              }`}
              title={t('reader.themeDark')}
            />
          </div>
        </div>
      </div>

      {/* Collapsible TTS Playback & Speed Adjustment Bar (0.5x - 1.5x) */}
      <div className="rounded-xl bg-white border border-stone-200/90 shadow-2xs overflow-hidden transition-all">
        {/* Compact summary bar (always visible) */}
        <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200/70">
              <Volume2 className={`w-3.5 h-3.5 text-emerald-700 ${playingSentence ? '' : ''}`} />
              <span>{t('reader.ttsConsole')}</span>
            </div>

            {playingSentence ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-600 font-french-serif italic max-w-[220px] sm:max-w-xs truncate">
                  « {playingSentence} »
                </span>
                <button
                  onClick={() => {
                    stopSpeech();
                    setPlayingSentence(null);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-2xs transition-colors"
                >
                  <Square className="w-2.5 h-2.5 fill-white" />
                  <span>{t('reader.stop')}</span>
                </button>
              </div>
            ) : (
              <span className="text-stone-500 font-medium hidden sm:inline">
                {t('reader.tempo')}: <strong className="text-amber-800 font-mono text-sm">{playbackRate.toFixed(2)}x</strong>
                <span className="text-stone-400 font-normal ml-1">
                  {playbackRate <= 0.65 ? t('reader.slowPace') : playbackRate <= 0.85 ? t('reader.shadowingPace') : playbackRate <= 1.05 ? t('reader.normalPace') : t('reader.challengePace')}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Speed Pills in compact bar for convenience */}
            <div className="hidden sm:flex items-center gap-1">
              {[0.75, 1.0].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handlePlaybackRateChange(rate)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-all ${
                    Math.abs(playbackRate - rate) < 0.01
                      ? 'bg-amber-700 text-white font-bold'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                  }`}
                  title={`${rate}x`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Toggle Expand/Collapse Button */}
            <button
              onClick={() => setIsSpeedControlOpen(!isSpeedControlOpen)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-stone-700 font-medium transition-colors cursor-pointer"
              title={isSpeedControlOpen ? t('reader.collapse') : t('reader.speedSlider')}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-800" />
              <span>{isSpeedControlOpen ? t('reader.collapse') : t('reader.speedSlider')}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${isSpeedControlOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Collapsible Expanded Panel with continuous 0.5x - 1.5x slider and presets */}
        {isSpeedControlOpen && (
          <div className="p-4 bg-stone-50/80 border-t border-stone-200/70 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs text-stone-600">
              <span className="font-semibold text-stone-800">
                {t('reader.shadowingSpeedRange')}
              </span>
              <span className="font-mono text-amber-800 font-bold bg-white px-2 py-0.5 rounded border border-stone-200">
                {playbackRate.toFixed(2)}x
              </span>
            </div>

            {/* Continuous Slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-medium text-stone-500 whitespace-nowrap">0.5×</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700 focus:outline-none"
              />
              <span className="text-xs font-mono font-medium text-stone-500 whitespace-nowrap">1.5×</span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2">
              <span className="text-stone-400 text-[11px]">{t('reader.quickPresets')}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handlePlaybackRateChange(rate)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                      Math.abs(playbackRate - rate) < 0.01
                        ? 'bg-amber-700 text-white font-bold shadow-2xs'
                        : 'bg-white hover:bg-stone-200 border border-stone-200 text-stone-700'
                    }`}
                  >
                    {rate.toFixed(rate === 1.0 || rate === 0.5 || rate === 1.5 ? 1 : 2)}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Interactive Helper Banner */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>{t('reader.guideTipTitle')} </strong>
            {t('reader.guideTipDesc')}
          </span>
        </div>
      </div>

      {/* Main Reading Surface */}
      <article
        className={`p-6 sm:p-10 rounded-xl border transition-all ${getThemeClass()}`}
      >
        {/* Article Meta */}
        <header className="mb-8 pb-6 border-b border-stone-200/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-600/15 text-amber-900">
              {formatLevel(currentArticle.level, i18n.language)}
            </span>
            {currentArticle.source && (
              <span className="text-xs text-stone-500">
                {t('reader.source')}: {formatArticleSource(currentArticle.source, i18n.language)}
              </span>
            )}
          </div>
          <h1 className="font-french-serif font-bold text-3xl sm:text-4xl text-stone-900 tracking-tight leading-tight">
            {cleanArticleTitle(currentArticle.title)}
          </h1>
        </header>

        {/* Article Paragraphs */}
        <div className={`space-y-6 font-french-serif ${getFontSizeClass()}`}>
          {paragraphs.map((p, pIdx) => {
            // Split paragraph into sentences by punctuation (. ! ? « » :)
            const sentences = p
              .match(/[^.!?:]+[.!?:]+/g) || [p];

            return (
              <p key={pIdx} className="leading-relaxed">
                {sentences.map((sent, sIdx) => {
                  const cleanSentence = sent.trim();
                  const isHovered = hoveredSentence === cleanSentence;
                  const isActive = activeSentence === cleanSentence;
                  const isPlaying = playingSentence === cleanSentence;

                  return (
                    <span
                      key={sIdx}
                      onMouseEnter={() => setHoveredSentence(cleanSentence)}
                      onMouseLeave={() => setHoveredSentence(null)}
                      className={`relative inline rounded-md py-0.5 px-0.5 transition-colors group ${
                        isActive
                          ? 'bg-amber-200/70 ring-1 ring-amber-400'
                          : isHovered
                          ? 'bg-amber-100/60'
                          : ''
                      }`}
                    >
                      {/* Words in sentence */}
                      {renderSentenceWords(sent)}

                      {/* Hover Tip Floating Pill at sentence end (appears only when hovering/active) */}
                      {(isHovered || isActive || isPlaying) && (
                        <span
                          className="inline-flex items-center gap-1.5 ml-1.5 px-2.5 py-0.5 rounded-full bg-stone-900 text-white border border-stone-700/70 align-middle select-none transition-all animate-in fade-in zoom-in-95 duration-150 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Audio TTS Speak button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlaySentence(cleanSentence);
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-colors font-sans text-xs ${
                              isPlaying
                                ? 'bg-amber-600 text-white font-bold shadow-2xs'
                                : 'hover:bg-stone-800 text-stone-300 hover:text-white'
                            }`}
                            title={isPlaying ? t('reader.stop') : t('reader.readSelectedSentence')}
                          >
                            <Volume2 className={`w-3.5 h-3.5 ${isPlaying ? 'text-amber-200' : 'text-amber-400'}`} />
                            <span>{isPlaying ? t('reader.stop') : t('reader.playSentence')}</span>
                          </button>

                          <span className="w-px h-3 bg-stone-700"></span>

                          {/* Sentence Syntax Breakdown & Shadowing button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSentenceClick(cleanSentence);
                            }}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-amber-300 hover:text-amber-200 hover:bg-stone-800 transition-colors font-sans text-xs font-semibold"
                            title={t('reader.analyzeSentence')}
                          >
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            <span>{t('reader.analyzeSentence')}</span>
                          </button>
                        </span>
                      )}{' '}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      </article>
    </div>
  );
};
