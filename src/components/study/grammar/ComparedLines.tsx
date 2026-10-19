/** Two labelled lines, the AI's form and the rule's form, for a cell or participle that differs; never one silently. Owns only that pair of lines. */
import { useTranslation } from 'react-i18next';

export function ComparedLines({ model, rule }: { model: string; rule: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5">
      {(
        [
          ['conjugation.page.model', model],
          ['conjugation.page.rule', rule],
        ] as const
      ).map(([label, text]) => (
        <p key={label} className="flex items-baseline gap-2">
          <span className="w-14 shrink-0 text-xs text-ink-500">{t(label)}</span>
          <span className="min-w-0 break-words font-serif text-lg text-ink-900">{text}</span>
        </p>
      ))}
    </div>
  );
}
