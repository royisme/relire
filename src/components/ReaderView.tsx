import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, ArrowLeft, ChevronDown, TextSearch } from 'lucide-react';
import { Article, WordAnalysis, SentenceAnalysis } from '../types';
import { stopSpeech, setGlobalRate, speechKey } from '../utils/speech';
import { SpeakButton, useSpeechState, useSpeechPhase } from './ui/speak-button';
import { formatLevel, cleanArticleTitle } from '../utils/i18nHelpers';
import { useTheme } from '../theme/useTheme';
import { ThemeSwatch } from './ui/theme-swatch';

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
  const { preference: themePref, setPreference: setThemePref } = useTheme();
  // Reading preferences
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('lg');
  // Sentences are identified by position, not text, because the same sentence can repeat ("Oui.").
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // The sentence actions float over the text; they are positioned from the sentence's
  // first line so they never take part in text layout.
  const articleRef = useRef<HTMLElement>(null);
  const sentenceEls = useRef(new Map<string, { el: HTMLElement; text: string; key: string }>());
  const clearTimer = useRef<number | undefined>(undefined);
  const [toolbar, setToolbar] = useState<{ text: string; top: number; left: number } | null>(null);

  const cancelClear = () => window.clearTimeout(clearTimer.current);
  const scheduleClear = () => {
    cancelClear();
    clearTimer.current = window.setTimeout(() => setHoveredId(null), 200);
  };
  const focusSentence = (id: string) => {
    cancelClear();
    setHoveredId(id);
    setAnchorId(id);
  };

  // Playback rate (0.5x to 1.5x), shared with every speak button.
  const [playbackRate, setPlaybackRate] = useState<number>(0.85);
  const [isSpeedControlOpen, setIsSpeedControlOpen] = useState<boolean>(false);
  const controlsRef = useRef<HTMLDivElement>(null);

  // Playback is shown on the sentence itself (highlight) and on its toolbar button, never in a bar that
  // would push the article down. Escape stops it, and leaving the article does too.
  const speech = useSpeechState();
  const playingKey = speech.phase !== 'idle' ? speech.key : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      stopSpeech();
      setIsSpeedControlOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopSpeech();
    };
  }, []);

  // The speed panel floats over the article; a tap outside it closes it.
  useEffect(() => {
    if (!isSpeedControlOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!controlsRef.current?.contains(e.target as Node)) setIsSpeedControlOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [isSpeedControlOpen]);

  const handlePlaybackRateChange = (newRate: number) => {
    setPlaybackRate(newRate);
    setGlobalRate(newRate);
  };

  // Helper to tokenize sentence into clickable words
  // Tapping a word also keeps that sentence's actions visible once the lookup sheet is closed (touch has no hover).
  const clickWord = (word: string, sentenceText: string, id: string) => {
    focusSentence(id);
    onWordClick(word, sentenceText);
  };

  const renderSentenceWords = (sentenceText: string, id: string) => {
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
                clickWord(root, sentenceText, id);
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
                clickWord(root, sentenceText, id);
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
            clickWord(cleanWord, sentenceText, id);
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

  // Which sentence the actions belong to when nothing is hovered: the one playing, else the one open in the drawer.
  const activeKey = playingKey ?? (activeSentence ? speechKey(activeSentence) : null);
  // Phase of the sentence the pill is showing, so its own button can theme itself (hooks cannot be conditional).
  const toolbarPhase = useSpeechPhase(toolbar?.text ?? '');

  useLayoutEffect(() => {
    const NAV = 56; // sticky header
    // Measured pill size: h-7 buttons + p-1 padding + border (+ pt-1 on the wrapper) = 71 x 42.
    const TOOLBAR_WIDTH = 71;
    const TOOLBAR_HEIGHT = 42;
    let frame = 0;

    const place = () => {
      // Which sentence the actions belong to: the hovered one, else the active one.
      let id = hoveredId;
      if (!id && activeKey) {
        const entries = [...sentenceEls.current.entries()];
        id =
          (anchorId && sentenceEls.current.get(anchorId)?.key === activeKey ? anchorId : null) ??
          entries.find(([, v]) => v.key === activeKey)?.[0] ??
          null;
      }
      const target = id ? sentenceEls.current.get(id) : undefined;
      const article = articleRef.current;
      const vh = window.innerHeight;
      // Only lines that are on screen can carry the toolbar.
      const lines = target ? [...target.el.getClientRects()].filter((r) => r.bottom > NAV && r.top < vh) : [];
      if (!target || !article || !lines.length) {
        setToolbar((prev) => (prev ? null : prev));
        return;
      }
      // Anchor the pill to the end of the sentence: the last visible line of the sentence
      const lastLine = lines[lines.length - 1];
      const box = article.getBoundingClientRect();

      // Vertical: appear directly below the sentence end, covering subsequent text as expected.
      // If near the bottom of the viewport, flip above the line.
      let top = lastLine.bottom + 2 - box.top;
      if (lastLine.bottom + 2 + TOOLBAR_HEIGHT > vh - 8) {
        top = Math.max(lastLine.top - TOOLBAR_HEIGHT - 4 - box.top, 8);
      }

      // Horizontal: start near the end of the sentence (lastLine.right)
      const endX = lastLine.right - box.left;
      const left = Math.min(
        Math.max(endX - 4, 8),
        box.width - TOOLBAR_WIDTH - 8
      );

      const next = {
        text: target.text,
        top,
        left,
      };
      setToolbar((prev) =>
        prev && prev.text === next.text && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 ? prev : next
      );
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
    };
  }, [hoveredId, anchorId, activeKey, fontSize, currentArticle.id]);

  // The reader's swatches set the app theme; the article follows it like every other surface.
  const readerThemes = ['light', 'sepia', 'dark'] as const;

  const toolbarButton = (active: boolean) =>
    active ? 'bg-accent-700 text-on-fill hover:bg-accent-800' : 'text-ink-700 hover:text-ink-950 hover:bg-ink-100';

  const rateButton = (active: boolean) =>
    `h-8 px-2.5 rounded-md text-xs tnum cursor-pointer ${
      active ? 'bg-accent-700 text-on-fill font-medium' : 'text-ink-700 hover:bg-ink-100'
    }`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Reading toolbar: one row, article on the left, preferences on the right */}
      <div ref={controlsRef} className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          onClick={onBack}
          className="mr-auto -ml-2 h-10 inline-flex items-center gap-1.5 px-2 rounded-md text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('library.back')}</span>
        </button>

        <div role="group" aria-label={t('theme.label')} className="flex items-center gap-1">
          {readerThemes.map((id) => {
            const active = themePref === id;
            return (
              <button
                key={id}
                onClick={() => setThemePref(id)}
                aria-pressed={active}
                aria-label={t(`theme.${id}`)}
                title={t(`theme.${id}`)}
                className={`h-8 w-8 inline-flex items-center justify-center rounded-md cursor-pointer ${active ? 'bg-ink-100' : 'hover:bg-ink-100'}`}
              >
                <ThemeSwatch theme={id} />
              </button>
            );
          })}
        </div>

        <div className="flex items-center rounded-md border border-ink-200 bg-surface p-0.5" role="group" aria-label={t('reader.textSize')}>
          {(['sm', 'base', 'lg', 'xl'] as const).map((sz, i) => (
            <button
              key={sz}
              onClick={() => setFontSize(sz)}
              aria-pressed={fontSize === sz}
              aria-label={sz}
              className={`h-8 w-8 rounded-md font-serif cursor-pointer ${
                fontSize === sz ? 'bg-ink-100 text-ink-950' : 'text-ink-600 hover:bg-ink-100'
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
          className="h-10 inline-flex items-center gap-1.5 px-3 rounded-md border border-ink-200 bg-surface text-ink-700 hover:bg-ink-100 text-xs cursor-pointer"
          title={t('reader.speedSlider')}
        >
          <Volume2 className="w-4 h-4" />
          <span className="tnum">{playbackRate.toFixed(2)}×</span>
          <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isSpeedControlOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Floats over the article so opening it never moves the text */}
        {isSpeedControlOpen && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-ink-200 bg-surface p-4 space-y-3 shadow-lg anim-fade">
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
      </div>

      {/* Main Reading Surface */}
      <article
        ref={articleRef}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('[data-sentence],[data-sentence-actions]')) setHoveredId(null);
        }}
        className="relative px-5 py-8 sm:px-12 sm:py-12 rounded-lg border border-ink-200 bg-surface text-ink-900"
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
                  const id = `${pIdx}-${sIdx}`;
                  const isHovered = hoveredId === id;
                  const key = speechKey(cleanSentence);
                  const isActive = activeSentence === cleanSentence;
                  const isPlaying = playingKey === key;

                  return (
                    <span
                      key={sIdx}
                      data-sentence
                      ref={(el) => {
                        if (el) sentenceEls.current.set(id, { el, text: cleanSentence, key });
                        else sentenceEls.current.delete(id);
                      }}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== 'mouse') return;
                        focusSentence(id);
                      }}
                      onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClear()}
                      onClick={() => focusSentence(id)}
                      className={`rounded-md py-0.5 px-0.5 transition-colors ${
                        isActive || isPlaying ? 'bg-accent-100' : isHovered ? 'bg-accent-50' : ''
                      }`}
                    >
                      {renderSentenceWords(sent, id)}
                      {' '}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
        </div>

        {/* Floating sentence actions: compact pill at the end of the sentence */}
        {toolbar && (
          <div
            data-sentence-actions
            onPointerEnter={(e) => e.pointerType === 'mouse' && cancelClear()}
            onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClear()}
            style={{ top: toolbar.top, left: toolbar.left }}
            className="absolute z-20 pt-1 anim-fade select-none"
          >
            <div
              className="flex items-center gap-0.5 p-1 rounded-lg border border-ink-300 bg-surface text-ink-900 shadow-lg font-sans text-xs"
            >
              <SpeakButton
                text={toolbar.text}
                label={t('reader.playSentence')}
                stopLabel={t('reader.stop')}
                variant="ghost"
                size="icon"
                className={`h-7 w-7 transition-colors ${toolbarButton(toolbarPhase !== 'idle')}`}
              />
              <div className="w-px h-3.5 bg-ink-200" />
              <button
                onClick={() => onSentenceClick(toolbar.text)}
                aria-label={t('reader.analyzeSentence')}
                title={t('reader.analyzeSentence')}
                className={`h-7 w-7 inline-flex items-center justify-center rounded-md cursor-pointer transition-colors ${toolbarButton(false)}`}
              >
                <TextSearch className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
};
