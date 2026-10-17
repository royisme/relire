/**
 * The three buttons under an item: Check, Hint and Explain. They are always
 * there and keep their size, so checking or asking changes an icon and a label
 * on the pressed button and nothing else moves. Hint belongs to the time before
 * the check, Explain to a wrong answer after it.
 */
import { BookOpen, Check, Lightbulb, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ItemRuntime } from '../../hooks/useExerciseUnit';
import { Button } from '../ui/button';

interface ItemActionsProps {
  runtime: ItemRuntime;
  /** The answer is filled in enough to check. */
  canCheck: boolean;
  onCheck: () => void;
  onHint: () => void;
  onExplain: () => void;
}

export function ItemActions({ runtime, canCheck, onCheck, onHint, onExplain }: ItemActionsProps) {
  const { t } = useTranslation();
  const { busy, checked } = runtime;
  const idle = busy === null;
  const small = 'max-sm:h-10';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className={`min-w-28 ${small}`}
        onClick={onCheck}
        disabled={Boolean(checked) || !canCheck || !idle}
      >
        {busy === 'check' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{checked ? t('practice.checked') : t('practice.check')}</span>
      </Button>
      <Button variant="ghost" size="sm" className={small} onClick={onHint} disabled={Boolean(checked) || !idle}>
        {busy === 'hint' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{t('practice.hint')}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={small}
        onClick={onExplain}
        disabled={!checked || checked.correct || busy === 'explain'}
      >
        {busy === 'explain' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <BookOpen className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{t('practice.explain')}</span>
      </Button>
    </div>
  );
}
