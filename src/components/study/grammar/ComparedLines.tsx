/** Two labelled lines, the AI's form and the rule's form, for a cell or participle that differs; never one silently. The rule's form is the right one (semibold, ok), the model's is struck through, as a wrong answer is on the exercise sheet. Owns only that pair of lines. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConjugationSpeakButton } from './ConjugationSpeakButton';

export function ComparedLines({ model, rule, ruleContent }: { model: string; rule: string; ruleContent?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5">
      {(
        [
          ['conjugation.page.model', model, model, 'text-bad-700 line-through'],
          ['conjugation.page.rule', rule, ruleContent ?? rule, 'font-semibold text-ok-800'],
        ] as const
      ).map(([label, text, content, style]) => (
        <div key={label} className="flex items-start gap-2">
          <p className="flex min-w-0 flex-1 items-baseline gap-2 pt-1.5">
            <span className="w-14 shrink-0 text-xs text-ink-500">{t(label)}</span>
            <span className={`min-w-0 break-words font-serif text-lg ${style}`}>{content}</span>
          </p>
          <ConjugationSpeakButton text={text} />
        </div>
      ))}
    </div>
  );
}
