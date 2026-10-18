import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, ArrowLeft, ChevronDown, TextSearch, Headphones, ListChecks, Pause, Play, Mic } from 'lucide-react';
import { readerIdentity, type ReaderDocument, type ReaderSource } from '../types/readerSource';
import { usePronunciationMarkers } from '../hooks/usePronunciationMarkers';
import { readerTokens } from '../utils/readerTokens';
import { ReaderWord } from './reader/ReaderWord';
import { PronunciationParagraph } from './reader/PronunciationParagraph';
import { PronunciationControls } from './reader/PronunciationControls';
import {
  stopSpeech,
  setGlobalRate,
  speechKey,
  startSequence,
  toggleSequence,
  stepSequence,
  stopSequence,
  getSequenceState,
  subscribeSequence,
} from '../utils/speech';
import { splitArticle } from '../utils/sentences';
import { Button, buttonVariants } from './ui/button';
import { Link } from './shell/Link';
import { ArticlePlayer } from './ArticlePlayer';
import { BottomDock, dockHeight } from './reader/BottomDock';
import { PracticeCard } from './reader/PracticeCard';
import { SentenceBar } from './reader/SentenceBar';
import { useTouchLayout } from '../hooks/useTouchLayout';
import { usePracticeCard } from '../hooks/usePracticeCard';
import { SpeakButton, useSpeechFailure, useSpeechState, useSpeechPhase } from './ui/speak-button';
import { formatLevel, cleanArticleTitle } from '../utils/i18nHelpers';

interface ReaderViewProps {
  readingDocument: ReaderDocument;
  source: ReaderSource;
  onBack: () => void;
  onWordClick: (word: string, sentence: string) => void;
  onSentenceClick: (sentence: string) => void;
  onMissingKey: () => void;
  /** Opens My study → Shadowing at this source. */
  onOpenShadowingLog: (sourceId: string) => void;
  /** Sentence text to bring into view on opening (from the shadowing log). */
  focusText?: string | null;
  activeWord: string | null;
  activeSentence: string | null;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  readingDocument,
  source,
  onBack,
  onWordClick,
  onSentenceClick,
  onMissingKey,
  onOpenShadowingLog,
  focusText = null,
  activeWord,
  activeSentence,
}) => {
  const { t, i18n } = useTranslation();
  const sourceId = readerIdentity(source);
  const target = (sentenceId: string, text: string) => ({
    source,
    sentenceId,
    text,
    ...(source.kind === 'passage' ? { passageContent: readingDocument.content } : {}),
  });
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
  const [toolbar, setToolbar] = useState<{ id: string; text: string; top: number; left: number } | null>(null);

  const cancelClear = () => window.clearTimeout(clearTimer.current);
  const scheduleClear = () => {
    cancelClear();
    clearTimer.current = window.setTimeout(() => setHoveredId(null), 200);
  };
  const focusSentence = (id: string) => {
    cancelClear();
    setHoveredId(id);
    setAnchorId(id);
    setDismissedId(null);
  };
  // Touch screens dock the sentence actions at the bottom instead of floating them over the text.
  const touch = useTouchLayout();
  // The docked actions' close button hides them for that sentence until another is chosen.
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  // Playback rate (0.5x to 1.5x), shared with every speak button.
  const [playbackRate, setPlaybackRate] = useState<number>(0.85);
  const [isSpeedControlOpen, setIsSpeedControlOpen] = useState<boolean>(false);
  const controlsRef = useRef<HTMLDivElement>(null);

  // Playback is shown on the sentence itself (highlight) and on its toolbar button, never in a bar that
  // would push the article down. Escape stops it, and leaving the article does too.
  const speech = useSpeechState();
  const playingKey = speech.phase !== 'idle' ? speech.key : null;

  // Practising one sentence: recording happens in the docked card, never on the pill.
  const card = usePracticeCard();
  const cardBusy =
    card.phase === 'acquiring' || card.phase === 'recording' || card.phase === 'saving' || card.phase === 'unsaved';
  const cardRef = useRef(card);
  useLayoutEffect(() => {
    cardRef.current = card;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // One owner, outermost first: an open sheet handles its own Escape; then the card; then speech.
      if (document.querySelector('[aria-modal="true"]')) return;
      const practice = cardRef.current;
      if (practice.phase !== 'closed') {
        if (practice.phase !== 'unsaved') practice.close();
        return;
      }
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

  const renderSentenceWords = (sentenceText: string, id: string) =>
    readerTokens(sentenceText).map((token) =>
      token.word ? (
        <ReaderWord
          key={token.start}
          token={token.word}
          annotation={markers.mode ? markers.displayed[id]?.words[token.word.ordinal] : undefined}
          decorating={markers.mode}
          layers={markers.layers}
          activeWord={activeWord}
          onClick={(word) => clickWord(word, sentenceText, id)}
        />
      ) : (
        <React.Fragment key={token.start}>{token.text}</React.Fragment>
      ),
    );

  // Paragraphs and sentences, cut the same way for reading and for listening.
  const paragraphs = useMemo(() => splitArticle(readingDocument.content), [readingDocument.content]);
  const flatSentences = useMemo(() => paragraphs.flat(), [paragraphs]);
  const markers = usePronunciationMarkers(
    source.kind === 'article' ? source.articleId : sourceId,
    readingDocument.content,
    flatSentences,
    onMissingKey,
  );
  const readingAnchor = useRef<{ id: string; top: number } | null>(null);
  const preserveAnchor = (apply: () => void) => {
    const entry = [...sentenceEls.current.entries()].find(([, { el }]) => {
      const box = el.getBoundingClientRect();
      return box.bottom > 72 && box.top < window.innerHeight;
    });
    readingAnchor.current = entry ? { id: entry[0], top: entry[1].el.getBoundingClientRect().top } : null;
    apply();
  };
  useLayoutEffect(() => {
    const anchor = readingAnchor.current;
    readingAnchor.current = null;
    if (!anchor) return;
    const el = sentenceEls.current.get(anchor.id)?.el;
    if (el) window.scrollBy({ top: el.getBoundingClientRect().top - anchor.top, behavior: 'instant' });
  }, [markers.mode, markers.displayed]);

  // Changing the source or its text, or leaving the reader, closes the card.
  useEffect(() => () => cardRef.current.close(), [sourceId, readingDocument.content]);
  // A lookup sheet's scrim would cover a running take: end it, keep the card.
  useEffect(() => {
    if (activeWord || activeSentence) cardRef.current.interrupt();
  }, [activeWord, activeSentence]);
  // The practised sentence stays clear of the dock.
  const practisedId = card.target?.sentenceId ?? null;
  useEffect(() => {
    if (!practisedId) return;
    const frame = requestAnimationFrame(() => {
      const el = sentenceEls.current.get(practisedId)?.el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight - dockHeight() - 16 || r.top < 72) {
        window.scrollBy({ top: r.bottom - (window.innerHeight - dockHeight() - 24), behavior: 'instant' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [practisedId, card.phase]);
  // Closing the card returns focus to the practised sentence's record button.
  const lastTarget = useRef<string | null>(null);
  useEffect(() => {
    if (practisedId) {
      lastTarget.current = practisedId;
      return;
    }
    const id = lastTarget.current;
    lastTarget.current = null;
    const active = document.activeElement;
    if (!id || (active && active !== document.body && !active.closest('[data-practice-card]') && active.isConnected))
      return;
    focusSentence(id);
    requestAnimationFrame(() =>
      (document.querySelector('[data-practice-entry]') as HTMLElement | null)?.focus({ preventScroll: true }),
    );
  }, [practisedId]);

  // Opened from the shadowing log: show that sentence with its actions.
  useEffect(() => {
    if (!focusText) return;
    const entry = [...sentenceEls.current.entries()].find(([, v]) => v.key === speechKey(focusText));
    if (!entry) return;
    entry[1].el.scrollIntoView({ block: 'center', behavior: 'instant' });
    focusSentence(entry[0]);
  }, [focusText, sourceId]);

  // Listening to the whole article: one sentence after another, the current one highlighted.
  const sequence = useSyncExternalStore(subscribeSequence, getSequenceState);
  const listening = sequence.id === sourceId;
  const listeningId = listening ? (flatSentences[sequence.index]?.id ?? null) : null;
  // Why the sentence being read could not be played, so the player can say it instead of a generic line.
  const sequenceFailure = useSpeechFailure(listening ? (flatSentences[sequence.index]?.text ?? '') : '');

  const toggleListening = () => {
    if (listening) toggleSequence();
    else
      startSequence(
        sourceId,
        flatSentences.map((s) => s.text),
      );
  };

  // Keep the sentence being read on screen, clear of the header and the player.
  useEffect(() => {
    if (!listeningId) return;
    const el = sentenceEls.current.get(listeningId)?.el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 72 || r.bottom > window.innerHeight - Math.max(112, dockHeight() + 16)) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [listeningId]);

  // Changing the source or its text, or leaving the reader, ends listening.
  useEffect(() => () => stopSequence(), [sourceId, readingDocument.content]);

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
  // While listening the pill does not chase the voice; it stays with what the reader points at.
  const activeKey = (listening ? null : playingKey) ?? (activeSentence ? speechKey(activeSentence) : null);
  // Which sentence the actions belong to: the hovered or tapped one, else the active one.
  const actionId = useMemo(() => {
    if (hoveredId) return hoveredId;
    if (!activeKey) return null;
    const anchor = anchorId ? flatSentences.find((s) => s.id === anchorId) : undefined;
    if (anchor && speechKey(anchor.text) === activeKey) return anchor.id;
    return flatSentences.find((s) => speechKey(s.text) === activeKey)?.id ?? null;
  }, [hoveredId, anchorId, activeKey, flatSentences]);
  const barSentence =
    touch && actionId && actionId !== dismissedId && actionId !== practisedId
      ? (flatSentences.find((s) => s.id === actionId) ?? null)
      : null;
  // The docked actions must not cover the sentence they act on.
  useEffect(() => {
    if (!barSentence) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const r = sentenceEls.current.get(barSentence.id)?.el.getBoundingClientRect();
        const limit = window.innerHeight - dockHeight() - 16;
        if (r && r.bottom > limit) window.scrollBy({ top: r.bottom - limit, behavior: 'instant' });
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [barSentence]);

  // Phase of the sentence the pill is showing, so its own button can theme itself (hooks cannot be conditional).
  const toolbarPhase = useSpeechPhase(toolbar?.text ?? '');

  useLayoutEffect(() => {
    const NAV = 56; // sticky header
    // Measured pill size: three h-7 buttons, a divider, gap-0.5, p-1 padding and border = 101 x 38,
    // plus an 8px invisible lead-in on its left.
    const TOOLBAR_WIDTH = 101;
    const TOOLBAR_HEIGHT = 38;
    const LEAD = 8;
    let frame = 0;

    const place = () => {
      const id = touch ? null : actionId;
      const target = id ? sentenceEls.current.get(id) : undefined;
      const article = articleRef.current;
      const vh = window.innerHeight;
      // Only lines that are on screen can carry the toolbar.
      const lines = target ? [...target.el.getClientRects()].filter((r) => r.bottom > NAV && r.top < vh) : [];
      if (!target || !article || !lines.length) {
        setToolbar((prev) => (prev ? null : prev));
        return;
      }
      // The pill sits on the sentence's last visible line, right after its final character, so the pointer
      // reaches it by moving along that line and never crosses another sentence (which would retarget the
      // pill). It is centred on the line and no taller than the line pitch, so it covers no other line.
      const lastLine = lines[lines.length - 1];
      const box = article.getBoundingClientRect();
      const top = (lastLine.top + lastLine.bottom) / 2 - TOOLBAR_HEIGHT / 2 - box.top;
      // The invisible lead-in overlaps the sentence end, so there is no gap to cross; when the sentence ends
      // too near the column edge, the pill moves left over the sentence's own last words instead.
      const left = Math.min(lastLine.right - box.left - LEAD + 2, box.width - TOOLBAR_WIDTH - LEAD - 6);

      const next = {
        id: id!,
        text: target.text,
        top,
        left,
      };
      setToolbar((prev) =>
        prev &&
        prev.id === next.id &&
        prev.text === next.text &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.left - next.left) < 0.5
          ? prev
          : next,
      );
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    place();
    const observer = new ResizeObserver(schedule);
    if (articleRef.current) observer.observe(articleRef.current);
    document.fonts.addEventListener('loadingdone', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
    };
  }, [touch, actionId, fontSize, sourceId, readingDocument.content, markers.mode, markers.displayed]);

  const toolbarButton = (active: boolean) =>
    active ? 'bg-accent-700 text-on-fill hover:bg-accent-800' : 'text-ink-700 hover:text-ink-950 hover:bg-ink-100';

  const rateButton = (active: boolean) =>
    `h-8 px-2.5 rounded-md text-xs tnum cursor-pointer ${
      active ? 'bg-accent-700 text-on-fill font-medium' : 'text-ink-700 hover:bg-ink-100'
    }`;

  return (
    <>
      {/* Bottom padding leaves room for the dock (player, practice card), so the last lines can be read above it. */}
      <div
        className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 space-y-4"
        style={{ paddingBottom: 'max(7rem, calc(var(--dock-height, 0px) + 2rem))' }}
      >
        {/* Reading toolbar: one row, article on the left, preferences on the right */}
        <div ref={controlsRef} className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={onBack}
            className="mr-auto -ml-2 h-10 inline-flex items-center gap-1.5 px-2 rounded-md text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t(source.kind === 'passage' ? 'reader.backToUnit' : 'library.back')}</span>
          </button>

          <div
            className="flex items-center rounded-md border border-ink-200 bg-surface p-0.5"
            role="group"
            aria-label={t('reader.textSize')}
          >
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

          <Button variant="outline" onClick={toggleListening} aria-pressed={listening} title={t('reader.listenAll')}>
            {listening && (speech.phase === 'playing' || speech.phase === 'loading') ? (
              <Pause className="w-4 h-4" aria-hidden="true" />
            ) : listening ? (
              <Play className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Headphones className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{t('reader.listenAll')}</span>
          </Button>

          {source.kind === 'article' && (
            <Link
              to={{ name: 'practice', articleId: source.articleId }}
              className={buttonVariants({ variant: 'outline' })}
              title={t('reader.makeExercisesHint')}
            >
              <ListChecks className="w-4 h-4" aria-hidden="true" />
              <span>{t('reader.makeExercises')}</span>
            </Link>
          )}

          <button
            onClick={() => setIsSpeedControlOpen(!isSpeedControlOpen)}
            aria-expanded={isSpeedControlOpen}
            className="h-10 inline-flex items-center gap-1.5 px-3 rounded-md border border-ink-200 bg-surface text-ink-700 hover:bg-ink-100 text-xs cursor-pointer"
            title={t('reader.speedSlider')}
          >
            <Volume2 className="w-4 h-4" />
            <span className="tnum">{playbackRate.toFixed(2)}×</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isSpeedControlOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <PronunciationControls
            key={sourceId}
            controller={markers}
            onDisplay={() => preserveAnchor(markers.display)}
            onMode={(marked) => preserveAnchor(() => markers.setMode(marked))}
            onOpen={() => setIsSpeedControlOpen(false)}
          />

          {/* Floats over the article so opening it never moves the text */}
          {isSpeedControlOpen && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-ink-200 bg-surface p-4 space-y-3 shadow-lg anim-fade">
              <div className="flex items-center justify-between text-xs text-ink-600">
                <span className="font-medium text-ink-800">{t('reader.shadowingSpeedRange')}</span>
                <span className="text-ink-500">
                  {playbackRate <= 0.65
                    ? t('reader.slowPace')
                    : playbackRate <= 0.85
                      ? t('reader.shadowingPace')
                      : playbackRate <= 1.05
                        ? t('reader.normalPace')
                        : t('reader.challengePace')}
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
                  <button
                    key={rate}
                    onClick={() => handlePlaybackRateChange(rate)}
                    className={rateButton(Math.abs(playbackRate - rate) < 0.01)}
                  >
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
          <div className={`reading ${getFontSizeClass()} ${markers.mode ? 'reading-markers' : ''}`}>
            <header className="mb-8">
              <p className="text-xs text-ink-500 font-sans mb-2">
                {formatLevel(readingDocument.level, i18n.language)}
                {readingDocument.category ? ` · ${readingDocument.category}` : ''}
                {readingDocument.source ? ` · ${readingDocument.source}` : ''}
              </p>
              <h1 className="reading-title font-serif font-semibold text-3xl sm:text-4xl leading-tight">
                {cleanArticleTitle(readingDocument.title)}
              </h1>
            </header>

            {/* Article Paragraphs */}
            <div className="space-y-5">
              {paragraphs.map((sentences, pIdx) => {
                return (
                  <PronunciationParagraph
                    key={pIdx}
                    snapshot={markers.displayed}
                    sentenceIds={sentences.map((s) => s.id)}
                    layers={markers.layers}
                    enabled={markers.mode}
                    fontSize={fontSize}
                  >
                    {sentences.map(({ id, raw: sent, text: cleanSentence }) => {
                      const isHovered = hoveredId === id;
                      const key = speechKey(cleanSentence);
                      const isActive = activeSentence === cleanSentence;
                      // While listening, the position decides (the same sentence can repeat); otherwise the text.
                      const isPlaying = listening ? listeningId === id : playingKey === key;

                      return (
                        <span
                          key={id}
                          data-sentence
                          data-sentence-id={id}
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
                          onFocus={() => focusSentence(id)}
                          className={`rounded-md py-0.5 px-0.5 transition-colors ${
                            isActive || isPlaying || practisedId === id
                              ? 'bg-accent-100'
                              : isHovered
                                ? 'bg-accent-50'
                                : ''
                          }`}
                        >
                          {renderSentenceWords(sent, id)}
                        </span>
                      );
                    })}
                  </PronunciationParagraph>
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
              className="absolute z-20 pl-2 anim-fade select-none"
            >
              <div className="flex items-center gap-0.5 p-1 rounded-lg border border-ink-300 bg-surface text-ink-900 shadow-lg font-sans text-xs">
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
                <button
                  data-practice-entry
                  onClick={() => card.open(target(toolbar.id, toolbar.text))}
                  disabled={cardBusy}
                  aria-label={cardBusy ? t('practiceCard.finishFirst') : t('practiceCard.open')}
                  title={cardBusy ? t('practiceCard.finishFirst') : t('practiceCard.open')}
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toolbarButton(practisedId === toolbar.id)}`}
                >
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </article>
      </div>

      {/* Outside the spaced column: as its last child it would add a margin to the article. */}
      {(listening || card.phase !== 'closed' || barSentence) && (
        <BottomDock>
          {card.phase !== 'closed' && (
            <PracticeCard card={card} movable={!touch} onOpenLog={() => onOpenShadowingLog(sourceId)} />
          )}
          {barSentence && (
            <SentenceBar
              text={barSentence.text}
              practiseBlocked={cardBusy}
              onExplain={() => onSentenceClick(barSentence.text)}
              onPractise={() => card.open(target(barSentence.id, barSentence.text))}
              onDismiss={() => setDismissedId(barSentence.id)}
            />
          )}
          {listening && (
            <ArticlePlayer
              index={sequence.index}
              total={sequence.total}
              phase={speech.phase}
              failed={sequence.failed}
              reason={sequence.failed ? sequenceFailure : null}
              onToggle={toggleSequence}
              onStep={stepSequence}
              onStop={stopSequence}
            />
          )}
        </BottomDock>
      )}
    </>
  );
};
