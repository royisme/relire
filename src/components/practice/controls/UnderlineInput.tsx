/**
 * The typed blank used by the text controls: an underline in the sentence, in
 * the serif face, that turns green when right and red and struck through when
 * wrong. With the reference answer beside it after a wrong check. Owns the look
 * of one blank only; what it means is decided by the control that renders it.
 */
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { TextInputElement } from './types';

export type BlankState = 'open' | 'right' | 'wrong';

interface UnderlineInputProps {
  value: string;
  onChange: (value: string) => void;
  slot: number;
  registerInput: (slot: number, element: TextInputElement | null) => void;
  /** Spoken name: which item and which blank. */
  label: string;
  state: BlankState;
  /** Not editable (checking or checked); the value stays visible and the field stays focusable. */
  readOnly: boolean;
  className?: string;
  align?: 'center' | 'left';
}

export function UnderlineInput({
  value,
  onChange,
  slot,
  registerInput,
  label,
  state,
  readOnly,
  className,
  align = 'center',
}: UnderlineInputProps) {
  return (
    <input
      ref={(element) => registerInput(slot, element)}
      type="text"
      lang="fr"
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      aria-invalid={state === 'wrong' || undefined}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className={cn(
        'min-w-0 border-0 border-b-2 bg-transparent px-1.5 py-0.5 font-serif text-lg text-ink-900 outline-offset-2 transition-colors',
        align === 'center' ? 'text-center' : 'text-left',
        state === 'open' && 'border-ink-300 focus:border-accent-700',
        state === 'right' && 'border-ok-700 font-medium text-ok-800',
        state === 'wrong' && 'border-bad-600 font-medium text-bad-700 line-through',
        className,
      )}
    />
  );
}

/** The reference answer shown beside a wrong one. */
export function ExpectedBeside({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <span className="min-w-0 break-words font-serif text-base font-semibold text-ok-800">
      <span className="sr-only">{t('practice.expected')}: </span>
      <span className="select-all">{text}</span>
    </span>
  );
}
