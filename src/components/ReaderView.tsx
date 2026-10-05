import React, { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Volume2, BookOpen, Sparkles, SlidersHorizontal, Eye,
  ArrowLeft, ChevronDown, Type, Bookmark, MessageSquare, PlusCircle, Square, Gauge, TextSearch
} from 'lucide-react';
import { Article, WordAnalysis, SentenceAnalysis } from '../types';
import { speakFrench, stopSpeech, setGlobalRate, getGlobalRate } from '../utils/frenchSpeech';
import { formatLevel, cleanArticleTitle } from '../utils/i18nHelpers';

interface ReaderViewProps {
  currentArticle: Article;
  onBack: () => void;
  onWordClick: (word: string, sentence: string) => void;
  onSentenceClick: (sentence: string) => void;
  activeWord: string | null;
  activeSentence: string | null;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  currentArticle,
  onBack,
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

  // The sentence actions float over the text; they are positioned from the sentence's
  // first line so they never take part in text layout.
  const articleRef = useRef<HTMLElement>(null);
  const sentenceEls = useRef(new Map<string, HTMLElement>());
  const clearTimer = useRef<number | undefined>(undefined);
  const [toolbar, setToolbar] = useState<{ text: string; top: number; left: number } | null>(null);

  const cancelClear = () => window.clearTimeout(clearTimer.current);
  const scheduleClear = () => {
    cancelClear();
    clearTimer.current = window.setTimeout(() => setHoveredSentence(null), 160);
  };

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
  // Tapping a word also keeps that sentence's actions visible once the lookup sheet is closed (touch has no hover).
  const clickWord = (word: string, sentenceText: string) => {
    cancelClear();
    setHoveredSentence(sentenceText.trim());
    onWordClick(word, sentenceText);
  };

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
            <span className="text-ink-500">{prefix}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                clickWord(root, sentenceText);
              }}
              className={`cursor-pointer rounded-sm hover:bg-accent-100 hover:underline decoration-accent-600 underline-offset-4 ${
                activeWord && activeWord.toLowerCase() === root.toLowerCase()
                  ? 'bg-accent-200 text-ink-950'
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
            <span className="text-ink-500">{prefix}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                clickWord(root, sentenceText);
              }}
              className={`cursor-pointer rounded-sm hover:bg-accent-100 hover:underline decoration-accent-600 underline-offset-4 ${
                activeWord && activeWord.toLowerCase() === root.toLowerCase()
                  ? 'bg-accent-200 text-ink-950'
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
            clickWord(cleanWord, sentenceText);
          }}
          className={`cursor-pointer rounded-sm hover:bg-accent-100 hover:underline decoration-accent-600 underline-offset-4 ${
            activeWord && activeWord.toLowerCase() === cleanWord.toLowerCase()
              ? 'bg-accent-200 text-ink-950'
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
        return 'text-[17px]';
      case 'base':
        return 'text-[19px]';
      case 'lg':
        return 'text-[21px]';
      case 'xl':
        return 'text-2xl';
    }
  };

  const getThemeClass = () => {
    switch (theme) {
      case 'parchment':
        return 'bg-ink-50 text-ink-900 border-ink-200';
      case 'white':
        return 'bg-white text-ink-900 border-ink-200';
      case 'sepia':
        return 'bg-[#F4ECD8] text-[#433422] border-[#E2D2B0]';
      case 'dark':
        return 'bg-ink-900 text-ink-100 border-ink-800';
    }
  };

  const toolbarFor = hoveredSentence ?? playingSentence ?? activeSentence;

  useLayoutEffect(() => {
    const place = () => {
      const el = toolbarFor ? sentenceEls.current.get(toolbarFor) : undefined;
      const article = articleRef.current;
      const rects = el?.getClientRects();
      if (!toolbarFor || !el || !article || !rects?.length) {
        setToolbar(null);
        return;
      }
      // Anchor above the sentence's first line so the pill covers the end of the previous line, not the sentence being read.
      const first = rects[0];
      const box = article.getBoundingClientRect();
      setToolbar({
        text: toolbarFor,
        top: first.top - box.top,
        left: Math.min(Math.max(first.left - box.left - 4, 4), box.width - 96),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [toolbarFor, fontSize, theme, currentArticle.id]);

  const themeOptions = [
    { id: 'parchment', label: t('reader.themeParchment'), swatch: 'bg-ink-50' },
    { id: 'white', label: t('reader.themeWhite'), swatch: 'bg-white' },
    { id: 'sepia', label: t('reader.themeSepia'), swatch: 'bg-[#F4ECD8]' },
    { id: 'dark', label: t('reader.themeDark'), swatch: 'bg-ink-900' },
  ] as const;

  const rateButton = (active: boolean) =>
    `h-8 px-2.5 rounded-md text-xs tnum cursor-pointer ${
      active ? 'bg-accent-700 text-white font-medium' : 'text-ink-700 hover:bg-ink-100'
    }`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Reading toolbar: one row, article on the left, preferences on the right */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          onClick={onBack}
          className="mr-auto -ml-2 h-10 inline-flex items-center gap-1.5 px-2 rounded-md text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('library.back')}</span>
        </button>

        <div role="group" aria-label={t('reader.themeParchment')} className="flex items-center gap-1">
          {themeOptions.map((o) => (
            <button
              key={o.id}
              onClick={() => setTheme(o.id)}
              aria-pressed={theme === o.id}
              title={o.label}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-ink-100 cursor-pointer"
            >
              <span className={`h-4 w-4 rounded-full border ${o.swatch} ${theme === o.id ? 'border-accent-600 ring-2 ring-accent-600/30' : 'border-ink-300'}`} />
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-md border border-ink-200 bg-white p-0.5" role="group" aria-label={t('reader.textSize')}>
          {(['sm', 'base', 'lg', 'xl'] as const).map((sz, i) => (
            <button
              key={sz}
              onClick={() => setFontSize(sz)}
              aria-pressed={fontSize === sz}
              aria-label={sz}
              className={`h-8 w-8 rounded-md font-serif cursor-pointer ${
                fontSize === sz ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'
              }`}
              style={{ fontSize: 12 + i * 2.5 }}
            >
              A
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsSpeedControlOpen(!isSpeedControlOpen)}
          aria-expanded={isSpeedControlOpen}
          className="h-10 inline-flex items-center gap-1.5 px-3 rounded-md border border-ink-200 bg-white text-ink-700 hover:bg-ink-100 text-xs cursor-pointer"
          title={t('reader.speedSlider')}
        >
          <Volume2 className="w-4 h-4" />
          <span className="tnum">{playbackRate.toFixed(2)}×</span>
          <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isSpeedControlOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isSpeedControlOpen && (
        <div className="rounded-lg border border-ink-200 bg-white p-4 space-y-3 anim-fade">
          <div className="flex items-center justify-between text-xs text-ink-600">
            <span className="font-medium text-ink-800">{t('reader.shadowingSpeedRange')}</span>
            <span className="text-ink-500">
              {playbackRate <= 0.65 ? t('reader.slowPace') : playbackRate <= 0.85 ? t('reader.shadowingPace') : playbackRate <= 1.05 ? t('reader.normalPace') : t('reader.challengePace')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500 tnum">0.5×</span>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={playbackRate}
              onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
              aria-label={t('reader.tempo')}
              className="flex-1 h-2 cursor-pointer accent-accent-700"
            />
            <span className="text-xs text-ink-500 tnum">1.5×</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
              <button key={rate} onClick={() => handlePlaybackRateChange(rate)} className={rateButton(Math.abs(playbackRate - rate) < 0.01)}>
                {rate}×
              </button>
            ))}
          </div>
        </div>
      )}

      {playingSentence && (
        <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs anim-fade">
          <Volume2 className="w-4 h-4 text-ink-600 shrink-0" />
          <span className="font-serif italic text-ink-700 truncate flex-1">« {playingSentence} »</span>
          <button
            onClick={() => {
              stopSpeech();
              setPlayingSentence(null);
            }}
            className="h-8 inline-flex items-center gap-1 px-2.5 rounded-md bg-accent-700 text-white hover:bg-accent-800 cursor-pointer"
          >
            <Square className="w-2.5 h-2.5 fill-white" />
            <span>{t('reader.stop')}</span>
          </button>
        </div>
      )}

      {/* Main Reading Surface */}
      <article
        ref={articleRef}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('[data-sentence],[data-sentence-actions]')) setHoveredSentence(null);
        }}
        className={`relative px-5 py-8 sm:px-12 sm:py-12 rounded-lg border ${getThemeClass()}`}
      >
        <div className={`reading ${getFontSizeClass()}`}>
        <header className="mb-8">
          <p className="text-xs text-ink-500 font-sans mb-2">
            {formatLevel(currentArticle.level, i18n.language)}
            {currentArticle.category ? ` · ${currentArticle.category}` : ''}
            {currentArticle.source ? ` · ${currentArticle.source}` : ''}
          </p>
          <h1 className="reading-title font-serif font-semibold text-3xl sm:text-4xl leading-tight">
            {cleanArticleTitle(currentArticle.title)}
          </h1>
        </header>

        {/* Article Paragraphs */}
        <div className="space-y-5">
          {paragraphs.map((p, pIdx) => {
            // Split paragraph into sentences by punctuation (. ! ? « » :)
            const sentences = p
              .match(/[^.!?:]+[.!?:]+/g) || [p];

            return (
              <p key={pIdx}>
                {sentences.map((sent, sIdx) => {
                  const cleanSentence = sent.trim();
                  const isHovered = hoveredSentence === cleanSentence;
                  const isActive = activeSentence === cleanSentence;
                  const isPlaying = playingSentence === cleanSentence;

                  return (
                    <span
                      key={sIdx}
                      data-sentence
                      ref={(el) => {
                        if (el) sentenceEls.current.set(cleanSentence, el);
                        else sentenceEls.current.delete(cleanSentence);
                      }}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== 'mouse') return;
                        cancelClear();
                        setHoveredSentence(cleanSentence);
                      }}
                      onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClear()}
                      onClick={() => {
                        cancelClear();
                        setHoveredSentence(cleanSentence);
                      }}
                      className={`rounded-md py-0.5 px-0.5 transition-colors ${
                        isActive ? 'bg-accent-100' : isHovered ? 'bg-accent-50' : ''
                      }`}
                    >
                      {renderSentenceWords(sent)}
                      {' '}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
        </div>

        {/* Floating sentence actions: icons only, outside the text flow */}
        {toolbar && (
          <div
            data-sentence-actions
            onPointerEnter={(e) => e.pointerType === 'mouse' && cancelClear()}
            onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClear()}
            style={{ top: toolbar.top, left: toolbar.left }}
            className="absolute z-10 -translate-y-full pb-1.5 anim-fade"
          >
            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-white border border-ink-300 shadow-lg font-sans text-ink-900">
              <button
                onClick={() => handlePlaySentence(toolbar.text)}
                aria-label={playingSentence === toolbar.text ? t('reader.stop') : t('reader.playSentence')}
                title={playingSentence === toolbar.text ? t('reader.stop') : t('reader.playSentence')}
                className={`h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-md cursor-pointer ${
                  playingSentence === toolbar.text ? 'bg-accent-700 text-white' : 'text-ink-700 hover:bg-ink-100'
                }`}
              >
                {playingSentence === toolbar.text ? <Square className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => onSentenceClick(toolbar.text)}
                aria-label={t('reader.analyzeSentence')}
                title={t('reader.analyzeSentence')}
                className="h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-md text-ink-700 hover:bg-ink-100 cursor-pointer"
              >
                <TextSearch className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
};
