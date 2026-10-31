import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { PhonemeFeedback, PronunciationCorrection } from '../../types';
import { SpeakButton } from '../ui/speak-button';
import { WORK_ON_BELOW, type WordResult } from './WordMarks';

/**
 * The sentence as a marked page: each word once, shown by weight and line style (never colour alone),
 * with the numbers in a reserved detail slot so a tap never adds a row. 80 and 60 are heuristics for
 * the service's 0-100 word score, not a verdict.
 */

const CLOSE_FROM = 60;

export type WordBand = 'clear' | 'close' | 'unclear' | 'omission' | 'insertion';

export function wordBand(item: WordResult): WordBand {
  if (item.errorType === 'Omission') return 'omission';
  if (item.errorType === 'Insertion') return 'insertion';
  const flagged = !!item.errorType && item.errorType !== 'None';
  if (item.accuracyScore === undefined) return flagged ? 'unclear' : 'clear';
  if (item.accuracyScore < CLOSE_FROM) return 'unclear';
  return item.accuracyScore < WORK_ON_BELOW || flagged ? 'close' : 'clear';
}

/** Indexes of the words to practise, skipped first, then the lowest score; extra words are not practice targets. */
export function weakestFirst(words: WordResult[]): number[] {
  const rank = (w: WordResult) => (wordBand(w) === 'omission' ? -1 : (w.accuracyScore ?? 0));
  return words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => ['omission', 'unclear', 'close'].includes(wordBand(w)))
    .sort((a, b) => rank(a.w) - rank(b.w) || a.i - b.i)
    .map(({ i }) => i);
}

const WORD_CLASS: Record<WordBand, string> = {
  clear: 'text-ink-900',
  close: 'font-semibold text-ink-700 underline decoration-2 decoration-ink-700 underline-offset-4',
  unclear: 'font-semibold text-bad-700 underline decoration-double decoration-2 decoration-bad-700 underline-offset-4',
  omission: 'italic text-ink-600 underline decoration-dashed decoration-ink-600 underline-offset-4',
  insertion: 'text-sm italic text-ink-600',
};

const LEGEND: Record<Exclude<WordBand, 'clear'>, string> = {
  close: 'shadowing.band.close',
  unclear: 'shadowing.band.unclear',
  omission: 'shadowing.wordError.Omission',
  insertion: 'shadowing.wordError.Insertion',
};

const STATE_KEY: Record<WordBand, string> = {
  clear: 'shadowing.band.clear',
  close: 'shadowing.band.close',
  unclear: 'shadowing.band.unclear',
  omission: 'shadowing.wordError.Omission',
  insertion: 'shadowing.wordError.Insertion',
};

const shown = (band: WordBand, word: string) =>
  band === 'omission' ? `[${word}]` : band === 'insertion' ? `+${word}` : word;

interface Props {
  words: WordResult[];
  corrections?: PronunciationCorrection[];
  phonemeFeedback?: PhonemeFeedback[];
}

export const AssessmentSentence: React.FC<Props> = ({ words, corrections = [], phonemeFeedback = [] }) => {
  const { t } = useTranslation();
  const [picked, setPicked] = React.useState(() => weakestFirst(words)[0] ?? -1);
  const bands = words.map(wordBand);
  const present = (Object.keys(LEGEND) as (keyof typeof LEGEND)[]).filter((b) => bands.includes(b));

  const word = words[picked];
  const band = bands[picked];
  const same = (a: string) => a.trim().toLowerCase() === word?.word.trim().toLowerCase();
  const correction = word && corrections.find((c) => same(c.word));
  const sounds = word ? phonemeFeedback.filter((p) => same(p.targetWord)) : [];
  // The service's own error type when it gave one without a score; otherwise the band the score falls in.
  const byError = word?.accuracyScore === undefined || band === 'omission' || band === 'insertion';
  const noteKey = !word || band === 'clear' ? null : byError ? word.errorType : band;
  const note = noteKey && t(`shadowing.wordNote.${noteKey}`);

  return (
    <div className="space-y-3">
      <p role="group" aria-label={t('shadowing.wordByWord')} className="font-serif text-lg leading-[2.4] break-words">
        {words.map((w, i) => (
          <React.Fragment key={i}>
            {i > 0 && ' '}
            <button
              type="button"
              aria-pressed={i === picked}
              aria-label={[
                w.word,
                t(STATE_KEY[bands[i]]),
                w.accuracyScore === undefined ? null : t('shadowing.wordScore', { score: w.accuracyScore }),
              ]
                .filter(Boolean)
                .join(', ')}
              onClick={() => setPicked(i)}
              className={cn(
                'cursor-pointer rounded-sm px-1 py-1 align-baseline',
                WORD_CLASS[bands[i]],
                i === picked && 'bg-accent-200 text-ink-900',
              )}
            >
              {shown(bands[i], w.word)}
            </button>
          </React.Fragment>
        ))}
      </p>

      {present.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600" aria-hidden="true">
          {present.map((b) => (
            <span key={b} className={cn('font-serif text-sm', WORD_CLASS[b], b === 'insertion' && 'text-sm')}>
              {shown(b, t(LEGEND[b]))}
            </span>
          ))}
        </p>
      )}

      <div className="min-h-[7.5rem] rounded-md border border-ink-200 bg-surface p-3 space-y-1.5">
        {word ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words">
                <span className="font-serif text-xl text-ink-900">{word.word}</span>
                <span className="ml-2 text-sm text-ink-600">{t(STATE_KEY[band])}</span>
              </p>
              <SpeakButton
                text={word.word}
                label={t('shadowing.hearWord', { word: word.word })}
                stopLabel={t('shadowing.stopSpeaking')}
                variant="outline"
                size="iconSm"
              />
            </div>
            {band !== 'omission' && (
              <p className="text-sm text-ink-800 tnum">
                {word.accuracyScore === undefined
                  ? t('shadowing.noWordScore')
                  : t('shadowing.wordScore', { score: word.accuracyScore })}
              </p>
            )}
            {note && <p className="text-sm text-ink-600">{note}</p>}
            {correction && (
              <p className="text-sm text-ink-800 break-words">
                {correction.expectedIPA && (
                  <span className="mr-1.5 font-mono text-xs text-ink-600">{correction.expectedIPA}</span>
                )}
                {correction.advice}
              </p>
            )}
            {sounds.map((p, i) => (
              <p key={i} className="text-sm text-ink-800 break-words">
                <span className="mr-1.5 rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-xs text-ink-900">
                  {p.phoneme}
                </span>
                {p.tip}
              </p>
            ))}
          </>
        ) : (
          <p className="text-sm text-ink-600">{t('shadowing.pickWord')}</p>
        )}
      </div>
    </div>
  );
};
