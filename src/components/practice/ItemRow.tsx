/**
 * One numbered row of the sheet: the number (a mark once checked), the control
 * for the item's type, its buttons and notes. The row owns the keyboard rules
 * for the text fields its control registers: Enter moves to the next blank,
 * then to the first empty one, then checks; Enter during IME composition does
 * nothing. It also tells the sheet which field the character bar is bound to.
 */
import { useCallback, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isAnswerFilled } from '../../services/exercises/answer';
import { effectiveItemType, type ExerciseAnswer, type ExerciseItem, type ExerciseUnit } from '../../types/exercises';
import type { ItemRuntime } from '../../hooks/useExerciseUnit';
import { CONTROLS } from './controls';
import type { TextInputElement } from './controls/types';
import { ItemActions } from './ItemActions';
import { ItemNotes } from './ItemNotes';

interface ItemRowProps {
  unit: ExerciseUnit;
  item: ExerciseItem;
  runtime: ItemRuntime;
  onAnswer: (answer: ExerciseAnswer) => void;
  onCheck: () => void;
  onHint: () => void;
  onExplain: () => void;
  /** The learner put the cursor in this field: the character bar types into it. */
  onBind: (element: TextInputElement) => void;
}

export function ItemRow({ unit, item, runtime, onAnswer, onCheck, onHint, onExplain, onBind }: ItemRowProps) {
  const { t } = useTranslation();
  const type = effectiveItemType(item, unit);
  const Control = CONTROLS[type];
  const { checked, busy } = runtime;
  const locked = Boolean(checked) || busy === 'check';

  const fields = useRef(new Map<number, TextInputElement>());
  const registerInput = useCallback((slot: number, element: TextInputElement | null) => {
    if (element) fields.current.set(slot, element);
    else fields.current.delete(slot);
  }, []);
  const inOrder = () => [...fields.current.entries()].sort(([a], [b]) => a - b).map(([, element]) => element);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // A composition (pinyin, kana, accents on a dead key) uses Enter to commit the text, never to submit.
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const fieldsInOrder = inOrder();
    const here = fieldsInOrder.findIndex((element) => element === event.target);
    if (here < 0) return;
    event.preventDefault();
    if (locked) return;
    const next = fieldsInOrder[here + 1] ?? fieldsInOrder.find((element) => !element.value.trim());
    if (next) next.focus();
    else onCheck();
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target as TextInputElement;
    if (inOrder().includes(target)) onBind(target);
  };

  const mark = checked ? (
    checked.correct ? (
      <Check className="h-4 w-4 text-ok-800" aria-hidden="true" />
    ) : (
      <X className="h-4 w-4 text-bad-700" aria-hidden="true" />
    )
  ) : (
    <span className="text-ink-500">{item.itemNumber}</span>
  );

  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-t border-ink-200 py-4 first:border-t-0">
      <span className="tnum mt-1 flex h-7 w-7 select-none items-center justify-center text-sm">
        {mark}
        {checked && <span className="sr-only">{checked.correct ? t('practice.right') : t('practice.wrong')}</span>}
      </span>
      <div className="min-w-0 space-y-3">
        <p className="text-xs text-ink-500">{t(`grammarTags.${item.grammarTag}`)}</p>
        <div onKeyDown={onKeyDown} onFocus={onFocus}>
          <Control
            item={item}
            type={type}
            answer={runtime.answer}
            onChange={onAnswer}
            checked={checked}
            disabled={locked}
            registerInput={registerInput}
          />
        </div>
        <ItemActions
          runtime={runtime}
          canCheck={isAnswerFilled(type, runtime.answer)}
          onCheck={onCheck}
          onHint={onHint}
          onExplain={onExplain}
        />
        <ItemNotes item={item} runtime={runtime} />
      </div>
    </li>
  );
}
