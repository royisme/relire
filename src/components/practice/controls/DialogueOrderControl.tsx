/**
 * DIALOGUE_ORDER: the utterances listed in the order the learner arranges them,
 * each with a move-up and a move-down button; the arrow keys move the line the
 * pressed control belongs to. The whole arrangement goes into `dialogueOrder`.
 * After a check, a line in its right place is ok; a misplaced one is struck
 * through and the right order is listed below.
 */
import { useRef, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import type { ExerciseControlProps } from './types';

/** The letter a line is keyed by: its first character, as the grader does. */
const lineKey = (line: string) => (line.trim()[0] ?? '').toLowerCase();

export function DialogueOrderControl({ item, answer, onChange, checked, disabled }: ExerciseControlProps) {
  const { t } = useTranslation();
  const order = answer.dialogueOrder;
  const expected = (Array.isArray(item.expectedAnswer) ? item.expectedAnswer : [item.expectedAnswer]).map((key) =>
    key.toLowerCase(),
  );
  const up = useRef(new Map<string, HTMLButtonElement>());
  const down = useRef(new Map<string, HTMLButtonElement>());

  const move = (at: number, step: -1 | 1) => {
    if (disabled) return;
    const to = at + step;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[at], next[to]] = [next[to], next[at]];
    onChange({ ...answer, dialogueOrder: next });
  };

  const onArrows = (event: KeyboardEvent<HTMLLIElement>, at: number, line: string) => {
    if (disabled) return;
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    move(at, step);
    (step < 0 ? up : down).current.get(line)?.focus();
  };

  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">{item.prompt}</p>
      <ol aria-label={t('practice.linesLabel', { number: item.itemNumber })} className="min-w-0">
        {order.map((line, at) => {
          const key = lineKey(line);
          const right = Boolean(checked) && key === expected[at];
          return (
            <li
              key={line}
              onKeyDown={(event) => onArrows(event, at, line)}
              className="flex items-start gap-x-2 border-t border-ink-200 py-1 first:border-t-0"
            >
              <span className="tnum mt-1.5 w-4 shrink-0 text-right text-xs text-ink-500">{at + 1}</span>
              <span
                lang="fr"
                className={cn(
                  'min-w-0 flex-1 break-words font-serif text-base leading-relaxed',
                  !checked && 'text-ink-900',
                  checked && right && 'font-medium text-ok-800',
                  checked && !right && 'font-medium text-bad-700 line-through',
                )}
              >
                {line}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={t('practice.moveLineUp', { line: key })}
                  aria-disabled={disabled || at === 0 || undefined}
                  ref={(element) => {
                    if (element) up.current.set(line, element);
                    else up.current.delete(line);
                  }}
                  onClick={() => move(at, -1)}
                  className="max-sm:h-10 max-sm:w-10 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={t('practice.moveLineDown', { line: key })}
                  aria-disabled={disabled || at === order.length - 1 || undefined}
                  ref={(element) => {
                    if (element) down.current.set(line, element);
                    else down.current.delete(line);
                  }}
                  onClick={() => move(at, 1)}
                  className="max-sm:h-10 max-sm:w-10 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      {checked && !checked.correct && (
        <div className="space-y-1">
          <p className="text-sm text-ink-600">{t('practice.expected')}:</p>
          {expected.map((key, at) => (
            <p key={key} className="min-w-0 break-words font-serif text-base font-semibold text-ok-800">
              <span className="tnum mr-1 text-xs font-normal text-ink-500">{at + 1}.</span>
              <span className="select-all">{order.find((line) => lineKey(line) === key)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
