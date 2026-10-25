import type { ComponentProps, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Challenge } from '../../../services/vocabulary/game/challenge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { SpeakButton } from '../../ui/speak-button';
import { VocabularyAnswer } from '../VocabularyAnswer';
import { bossContextOf } from '../../../services/vocabulary/game/collection';
import { LeechContext } from './LeechContext';
import { choiceOf, type RunCardState, type RunPhase } from './runKey';

interface ChallengeCardProps {
  word: string;
  phase: Exclude<RunPhase, 'revealed'>;
  challenge: Challenge | undefined;
  result: RunCardState['result'];
  typed: string;
  busy: boolean;
  onTypedChange: (value: string) => void;
  onPick: (index: number) => void;
  onTypedSubmit: () => void;
  onGiveUp: () => void;
  onJustFlip: () => void;
  onReveal: () => void;
  firstControl: (node: HTMLElement | null) => void;
  revealControl: RefObject<HTMLButtonElement | null>;
}

/** One unrevealed card: the challenge (or the plain front), the reserved result slot and the action row. */
export function RunChallengeCard({
  word,
  phase,
  challenge,
  result,
  typed,
  busy,
  onTypedChange,
  onPick,
  onTypedSubmit,
  onGiveUp,
  onJustFlip,
  onReveal,
  firstControl,
  revealControl,
}: ChallengeCardProps) {
  const { t } = useTranslation();
  const options = challenge ? choiceOf(challenge) : undefined;
  const answering = phase === 'challenge';
  // A cloze's options are French headwords; a meaning's options are glosses in the interface language.
  const optionLang = challenge?.kind === 'cloze' ? 'fr' : undefined;
  const kindLabel =
    challenge === undefined
      ? undefined
      : challenge.kind === 'recognize'
        ? t('vocab.game.kindRecognize')
        : challenge.kind === 'listen'
          ? t('vocab.game.kindListen')
          : challenge.kind === 'produce'
            ? t('vocab.game.kindProduce')
            : options
              ? t('vocab.game.kindClozeChoice')
              : t('vocab.game.kindClozeType');
  return (
    <div className="space-y-5">
      <p className="min-h-6 text-xs text-ink-500">
        {phase === 'plain' ? null : phase === 'loading' ? null : kindLabel}
      </p>
      <div className="min-h-40 space-y-4" aria-busy={phase === 'loading' || undefined}>
        {phase === 'loading' ? null : phase === 'plain' ? (
          <>
            <p lang="fr" className="break-words text-center font-serif text-3xl font-semibold text-ink-900">
              {word}
            </p>
            <p className="text-sm text-ink-600">{t('vocab.recall')}</p>
          </>
        ) : (
          challenge && (
            <>
              {challenge.kind === 'recognize' ? (
                <p lang="fr" className="break-words text-center font-serif text-3xl font-semibold text-ink-900">
                  {challenge.prompt}
                </p>
              ) : challenge.kind === 'cloze' ? (
                <p lang="fr" className="break-words font-serif text-lg leading-relaxed text-ink-900">
                  {challenge.before}
                  <span className="mx-1 inline-block min-w-16 border-b-2 border-ink-300 px-1 text-center">
                    {result ? challenge.expected : ''}
                  </span>
                  {challenge.after}
                </p>
              ) : challenge.kind === 'listen' ? (
                <div className="space-y-3">
                  <SpeakButton
                    text={challenge.expected}
                    engine="device"
                    label={t('vocab.game.listenWord')}
                    stopLabel={t('reader.stop')}
                    variant="outline"
                    showLabel
                  />
                  <p className="text-2xl leading-snug text-ink-900">{challenge.clue}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="break-words text-2xl leading-snug text-ink-900">{challenge.clue}</p>
                  {challenge.pos && <p className="text-xs text-ink-600">{challenge.pos}</p>}
                </div>
              )}
              {options ? (
                <div className="grid gap-2">
                  {options.options.map((option, index) => (
                    <Button
                      key={option}
                      data-run-key
                      data-run-choice={index + 1}
                      ref={index === 0 ? firstControl : undefined}
                      type="button"
                      variant="outline"
                      disabled={!answering || busy}
                      className="h-auto min-h-10 justify-start whitespace-normal py-1.5 text-left"
                      onClick={() => onPick(index)}
                    >
                      <span aria-hidden="true" className="tnum mr-2 shrink-0 text-xs text-ink-500">
                        {index + 1}
                      </span>
                      <span lang={optionLang} className="min-w-0 break-words font-normal">
                        {option}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                answering && (
                  <Input
                    ref={firstControl}
                    lang="fr"
                    value={typed}
                    autoComplete="off"
                    readOnly={!answering}
                    aria-label={t('vocab.game.answerLabel')}
                    className="max-w-xs"
                    onChange={(event) => onTypedChange(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      // Only a keydown that commits no IME composition submits, so Android keyboards and dead
                      // keys keep composing; the document handler never sees this key as the run's own.
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                        event.preventDefault();
                        onTypedSubmit();
                      }
                    }}
                  />
                )
              )}
            </>
          )
        )}
      </div>
      <div className="h-24 overflow-y-auto text-sm" aria-live="polite">
        {result && (
          <>
            <p
              className={cn(
                'flex items-center gap-1.5 font-medium',
                result.grade.correct ? 'text-ok-800' : 'text-bad-700',
              )}
            >
              {result.grade.correct ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <X className="h-4 w-4" aria-hidden="true" />
              )}
              {t(result.grade.correct ? 'vocab.game.right' : 'vocab.game.notRight')}
            </p>
            <p className="mt-1 break-words text-ink-700">
              {t(options ? 'vocab.game.youChose' : 'vocab.game.youTyped', {
                gave: result.gave,
                expected: result.grade.expected,
              })}
            </p>
          </>
        )}
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        {answering && !options && (
          <Button data-run-key type="button" disabled={busy || !typed.trim()} onClick={onTypedSubmit}>
            {t('vocab.game.answer')}
          </Button>
        )}
        {answering && (
          <Button data-run-key type="button" variant="outline" disabled={busy} onClick={onGiveUp}>
            {t('vocab.game.dontKnow')}
          </Button>
        )}
        {(answering || phase === 'loading') && (
          <Button data-run-key type="button" variant="ghost" disabled={busy} onClick={onJustFlip}>
            {t('vocab.game.justFlip')}
          </Button>
        )}
        {phase === 'answered' && (
          <Button data-run-key ref={revealControl} type="button" disabled={busy} onClick={onReveal}>
            {t('vocab.flip')}
          </Button>
        )}
        {phase === 'plain' && (
          <Button data-run-key ref={firstControl} type="button" disabled={busy} onClick={onReveal}>
            {t('vocab.flip')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The revealed card: the word, its listen control and the same attributed answer the plain review shows. */
export function RunRevealedCard({
  word,
  answer,
  wordHeading,
  onListen,
}: {
  word: string;
  answer: ComponentProps<typeof VocabularyAnswer>['word'];
  wordHeading: RefObject<HTMLHeadingElement | null>;
  onListen: () => void;
}) {
  const { t } = useTranslation();
  const context = bossContextOf(answer.row, true);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2
          ref={wordHeading}
          tabIndex={-1}
          lang="fr"
          className="min-w-0 break-words font-serif text-2xl font-semibold text-ink-700"
        >
          {word}
        </h2>
        <span data-vocabulary-independent>
          <SpeakButton
            text={word}
            label={t('wordModal.listen')}
            stopLabel={t('reader.stop')}
            variant="ghost"
            showLabel
            onClick={onListen}
          />
        </span>
      </header>
      <VocabularyAnswer word={answer} snapshot />
      {context && <LeechContext context={context} />}
    </div>
  );
}
