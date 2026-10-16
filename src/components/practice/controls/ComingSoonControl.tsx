/**
 * The stand-in for an exercise type whose control is not built yet: it shows
 * the prompt, says the type is coming, and cannot be answered or checked (the
 * sheet leaves its buttons out; see `isPlaceholder` in `./index.ts`). Replace
 * it by pointing the type at its real control in the registry.
 */
import { useTranslation } from 'react-i18next';
import type { ExerciseControlProps } from './types';

export function ComingSoonControl({ item, type }: ExerciseControlProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <p className="break-words font-serif text-lg text-ink-900">{item.prompt}</p>
      <p className="text-sm text-ink-500">{t('practice.comingSoon', { type: t(`exerciseTypes.${type}.name`) })}</p>
    </div>
  );
}
