/** One saved topic session at Grammar or Practice, with no lookup/AI/speech capabilities. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Circle, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ExerciseUnitSession } from '../../hooks/useExerciseUnit';
import type { GrammarTopic } from '../../types/grammarTopic';
import { resolveTopicFeedback } from '../../types/grammarCheckpoint';
import { expectedAnswerText, isAnswerFilled, recordedAnswerText } from '../../services/exercises/answer';
import { contentServiceUrl } from '../../services/grammarTopics/service';
import { cn } from '../../lib/utils';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { TopicBlocks } from '../study/grammar/TopicBlocks';
import { CharacterBar } from './CharacterBar';
import { ChoiceSelectControl } from './controls/ChoiceSelectControl';
import { FillBlanksControl } from './controls/FillBlanksControl';
import type { TextInputElement } from './controls/types';
import { ResetDialog } from './ResetDialog';
import { TopicFeedbackSheet } from './TopicFeedbackSheet';

export function TopicWorkbench({ session, topic }: { session: ExerciseUnitSession; topic?: GrammarTopic }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const unit = session.unit!;
  const origin = unit.topicOrigin!;
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      unit.items.findIndex((item) => !session.items[item.id]?.checked),
    ),
  );
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bound, setBound] = useState<TextInputElement | null>(null);
  const field = useRef<TextInputElement | null>(null);
  const registerInput = useCallback((_slot: number, element: TextInputElement | null) => {
    field.current = element;
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigating = useRef(false);
  const item = unit.items[selected];
  const question = item.topicQuestion!;
  const view = session.items[item.id];
  const checkpoint = topic?.learning?.checkpoints.find((entry) => entry.id === question.checkpointId);
  const submitted = recordedAnswerText(item.type!, item, view.answer);
  const feedback = view.checked ? resolveTopicFeedback(question.feedback, submitted, view.checked.correct) : undefined;
  const error = view.checked ? null : (view.error ?? session.saveError);
  const Control = item.type === 'CHOICE_SELECT' ? ChoiceSelectControl : FillBlanksControl;
  const busy = Boolean(view.busy) || session.resetting;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.target !== field.current) return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (!busy && !view.checked && isAnswerFilled(item.type!, view.answer)) void session.check(item.id);
  };
  const select = (index: number) => {
    if (index === selected) return;
    navigating.current = true;
    setSelected(index);
    setFeedbackOpen(false);
    setBound(null);
  };
  useEffect(() => {
    if (!navigating.current) return;
    navigating.current = false;
    heading.current?.focus({ preventScroll: true });
    const rect = heading.current?.getBoundingClientRect();
    if (rect && (rect.top < 56 || rect.bottom > window.innerHeight))
      heading.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [selected]);

  const reset = async () => {
    if (await session.reset()) {
      setConfirmReset(false);
      setFeedbackOpen(false);
      select(0);
    }
  };

  return (
    <article data-topic-workbench lang={language} className="min-w-0 space-y-6 break-words text-sm leading-relaxed">
      {!topic && (
        <Link
          to={{ name: 'practiceSet', setId: unit.setId }}
          className="inline-flex min-h-10 items-center text-accent-900 underline"
        >
          {t('practice.backToSet', { title: origin.title[language] })}
        </Link>
      )}
      <header className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-2xl font-semibold">{origin.title[language]}</h2>
          <span className="text-xs text-ink-500">{t(`levels.${unit.level}`)}</span>
        </div>
        <p>{origin.instruction[language]}</p>
        <p className="text-xs text-ink-500">
          {t('grammarTopics.learning.practice.revision', { revision: origin.exerciseRevision.slice(0, 8) })}
        </p>
        {!topic && <p className="text-ink-600">{t('grammarTopics.learning.practice.savedOnlyNote')}</p>}
        <div className="grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <p className="tnum max-h-10 overflow-y-auto text-ink-600">
            {session.progress.checked === session.progress.total
              ? t('grammarTopics.learning.progress.summary', {
                  checked: session.progress.checked,
                  right: session.progress.correct,
                })
              : t('grammarTopics.learning.progress.initial', {
                  checked: session.progress.checked,
                  total: session.progress.total,
                })}
          </p>
          <Button variant="ghost" disabled={!session.canReset || busy} onClick={() => setConfirmReset(true)}>
            {t('grammarTopics.learning.actions.reset')}
          </Button>
        </div>
      </header>
      <section className="min-w-0 space-y-4 border-y border-ink-200 py-6" aria-labelledby="topic-checkpoint">
        <h3 id="topic-checkpoint" className="font-serif text-lg font-semibold">
          {question.checkpointTitle[language]}
        </h3>
        {checkpoint && <TopicBlocks blocks={checkpoint.teaching} language={language} />}
        <div
          role="group"
          aria-label={t('grammarTopics.learning.index.label')}
          className="grid max-w-sm grid-cols-3 gap-3 sm:grid-cols-6"
        >
          {unit.items.map((entry, index) => {
            const checked = session.items[entry.id]?.checked;
            const state = checked ? (checked.correct ? 'right' : 'wrong') : 'unchecked';
            const Icon = checked ? (checked.correct ? Check : X) : Circle;
            return (
              <Button
                key={entry.id}
                variant="ghost"
                aria-current={index === selected ? 'step' : undefined}
                aria-label={t('grammarTopics.learning.index.item', {
                  checkpoint: entry.topicQuestion!.checkpointTitle[language],
                  number: index + 1,
                  total: unit.items.length,
                  state: t(`grammarTopics.learning.index.${state}`),
                })}
                onClick={() => select(index)}
                className={cn('gap-1 px-1', index === selected && 'bg-accent-100 text-accent-900')}
              >
                {t('grammarTopics.learning.index.number', { number: index + 1 })}
                <Icon
                  aria-hidden="true"
                  className={cn('h-3 w-3', checked && (checked.correct ? 'text-ok-800' : 'text-bad-700'))}
                />
              </Button>
            );
          })}
        </div>
        <p className="tnum text-xs text-ink-500">
          {t('grammarTopics.learning.index.position', { number: selected + 1, total: unit.items.length })}
        </p>
        <h4 id="topic-instruction" ref={heading} tabIndex={-1} className="font-medium">
          {question.instruction[language]}
        </h4>
        <div
          role="group"
          aria-labelledby="topic-instruction"
          aria-describedby="topic-result"
          key={item.id}
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            if (event.target === field.current) setBound(field.current);
          }}
        >
          <Control
            item={item}
            type={item.type!}
            answer={view.answer}
            onChange={(answer) => session.setAnswer(item.id, answer)}
            checked={view.checked}
            disabled={busy || Boolean(view.checked)}
            correctionPlacement="feedback"
            registerInput={registerInput}
          />
        </div>
        <div id="topic-result" data-topic-result className="flex h-32 min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between gap-2">
            <p role="status" aria-live="polite" className={view.checked?.correct ? 'text-ok-800' : 'text-bad-700'}>
              {error
                ? t('grammarTopics.learning.result.saveFailed')
                : view.checked
                  ? t(
                      view.checked.correct
                        ? 'grammarTopics.learning.result.right'
                        : 'grammarTopics.learning.result.wrong',
                    )
                  : ''}
            </p>
            <Button
              variant="ghost"
              className="shrink-0"
              disabled={!feedback && !error}
              onClick={() => setFeedbackOpen(true)}
            >
              {t(error ? 'grammarTopics.learning.result.readDetails' : 'grammarTopics.learning.result.readFeedback')}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap">
            {error && <p className="text-bad-700">{t('grammarTopics.learning.errors.saveFailed', { msg: error })}</p>}
            {view.checked && !view.checked.correct && (
              <p>
                {t('grammarTopics.learning.result.expected')}:{' '}
                <span lang="fr" className="font-serif text-base text-ok-800">
                  {expectedAnswerText(item)}
                </span>
              </p>
            )}
            {feedback && <p>{feedback.summary[language]}</p>}
            {!view.checked && session.saveError && (
              <Button variant="ghost" onClick={session.retrySave}>
                {t('common.retry')}
              </Button>
            )}
          </div>
        </div>
        <div data-topic-actions className="grid grid-cols-3 gap-3">
          <Button variant="outline" disabled={selected === 0 || busy} onClick={() => select(selected - 1)}>
            {t('grammarTopics.learning.actions.previous')}
          </Button>
          <Button variant="ghost" disabled={!view.checked || busy} onClick={() => void session.resetItem(item.id)}>
            {t('grammarTopics.learning.actions.redo')}
          </Button>
          <Button
            aria-busy={view.busy === 'check'}
            className="px-2"
            aria-disabled={busy}
            disabled={view.checked ? selected === unit.items.length - 1 : !isAnswerFilled(item.type!, view.answer)}
            onClick={() => {
              if (busy) return;
              if (view.checked) select(selected + 1);
              else void session.check(item.id);
            }}
          >
            <span className="inline-flex h-4 w-4 shrink-0">
              {view.busy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="h-4 w-4" />
              )}
            </span>
            {t(view.checked ? 'grammarTopics.learning.actions.next' : 'grammarTopics.learning.actions.check')}
          </Button>
        </div>
      </section>
      {topic ? (
        <Collapsible>
          <CollapsibleTrigger className="inline-flex min-h-10 items-center text-accent-900 underline">
            {t('grammarTopics.learning.reference.fullReference')}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6 pt-4">
            <TopicBlocks blocks={topic.blocks} language={language} />
          </CollapsibleContent>
        </Collapsible>
      ) : (
        contentServiceUrl() && (
          <Link
            to={{ name: 'grammarTopic', topicId: origin.topicId }}
            className="inline-flex min-h-10 items-center text-accent-900 underline"
          >
            {t('grammarTopics.learning.reference.openCurrent')}
          </Link>
        )
      )}
      <CharacterBar target={bound} editable={!busy && !view.checked} />
      {feedbackOpen && (
        <TopicFeedbackSheet
          instruction={question.instruction}
          prompt={item.prompt}
          userAnswer={view.checked ? submitted : undefined}
          expectedAnswer={view.checked ? expectedAnswerText(item) : undefined}
          feedback={feedback}
          error={error}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {confirmReset && (
        <ResetDialog
          title={origin.title[language]}
          busy={session.resetting}
          error={session.resetError}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => void reset()}
        />
      )}
    </article>
  );
}
