/**
 * A batch's exercise units as plain rows separated by rules: title, type and
 * number of items on the left, how far the learner is on the right (counted
 * from the stored item states). A row is a link to the unit's sheet.
 */
import { useTranslation } from 'react-i18next';
import type { UnitRow } from '../../hooks/useUnitRows';
import { Link } from '../shell/Link';

export function UnitList({ rows }: { rows: UnitRow[] }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-ink-200 border-y border-ink-200">
      {rows.map(({ unit, progress }) => (
        <li key={unit.id}>
          <Link
            to={{ name: 'unit', unitId: unit.id }}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 py-3 hover:bg-ink-100"
          >
            <span className="min-w-0">
              <span className="block break-words font-serif text-base font-semibold text-ink-900">{unit.title}</span>
              <span className="block text-xs text-ink-500">
                {t(`exerciseTypes.${unit.type}.name`)} · {t('practice.items', { count: progress.total })}
              </span>
            </span>
            <span className="tnum text-sm text-ink-600">
              {progress.checked === 0
                ? t('practice.notStarted')
                : t('practice.progress', {
                    checked: progress.checked,
                    total: progress.total,
                    correct: progress.correct,
                  })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
