/** One learning-first navigation tree for desktop, rail and phone drawer; only real saved writing enables Writing. */
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  BookmarkCheck,
  BookOpen,
  CalendarCheck,
  Download,
  Headphones,
  Info,
  Mic,
  NotebookPen,
  PenLine,
  Settings,
  SpellCheck,
} from 'lucide-react';
import { PWAInstallButton } from '../PWAInstallButton';
import { areaOf, SETTINGS_SECTIONS, type Route } from '../../utils/routes';
import { useReaderUnits } from '../../hooks/useReaderUnits';
import { useMistakes } from '../../hooks/useMistakes';
import { NavItem } from './NavItem';
import { PracticeSubnav } from './PracticeSubnav';

interface NavTreeProps {
  route: Route;
  dueCount: number;
  rail?: boolean;
  onNavigate?: () => void;
}
export function NavTree({ route, dueCount, rail, onNavigate }: NavTreeProps) {
  const { t } = useTranslation();
  const area = areaOf(route);
  const mistakes = useMistakes().rows.filter((row) => !row.resolved).length;
  const writing = useReaderUnits().units?.some((unit) => unit.learningArea === 'writing');
  const item = { rail, onNavigate };
  const links = [{ to: { name: 'today' } as Route, area: 'today', icon: CalendarCheck, label: t('today.title') }];
  const learn = [
    { to: { name: 'library' } as Route, area: 'read', icon: BookOpen, label: t('learning.areas.reading') },
    {
      to: { name: 'words' } as Route,
      area: 'words',
      icon: BookmarkCheck,
      label: t('nav.words'),
      badge: dueCount,
      badgeLabel: t('nav.due', { count: dueCount }),
    },
    { to: { name: 'grammar' } as Route, area: 'grammar', icon: SpellCheck, label: t('learning.areas.grammar') },
    {
      to: { name: 'practice', area: 'listening' } as Route,
      area: 'listening',
      icon: Headphones,
      label: t('learning.areas.listening'),
    },
    { to: { name: 'speaking' } as Route, area: 'speaking', icon: Mic, label: t('learning.speaking') },
    ...(writing
      ? [
          {
            to: { name: 'practice', area: 'writing' } as Route,
            area: 'writing',
            icon: PenLine,
            label: t('learning.areas.writing'),
          },
        ]
      : []),
  ];
  const row = (link: (typeof learn)[number], lead?: boolean) => (
    <div key={link.area}>
      <NavItem
        {...item}
        to={link.to}
        icon={link.icon}
        label={link.label}
        lead={lead}
        badge={'badge' in link ? link.badge : undefined}
        badgeLabel={'badgeLabel' in link ? link.badgeLabel : undefined}
        current={area === link.area ? 'page' : undefined}
      />
      {!rail && area === link.area && <PracticeSubnav route={route} onNavigate={onNavigate} />}
    </div>
  );
  const group = rail ? 'border-t border-ink-200' : '';
  const heading = 'px-3 pb-1 font-serif text-xs italic text-ink-500';
  return (
    <nav aria-label={t('nav.main')} className="flex flex-1 flex-col">
      <div className="space-y-0.5 px-2 pt-3 pb-2">{links.map((link) => row(link, true))}</div>
      <div className={`space-y-0.5 px-2 py-3 ${group}`}>
        {!rail && <p className={heading}>{t('nav.groupLearn')}</p>}
        {learn.map((link) => row(link))}
      </div>
      <div className={`space-y-0.5 px-2 py-3 ${group}`}>
        {!rail && <p className={heading}>{t('nav.groupReview')}</p>}
        <NavItem
          {...item}
          to={{ name: 'mistakes' }}
          icon={NotebookPen}
          label={t('study.mistakes')}
          badge={mistakes}
          badgeLabel={t('nav.toReview', { count: mistakes })}
          current={area === 'mistakes' ? 'page' : undefined}
        />
        <NavItem
          {...item}
          to={{ name: 'progress' }}
          icon={BarChart3}
          label={t('nav.analytics')}
          current={area === 'progress' ? 'page' : undefined}
        />
      </div>
      <div className="mt-auto space-y-0.5 border-t border-ink-200 px-2 py-3">
        <PWAInstallButton onDone={onNavigate}>
          {({ label, onClick }) => <NavItem {...item} icon={Download} label={label} onClick={onClick} />}
        </PWAInstallButton>
        <NavItem
          {...item}
          to={{ name: 'settings', section: null }}
          icon={Settings}
          label={t('nav.settings')}
          current={area === 'settings' ? (rail ? 'page' : 'area') : undefined}
        />
        {!rail &&
          area === 'settings' &&
          SETTINGS_SECTIONS.map((section) => (
            <NavItem
              key={section}
              {...item}
              to={{ name: 'settings', section }}
              label={t(`settings.sections.${section}.title`)}
              current={route.name === 'settings' && route.section === section ? 'page' : undefined}
            />
          ))}
        <NavItem
          {...item}
          to={{ name: 'about' }}
          icon={Info}
          label={t('settings.about.title')}
          current={area === 'about' ? 'page' : undefined}
        />
      </div>
    </nav>
  );
}
