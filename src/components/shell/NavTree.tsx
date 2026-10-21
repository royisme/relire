/** One learning-first navigation tree for desktop, rail and phone drawer; only real saved writing enables Writing. */
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  BookmarkCheck,
  BookOpen,
  Download,
  Headphones,
  Info,
  Languages,
  Mic,
  PenLine,
  Settings,
} from 'lucide-react';
import { PWAInstallButton } from '../PWAInstallButton';
import { areaOf, routeHref, SETTINGS_SECTIONS, STUDY_TABS, type Route } from '../../utils/routes';
import { contentServiceUrl } from '../../services/grammarTopics/service';
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
  const links = [
    { to: { name: 'library' } as Route, area: 'read', icon: BookOpen, label: t('learning.areas.reading') },
    { to: { name: 'grammar' } as Route, area: 'grammar', icon: Languages, label: t('learning.areas.grammar') },
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
  const children: { to: Route; label: string }[] =
    area === 'read'
      ? [
          { to: { name: 'library' }, label: t('learning.library') },
          { to: { name: 'practice', area: 'reading' }, label: t('learning.exercises') },
          { to: { name: 'importArticle' }, label: t('nav.importArticle') },
        ]
      : area === 'grammar'
        ? [
            ...(contentServiceUrl() ? [{ to: { name: 'grammar' } as Route, label: t('grammarTopics.title') }] : []),
            { to: { name: 'grammar', section: 'conjugation' }, label: t('conjugation.page.title') },
            { to: { name: 'grammar', section: 'gender' }, label: t('nounGender.title') },
            { to: { name: 'practice', area: 'grammar' }, label: t('learning.exercises') },
          ]
        : area === 'speaking'
          ? [{ to: { name: 'readAloud' }, label: t('learning.readAloud') }]
          : [];
  return (
    <nav aria-label={t('nav.main')} className="flex flex-1 flex-col">
      <div className="space-y-0.5 px-2 py-3">
        {links.map((link) => (
          <div key={link.area}>
            <NavItem
              {...item}
              to={link.to}
              icon={link.icon}
              label={link.label}
              current={area === link.area ? (!rail && children.length > 0 ? 'area' : 'page') : undefined}
            />
            {!rail && area === link.area && (
              <>
                {children.map(({ to, label }) => (
                  <NavItem
                    key={routeHref(to)}
                    {...item}
                    to={to}
                    label={label}
                    current={
                      (
                        to.name === 'grammar'
                          ? (route.name === 'grammar' && route.section === to.section) ||
                            (!to.section && route.name === 'grammarTopic')
                          : routeHref(route) === routeHref(to)
                      )
                        ? 'page'
                        : undefined
                    }
                  />
                ))}
                <PracticeSubnav route={route} onNavigate={onNavigate} />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-0.5 border-t border-ink-200 px-2 py-3">
        <NavItem
          {...item}
          to={{ name: 'study', tab: 'words' }}
          icon={BookmarkCheck}
          label={t('nav.vocab')}
          current={area === 'study' ? (rail ? 'page' : 'area') : undefined}
        />
        {!rail &&
          area === 'study' &&
          STUDY_TABS.map((tab) => (
            <NavItem
              key={tab}
              {...item}
              to={{ name: 'study', tab }}
              label={t(`study.${tab}`)}
              current={
                (route.name === 'study' && route.tab === tab) ||
                ((route.name === 'wordsAll' || route.name === 'wordsReview') && tab === 'words')
                  ? 'page'
                  : undefined
              }
              badge={tab === 'words' ? dueCount : tab === 'mistakes' ? mistakes : undefined}
              badgeLabel={
                tab === 'words'
                  ? t('nav.due', { count: dueCount })
                  : tab === 'mistakes'
                    ? t('nav.toReview', { count: mistakes })
                    : undefined
              }
            />
          ))}
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
