/**
 * The list of settings sections: the whole page on phones (pick one, then see it) and a narrow
 * column beside the section from `md` when the sidebar is not showing them.
 */
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { SETTINGS_SECTIONS, type SettingsSection } from '../../utils/routes';
import { Link } from '../shell/Link';

interface SectionListProps {
  current: SettingsSection | null;
  /** `page`: title and a line of description per row. `column`: titles only, the current one marked. */
  variant: 'page' | 'column';
}

export function SectionList({ current, variant }: SectionListProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('settings.title')}>
      <ul className={variant === 'page' ? 'divide-y divide-ink-200 border-y border-ink-200' : 'space-y-0.5'}>
        {SETTINGS_SECTIONS.map((section) => {
          const active = section === current;
          return (
            <li key={section}>
              <Link
                to={{ name: 'settings', section }}
                aria-current={active ? 'page' : undefined}
                className={
                  variant === 'page'
                    ? 'flex min-h-14 items-center gap-3 py-2 text-ink-900 hover:bg-ink-100 cursor-pointer'
                    : `flex h-10 items-center rounded-md px-3 text-sm cursor-pointer ${
                        active ? 'bg-ink-100 font-medium text-ink-950' : 'text-ink-700 hover:bg-ink-100'
                      }`
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t(`settings.sections.${section}.title`)}</span>
                  {variant === 'page' && (
                    <span className="block text-xs text-ink-500 break-words">
                      {t(`settings.sections.${section}.desc`)}
                    </span>
                  )}
                </span>
                {variant === 'page' && <ChevronRight className="w-4 h-4 shrink-0 text-ink-500" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
