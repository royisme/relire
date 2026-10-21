/** Local Reading and Grammar destination links, shared by shell pages and grammar references. */
import { useTranslation } from 'react-i18next';
import { contentServiceUrl } from '../../services/grammarTopics/service';
import { routeHref, type Route } from '../../utils/routes';
import { Link } from './Link';

export function LearningNavigation({ area, current }: { area: 'read' | 'grammar'; current: Route }) {
  const { t } = useTranslation();
  const links: { to: Route; label: string }[] =
    area === 'read'
      ? [
          { to: { name: 'library' }, label: t('learning.library') },
          { to: { name: 'practice', area: 'reading' }, label: t('learning.exercises') },
        ]
      : [
          ...(contentServiceUrl() ? [{ to: { name: 'grammar' } as Route, label: t('grammarTopics.title') }] : []),
          { to: { name: 'grammar', section: 'conjugation' }, label: t('conjugation.page.title') },
          { to: { name: 'grammar', section: 'gender' }, label: t('nounGender.title') },
          { to: { name: 'practice', area: 'grammar' }, label: t('learning.exercises') },
        ];
  return (
    <nav
      aria-label={t('learning.navigation')}
      className="flex min-w-0 flex-wrap gap-x-5 gap-y-1 border-b border-ink-200"
    >
      {links.map(({ to, label }) => {
        const selected =
          to.name === 'grammar'
            ? (current.name === 'grammar' && current.section === to.section) ||
              (!to.section && current.name === 'grammarTopic')
            : routeHref(current) === routeHref(to);
        return (
          <Link
            key={routeHref(to)}
            to={to}
            aria-current={selected ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center border-b-2 text-sm ${selected ? 'border-accent-700 text-accent-900' : 'border-transparent text-ink-600 hover:text-ink-900'}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
