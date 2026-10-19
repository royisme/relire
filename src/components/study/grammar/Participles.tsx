/** The participles section of the result: present and the four past forms, each shown as the pack or AI gave it, a differing one with both lines. Owns that section only. */
import { useTranslation } from 'react-i18next';
import type { VerifiedVerb } from '../../../services/conjugation/verify';
import { ComparedLines } from './ComparedLines';

const KEYS = ['present', 'ms', 'fs', 'mp', 'fp'] as const;

export function Participles({ participles }: { participles: VerifiedVerb['participles'] }) {
  const { t } = useTranslation();
  const rows = KEYS.flatMap((key) => (participles[key] ? [[key, participles[key]] as const] : []));
  const aiOnly = rows.some(([, participle]) => participle.status === 'ai-only');
  return (
    <section aria-label={t('conjugation.page.participles')} className="border-t border-ink-200 py-5">
      <h3 className="font-serif text-lg font-semibold text-ink-900">{t('conjugation.page.participles')}</h3>
      {aiOnly && <p className="mt-1 text-xs text-ink-500">{t('conjugation.page.aiOnly')}</p>}
      <ul className="mt-3 space-y-1.5">
        {rows.map(([key, participle]) => (
          <li key={key} className="flex flex-col gap-x-4 sm:flex-row sm:items-baseline">
            <span className="shrink-0 text-sm text-ink-700 sm:w-48">{t(`conjugation.page.participle.${key}`)}</span>
            <div className="min-w-0">
              {participle.status === 'differs' && participle.ruleForm ? (
                <ComparedLines model={participle.form} rule={participle.ruleForm} />
              ) : (
                <p className="break-words font-serif text-lg text-ink-900">{participle.form}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
