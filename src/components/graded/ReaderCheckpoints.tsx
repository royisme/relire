/**
 * The checkpoints under a graded reader's text: one authored pair (recognition
 * then typed) per checkpoint, one question visible at a time with free
 * navigation, strict-accent grading and the authored feedback for the committed
 * answer. Controlled: the parent owns the answers and commits every check, so
 * this component never writes storage and never advances on its own. No AI, no
 * lookup and no speech.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Circle, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { emptyAnswer, expectedAnswerText, isAnswerFilled, recordedAnswerText } from '../../services/exercises/answer';
import { readerQuestionItem } from '../../services/gradedReaders/checkpoints';
import { resolveTopicFeedback } from '../../types/grammarCheckpoint';
import type { CheckedResult, ExerciseAnswer } from '../../types/exercises';
import type { ReaderLearning, ReaderQuestion } from '../../types/gradedReader';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { CharacterBar } from '../practice/CharacterBar';
import { ChoiceSelectControl } from '../practice/controls/ChoiceSelectControl';
import { FillBlanksControl } from '../practice/controls/FillBlanksControl';
import type { TextInputElement } from '../practice/controls/types';
import { TopicFeedbackSheet } from '../practice/TopicFeedbackSheet';

/** One question's controlled state: what the learner entered and the committed verdict, if any. */
export interface ReaderQuestionAnswer {
  answer: ExerciseAnswer;
  checked: CheckedResult | null;
}

export interface ReaderCheckpointsProps {
  learning: ReaderLearning;
  /** Per question id; a question the parent has no row for starts empty. */
  answers: Partial<Record<string, ReaderQuestionAnswer>>;
  onChange: (questionId: string, answer: ExerciseAnswer) => void;
  onCheck: (questionId: string) => void;
  onRedo: (questionId: string) => void;
  /** The question id being checked or saved, else null. */
  pending: string | null;
  /** The real check or save failure, shown in the reserved result slot. */
  error?: string | null;
  onRetry?: () => void;
}

type Entry = { checkpoint: ReaderLearning['checkpoints'][number]; question: ReaderQuestion };

export function ReaderCheckpoints({
  learning,
  answers,
  onChange,
  onCheck,
  onRedo,
  pending,
  error,
  onRetry,
}: ReaderCheckpointsProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const [selected, setSelected] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [bound, setBound] = useState<TextInputElement | null>(null);
  const [hinted, setHinted] = useState<ReadonlySet<string>>(new Set());
  const field = useRef<TextInputElement | null>(null);
  const registerInput = useCallback((_slot: number, element: TextInputElement | null) => {
    field.current = element;
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const quote = useRef<HTMLParagraphElement>(null);
  const revealing = useRef(false);
  const navigating = useRef(false);
  const entries: Entry[] = learning.checkpoints.flatMap((checkpoint) =>
    checkpoint.questions.map((question) => ({ checkpoint, question })),
  );
  const at = Math.min(selected, entries.length - 1);
  const entry = entries[at]!;
  const id = entry.question.question.id;
  const item = readerQuestionItem(entry.question, at + 1);
  const type = entry.question.question.type;
  const Control = type === 'CHOICE_SELECT' ? ChoiceSelectControl : FillBlanksControl;
  const view = answers[id] ?? { answer: emptyAnswer(item), checked: null };
  const checked = view.checked;
  // The quoted sentence gives the answer away, so it stays hidden until the learner asks for
  // it or a committed verdict makes it the evidence. The hint is never stored, logged or scored.
  const sentenceShown = checked !== null || hinted.has(id);
  const showQuote = () => {
    revealing.current = true;
    setHinted((shown) => new Set(shown).add(id));
  };
  const busy = pending !== null;
  const submitted = recordedAnswerText(type, item, view.answer);
  const feedback = checked ? resolveTopicFeedback(entry.question.question.feedback, submitted, checked.correct) : null;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.target !== field.current) return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (!busy && !checked && isAnswerFilled(type, view.answer)) onCheck(id);
  };
  const select = (index: number) => {
    if (index === at) return;
    navigating.current = true;
    setSelected(index);
    setFeedbackOpen(false);
    setBound(null);
  };
  // Navigation is explicit and never advances by itself, so the new question gets focus where it is.
  useEffect(() => {
    if (!navigating.current) return;
    navigating.current = false;
    heading.current?.focus({ preventScroll: true });
    const rect = heading.current?.getBoundingClientRect();
    if (rect && (rect.top < 56 || rect.bottom > window.innerHeight))
      heading.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [at]);
  // The reveal button unmounts while it holds focus, so the revealed sentence takes it over.
  useEffect(() => {
    if (!revealing.current) return;
    revealing.current = false;
    quote.current?.focus({ preventScroll: true });
  }, [hinted]);

  return (
    <section aria-labelledby="reader-checkpoints" className="min-w-0 space-y-4 break-words text-sm leading-relaxed">
      <h3 id="reader-checkpoints" className="font-serif text-lg font-semibold">
        {t('gradedReader.checkpoints.title')}
      </h3>
      <p className="text-ink-700">{learning.instruction[language]}</p>
      <div role="group" aria-label={t('grammarTopics.learning.index.label')} className="flex max-w-sm flex-wrap gap-2">
        {entries.map((candidate, index) => {
          const result = answers[candidate.question.question.id]?.checked ?? null;
          const Icon = result ? (result.correct ? Check : X) : Circle;
          const state = result ? (result.correct ? 'right' : 'wrong') : 'unchecked';
          return (
            <Button
              key={candidate.question.question.id}
              variant="ghost"
              className="gap-1 px-2"
              aria-current={index === at ? 'step' : undefined}
              aria-label={t('grammarTopics.learning.index.item', {
                checkpoint: candidate.checkpoint.title[language],
                number: index + 1,
                total: entries.length,
                state: t(`grammarTopics.learning.index.${state}`),
              })}
              onClick={() => select(index)}
            >
              {t('grammarTopics.learning.index.number', { number: index + 1 })}
              <Icon
                aria-hidden="true"
                className={cn('h-3 w-3', result && (result.correct ? 'text-ok-800' : 'text-bad-700'))}
              />
            </Button>
          );
        })}
      </div>
      <p className="tnum text-xs text-ink-500">
        {t('grammarTopics.learning.index.position', { number: at + 1, total: entries.length })}
      </p>
      <div className="min-w-0 space-y-4 border-t border-ink-200 pt-4">
        <h4 ref={heading} tabIndex={-1} className="font-medium outline-none">
          {entry.checkpoint.title[language]}
        </h4>
        <p id="reader-question">{entry.question.question.instruction[language]}</p>
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-ink-500">{t('gradedReader.checkpoints.quotedSentence')}</p>
          {/* The invisible sentence holds the space; the button sits over it, so the reveal never moves the page. */}
          <div className="relative min-h-10 min-w-0">
            <p
              ref={quote}
              lang="fr"
              tabIndex={-1}
              className={cn('font-serif text-base text-ink-700 outline-none', !sentenceShown && 'invisible')}
            >
              {entry.question.evidence.quote}
            </p>
            {!sentenceShown && (
              <Button variant="ghost" className="absolute inset-0 h-auto px-2 text-ink-500" onClick={showQuote}>
                {t('gradedReader.checkpoints.showQuotedSentence')}
              </Button>
            )}
          </div>
        </div>
        <div
          role="group"
          aria-labelledby="reader-question"
          aria-describedby="reader-result"
          key={id}
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            if (event.target === field.current) setBound(field.current);
          }}
        >
          <Control
            item={item}
            type={type}
            answer={view.answer}
            onChange={(answer) => onChange(id, answer)}
            checked={checked}
            disabled={busy || checked !== null}
            correctionPlacement="feedback"
            registerInput={registerInput}
          />
        </div>
        <div id="reader-result" data-reader-result className="flex h-32 min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between gap-2">
            <p role="status" aria-live="polite" className={checked?.correct ? 'text-ok-800' : 'text-bad-700'}>
              {error
                ? t('grammarTopics.learning.result.saveFailed')
                : checked
                  ? t(checked.correct ? 'grammarTopics.learning.result.right' : 'grammarTopics.learning.result.wrong')
                  : ''}
            </p>
            {error && onRetry && (
              <Button variant="ghost" onClick={onRetry} disabled={busy}>
                {t('common.retry')}
              </Button>
            )}
            {(feedback || error) && (
              <Button variant="ghost" className="shrink-0" onClick={() => setFeedbackOpen(true)}>
                {t(error ? 'grammarTopics.learning.result.readDetails' : 'grammarTopics.learning.result.readFeedback')}
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap">
            {error && <p className="text-bad-700">{error}</p>}
            {checked && (
              <p>
                {t('practice.expected')}:{' '}
                <span lang="fr" className="font-serif text-base text-ok-800">
                  {expectedAnswerText(item)}
                </span>
              </p>
            )}
            {feedback && <p>{feedback.summary[language]}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" disabled={checked === null || busy} onClick={() => onRedo(id)}>
            {t('grammarTopics.learning.actions.redo')}
          </Button>
          <Button
            aria-busy={busy}
            className="px-2"
            disabled={checked !== null || busy || !isAnswerFilled(type, view.answer)}
            onClick={() => {
              if (!busy && !checked) onCheck(id);
            }}
          >
            <span className="inline-flex h-4 w-4 shrink-0">
              {busy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="h-4 w-4" />
              )}
            </span>
            {t('grammarTopics.learning.actions.check')}
          </Button>
        </div>
      </div>
      <CharacterBar target={bound} editable={!busy && checked === null} />
      {feedbackOpen && (
        <TopicFeedbackSheet
          instruction={entry.question.question.instruction}
          prompt={entry.question.question.prompt}
          userAnswer={checked ? submitted : undefined}
          expectedAnswer={checked ? expectedAnswerText(item) : undefined}
          feedback={feedback ?? undefined}
          error={error}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </section>
  );
}
