import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck, CircleDot, Mic } from 'lucide-react';
import { PronunciationAssessment, PhonemeFeedback } from '../../types';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { AssessmentScores } from './AssessmentScores';
import { AssessmentSentence, weakestFirst, wordBand } from './AssessmentSentence';

/**
 * The score and feedback for one read-aloud attempt, laid out as a marked page of your own reading.
 * Only what a provider returned is drawn: a missing score, list or paragraph leaves no row, no
 * heading and no gap. Every text block wraps; nothing here has a fixed width.
 */

const STATUS_ICON: Record<PhonemeFeedback['status'], { Icon: typeof CircleCheck; tone: string }> = {
  excellent: { Icon: CircleCheck, tone: 'text-ok-800' },
  acceptable: { Icon: CircleDot, tone: 'text-ink-500' },
  needs_work: { Icon: CircleAlert, tone: 'text-bad-700' },
};

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h5 className="text-xs font-medium text-ink-500">{children}</h5>
);

export const AssessmentResult: React.FC<{
  assessment: PronunciationAssessment;
  /** Draws the primary "Record again" button; callers that already have one leave it out. */
  onRetry?: () => void;
}> = ({ assessment, onRetry }) => {
  const { t } = useTranslation();
  const words = assessment.wordResults ?? [];
  const shownWords = new Set(words.map((w) => w.word.trim().toLowerCase()));
  const unmatched = (word: string) => !shownWords.has(word.trim().toLowerCase());
  const corrections = (assessment.corrections ?? []).filter((c) => unmatched(c.word));
  const sounds = (assessment.phonemeFeedback ?? []).filter((p) => unmatched(p.targetWord));
  const strengths = assessment.strengths ?? [];
  const textRows = [
    { label: t('shadowing.liaisons'), text: assessment.liaisonFeedback },
    { label: t('shadowing.intonation'), text: assessment.intonationFeedback },
  ].filter((r) => r.text);
  const hasDetail =
    words.length > 0 ||
    corrections.length > 0 ||
    sounds.length > 0 ||
    strengths.length > 0 ||
    textRows.length > 0 ||
    !!assessment.coachingNotes;

  const bands = words.map(wordBand);
  const weak = bands.filter((b) => b === 'close' || b === 'unclear').length;
  const skipped = bands.filter((b) => b === 'omission').length;
  const extra = bands.filter((b) => b === 'insertion').length;
  const counts = [
    skipped > 0 && t('shadowing.summary.skipped', { count: skipped }),
    extra > 0 && t('shadowing.summary.extra', { count: extra }),
  ].filter(Boolean);
  const start = [...new Set(weakestFirst(words).map((i) => words[i].word))].slice(0, 3);
  const sentence =
    assessment.referenceText ??
    words
      .filter((_, i) => bands[i] !== 'insertion')
      .map((w) => w.word)
      .join(' ');

  return (
    <div className="mx-auto max-w-xl rounded-lg border border-ink-200 bg-ink-50 p-4 sm:p-5 space-y-6">
      <div className="space-y-1">
        <h4 className="font-serif text-xl text-ink-900">{t('shadowing.yourReading')}</h4>
        {words.length > 0 && (
          <p className="text-sm text-ink-800">
            {weak > 0 && t('shadowing.summary.some', { count: weak, total: words.length - extra })}
            {weak + skipped + extra === 0 && t('shadowing.summary.allClear')}
            {counts.length > 0 && <span className={weak > 0 ? 'block text-ink-600' : ''}>{counts.join(' · ')}</span>}
          </p>
        )}
        <p className="text-xs text-ink-500">{t('shadowing.estimate')}</p>
      </div>

      <AssessmentScores assessment={assessment} />

      {words.length > 0 && (
        <section className="space-y-2">
          <Heading>{t('shadowing.wordByWord')}</Heading>
          <AssessmentSentence
            words={words}
            corrections={assessment.corrections}
            phonemeFeedback={assessment.phonemeFeedback}
          />
        </section>
      )}

      {words.length > 0 && (
        <section className="space-y-3">
          <Heading>{t('shadowing.next')}</Heading>
          {start.length > 0 && (
            <p className="text-sm text-ink-800 break-words">{t('shadowing.startWith', { words: start.join(', ') })}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {onRetry && (
              <Button onClick={onRetry}>
                <Mic className="w-4 h-4" aria-hidden="true" />
                <span>{t('shadowing.recordAgain')}</span>
              </Button>
            )}
            <SpeakButton
              text={sentence}
              label={t('shadowing.hearSentence')}
              stopLabel={t('shadowing.stopSpeaking')}
              variant="outline"
              showLabel
            />
          </div>
        </section>
      )}

      {strengths.length > 0 && (
        <section className="space-y-1.5">
          <Heading>{t('shadowing.strengths')}</Heading>
          <ul className="space-y-1 text-sm text-ink-800">
            {strengths.map((s, i) => (
              <li key={i} className="break-words">
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {corrections.length > 0 && (
        <section className="space-y-2">
          <Heading>{t('shadowing.words')}</Heading>
          <ul className="space-y-2">
            {corrections.map((c, i) => (
              <li key={i} className="text-sm text-ink-800 break-words">
                <span className="font-serif font-semibold text-ink-900">« {c.word} »</span>
                {c.expectedIPA && <span className="ml-1.5 font-mono text-xs text-ink-600">{c.expectedIPA}</span>}
                <p className="text-ink-600">{c.advice}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sounds.length > 0 && (
        <section className="space-y-2">
          <Heading>{t('shadowing.sounds')}</Heading>
          <ul className="space-y-2">
            {sounds.map((item, i) => {
              const { Icon, tone } = STATUS_ICON[item.status] ?? STATUS_ICON.acceptable;
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm text-ink-800">
                  <Icon className={`mt-0.5 w-4 h-4 shrink-0 ${tone}`} aria-hidden="true" />
                  <span className="sr-only">{t(`shadowing.status.${item.status}`)}</span>
                  <p className="min-w-0 break-words">
                    <span className="mr-1.5 rounded-md bg-surface border border-ink-200 px-1.5 py-0.5 font-mono text-xs text-ink-900">
                      {item.phoneme}
                    </span>
                    <span className="font-medium text-ink-900">{item.targetWord}</span>
                    <span className="text-ink-600"> — {item.tip}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {textRows.length > 0 && (
        <dl className="text-sm">
          {textRows.map((r) => (
            <div key={r.label} className="border-t border-ink-200 py-2.5">
              <dt className="text-xs font-medium text-ink-500">{r.label}</dt>
              <dd className="mt-0.5 text-ink-800 break-words">{r.text}</dd>
            </div>
          ))}
        </dl>
      )}

      {assessment.coachingNotes && (
        <section className="space-y-1.5">
          <Heading>{t('shadowing.notes')}</Heading>
          <p className="text-sm text-ink-700 leading-relaxed break-words">{assessment.coachingNotes}</p>
        </section>
      )}

      {!hasDetail && <p className="text-sm text-ink-600">{t('shadowing.scoresOnly')}</p>}
    </div>
  );
};
