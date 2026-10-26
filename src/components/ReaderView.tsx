/** Composes the reader surface and sentence interactions; focused hooks and display components own practice wiring and controls. */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { readerIdentity, type ReaderDocument, type ReaderSource } from '../types/readerSource';
import type { VocabularyWordLookup } from '../services/vocabulary/identity';
import type { PronunciationAssessment } from '../types';
import { usePronunciationMarkers } from '../hooks/usePronunciationMarkers';
import { readerTokens } from '../utils/readerTokens';
import { ReaderWord } from './reader/ReaderWord';
import { PronunciationParagraph } from './reader/PronunciationParagraph';
import { ReaderPreferences } from './reader/ReaderPreferences';
import { ReaderSentenceToolbar } from './reader/ReaderSentenceToolbar';
import { readerFontSizeClass } from './reader/readerFontSizeClass';
import { useReaderPracticeCard } from '../hooks/useReaderPracticeCard';
import { useReaderToolbarPosition } from '../hooks/useReaderToolbarPosition';
import {
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
import { ArticlePlayer } from './ArticlePlayer';
import { BottomDock, dockHeight } from './reader/BottomDock';
import { PracticeCard } from './reader/PracticeCard';
import { SentenceBar } from './reader/SentenceBar';
import { useTouchLayout } from '../hooks/useTouchLayout';
import { useSpeechFailure, useSpeechState, useSpeechPhase } from './ui/speak-button';
import { formatLevel, cleanArticleTitle } from '../utils/i18nHelpers';

interface ReaderViewProps {
  readingDocument: ReaderDocument;
  source: ReaderSource;
  onBack: () => void;
  onWordClick?: VocabularyWordLookup;
  onSentenceClick?: (sentence: string) => void;
  authored?: {
    sentenceIds: string[];
    onWord: (spelling: string, sentenceId: string, ordinal: number) => void;
    onSentence: (sentenceId: string) => void;
  };
  playbackEngine?: 'device';
  afterText?: React.ReactNode;
  onAssessed?: (assessment: PronunciationAssessment, sentence: string) => void;
  onMissingKey: () => void;
  /** Opens Speaking → Recordings at this source. */
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
  authored,
  playbackEngine,
  afterText,
  onAssessed,
  onMissingKey,
  onOpenShadowingLog,
  focusText = null,
  activeWord,
  activeSentence,
}) => {
  const { t, i18n } = useTranslation();
  const sourceId = readerIdentity(source);
  const practise = (sentenceId: string, text: string) => {
    // A graded edition's content is pinned by its version; the snapshot guard in addTake checks it.
    card.open({
      source,
      sentenceId,
      text,
      ...(source.kind === 'passage' ? { passageContent: readingDocument.content } : {}),
    });
  };
  const explain = (id: string, text: string) => (authored ? authored.onSentence(id) : onSentenceClick?.(text));
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

  const { card, cardBusy, cardRef } = useReaderPracticeCard(setIsSpeedControlOpen, onAssessed, playbackEngine);

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
  const clickWord = (word: string, sentenceText: string, id: string, ordinal: number, spelling: string) => {
    focusSentence(id);
    if (authored) return authored.onWord(spelling, id, ordinal);
    if (source.kind === 'graded') return;
    onWordClick?.(word, sentenceText, readingDocument.content, {
      kind: source.kind === 'article' ? 'article' : 'unit',
      id: source.kind === 'article' ? source.articleId : source.unitId,
      title: readingDocument.title,
    });
  };

  const renderSentenceWords = (sentenceText: string, id: string) =>
    readerTokens(sentenceText).map((token) =>
      token.word ? (
        <ReaderWord
          key={token.start}
          token={token.word}
          annotation={markers.mode ? markers.displayed[id]?.words[token.word.ordinal] : undefined}
          layers={markers.layers}
          activeWord={activeWord}
          onClick={(word) => clickWord(word, sentenceText, id, token.word!.ordinal, token.word!.text)}
        />
      ) : (
        <React.Fragment key={token.start}>{token.text}</React.Fragment>
      ),
    );

  // Paragraphs and sentences, cut the same way for reading and for listening.
  const paragraphs = useMemo(() => {
    let index = 0;
    return splitArticle(readingDocument.content).map((paragraph) =>
      paragraph.map((sentence) => ({
        ...sentence,
        id: authored?.sentenceIds[index++] ?? sentence.id,
      })),
    );
  }, [readingDocument.content, authored?.sentenceIds]);
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
  // The extracted hook still returns the same stable ref; preserve the original source-only cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => cardRef.current.close(), [sourceId, readingDocument.content]);
  // A lookup sheet's scrim would cover a running take: end it, keep the card.
  useEffect(() => {
    if (activeWord || activeSentence) cardRef.current.interrupt();
    // The card ref is stable; preserve lookup-only interruption after extraction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const sequence = useSyncExternalStore(subscribeSequence, getSequenceState, getSequenceState);
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
        0,
        playbackEngine,
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

  useReaderToolbarPosition({
    touch,
    actionId,
    fontSize,
    sourceId,
    content: readingDocument.content,
    markerMode: markers.mode,
    displayedMarkers: markers.displayed,
    sentenceEls,
    articleRef,
    setToolbar,
  });

  return (
    <>
      {/* Bottom padding leaves room for the dock (player, practice card), so the last lines can be read above it. */}
      <div
        className="max-w-3xl min-w-0 mx-auto px-4 sm:px-6 pt-6 space-y-4"
        style={{ paddingBottom: 'max(7rem, calc(var(--dock-height, 0px) + 2rem))' }}
      >
        {/* Reading toolbar: one row, article on the left, preferences on the right */}
        <div ref={controlsRef} className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
          <ReaderPreferences
            t={t}
            sourceKind={source.kind}
            onBack={onBack}
            fontSize={fontSize}
            setFontSize={setFontSize}
            toggleListening={toggleListening}
            listening={listening}
            speechPhase={speech.phase}
            isSpeedControlOpen={isSpeedControlOpen}
            setIsSpeedControlOpen={setIsSpeedControlOpen}
            playbackRate={playbackRate}
            handlePlaybackRateChange={handlePlaybackRateChange}
            sourceId={sourceId}
            markers={markers}
            preserveAnchor={preserveAnchor}
          />
        </div>

        {source.kind === 'graded' && <p className="text-xs text-ink-600">{t('gradedReader.deviceVoice')}</p>}
        {/* Main Reading Surface */}
        <article
          ref={articleRef}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('[data-sentence],[data-sentence-actions]')) setHoveredId(null);
          }}
          className={`relative min-w-0 ${source.kind === 'graded' ? 'px-4' : 'px-5'} py-8 sm:px-12 sm:py-12 rounded-lg border border-ink-200 bg-surface text-ink-900`}
        >
          <div className={`reading ${readerFontSizeClass(fontSize)} ${markers.mode ? 'reading-markers' : ''}`}>
            <header className="mb-8">
              <p className="text-xs text-ink-500 font-sans mb-2">
                {formatLevel(readingDocument.level, i18n.language)}
                {readingDocument.category ? ` · ${readingDocument.category}` : ''}
                {readingDocument.source ? ` · ${readingDocument.source}` : ''}
              </p>
              <h1 className="reading-title break-words font-serif font-semibold text-3xl sm:text-4xl leading-tight">
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
            <ReaderSentenceToolbar
              t={t}
              toolbar={toolbar}
              cancelClear={cancelClear}
              scheduleClear={scheduleClear}
              speechActive={toolbarPhase !== 'idle'}
              onExplain={() => explain(toolbar.id, toolbar.text)}
              onPractise={() => practise(toolbar.id, toolbar.text)}
              playbackEngine={playbackEngine}
              explainLabel={authored ? t('gradedReader.translation') : undefined}
              cardBusy={cardBusy}
              practisedId={practisedId}
            />
          )}
        </article>
        {afterText}
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
              onExplain={() => explain(barSentence.id, barSentence.text)}
              onPractise={() => practise(barSentence.id, barSentence.text)}
              playbackEngine={playbackEngine}
              explainLabel={authored ? t('gradedReader.translation') : undefined}
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
