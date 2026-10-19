/** Two labelled lines, the AI's form and the rule's form, for a cell or participle that differs; never one silently. The rule's form is the right one (semibold, ok), the model's is struck through, as a wrong answer is on the exercise sheet. Owns only that pair of lines. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ComparedLines({ model, rule }: { model: ReactNode; rule: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5">
      {(
        [
          ['conjugation.page.model', model, 'text-bad-700 line-through'],
          ['conjugation.page.rule', rule, 'font-semibold text-ok-800'],
        ] as const
      ).map(([label, text, style]) => (
        <p key={label} className="flex items-baseline gap-2">
          <span className="w-14 shrink-0 text-xs text-ink-500">{t(label)}</span>
          <span className={`min-w-0 break-words font-serif text-lg ${style}`}>{text}</span>
        </p>
      ))}
    </div>
  );
}
