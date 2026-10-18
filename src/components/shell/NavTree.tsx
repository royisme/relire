/**
 * The app's places as one tree, drawn by the sidebar (expanded or as a rail) and by the phone drawer:
 * Read (with its article import while in Read), My study (Words, Shadowing, Mistakes), Practice (with its exercise import
 * and the units of the open unit's batch) and Progress at the top;
 * install, Settings (with its sections while on a settings page) and About at the bottom. Owns which row is current,
 * and the counts on Words (due today) and Mistakes (still unresolved); navigation itself is `Link`.
 */
import { useTranslation } from 'react-i18next';
import { BarChart3, BookmarkCheck, BookOpen, Download, Dumbbell, Info, Settings } from 'lucide-react';
import { PWAInstallButton } from '../PWAInstallButton';
import { areaOf, SETTINGS_SECTIONS, STUDY_TABS, type Route } from '../../utils/routes';
import { NavItem } from './NavItem';
import { useMistakes } from '../../hooks/useMistakes';
import { PracticeSubnav } from './PracticeSubnav';

interface NavTreeProps {
  route: Route;
  /** Words saved that are due for review today. */
  dueCount: number;
  /** Icon-only rows; sub-pages are left out (pages offer their own section list instead). */
  rail?: boolean;
  /** Called after a link is followed, so the phone drawer can close. */
  onNavigate?: () => void;
}

export function NavTree({ route, dueCount, rail, onNavigate }: NavTreeProps) {
  const { t } = useTranslation();
  const area = areaOf(route);
  // Resolved mistakes stay in the notebook as history, so only the unresolved ones are counted.
  const mistakes = useMistakes().rows.filter((row) => !row.resolved).length;
  const item = { rail, onNavigate };
  // An area with sub-pages is `area` while one of them is shown; the sub-page itself is `page`.
  const areaState = (name: NonNullable<typeof area>, hasChildren: boolean) =>
    area !== name ? undefined : hasChildren && !rail ? ('area' as const) : ('page' as const);

  return (
    <nav aria-label={t('nav.main')} className="flex flex-1 flex-col">
      <div className="px-2 py-3 space-y-0.5">
        <NavItem
          {...item}
          to={{ name: 'library' }}
          icon={BookOpen}
          label={t('nav.reader')}
          // The library and the reader are both "Read"; only the library row is a page of its own.
          current={area === 'read' ? (route.name === 'importArticle' && !rail ? 'area' : 'page') : undefined}
        />
        {!rail && area === 'read' && (
          <NavItem
            {...item}
            to={{ name: 'importArticle' }}
            label={t('nav.importArticle')}
            current={route.name === 'importArticle' ? 'page' : undefined}
          />
        )}
        <NavItem
          {...item}
          to={{ name: 'study', tab: 'words' }}
          icon={BookmarkCheck}
          label={t('nav.vocab')}
          current={areaState('study', true)}
          badge={dueCount}
          badgeLabel={t('nav.due', { count: dueCount })}
        />
        {!rail &&
          area === 'study' &&
          STUDY_TABS.map((tab) => (
            <NavItem
              key={tab}
              {...item}
              to={{ name: 'study', tab }}
              label={t(`study.${tab}`)}
              current={route.name === 'study' && route.tab === tab ? 'page' : undefined}
              badge={tab === 'mistakes' ? mistakes : undefined}
              badgeLabel={tab === 'mistakes' ? t('nav.toReview', { count: mistakes }) : undefined}
            />
          ))}
        <NavItem
          {...item}
          to={{ name: 'practice' }}
          icon={Dumbbell}
          label={t('nav.practice')}
          // The list is a page of its own; an open set, unit or import makes Practice its parent.
          current={
            (route.name === 'unit' || route.name === 'practiceSet' || route.name === 'importExercises') && !rail
              ? 'area'
              : areaState('practice', false)
          }
        />
        {!rail && area === 'practice' && (
          <>
            <NavItem
              {...item}
              to={{ name: 'importExercises' }}
              label={t('nav.importExercises')}
              current={route.name === 'importExercises' ? 'page' : undefined}
            />
            <PracticeSubnav route={route} onNavigate={onNavigate} />
          </>
        )}
        <NavItem
          {...item}
          to={{ name: 'progress' }}
          icon={BarChart3}
          label={t('nav.analytics')}
          current={areaState('progress', false)}
        />
      </div>

      <div className="mt-auto border-t border-ink-200 px-2 py-3 space-y-0.5">
        <PWAInstallButton onDone={onNavigate}>
          {({ label, onClick }) => <NavItem {...item} icon={Download} label={label} onClick={onClick} />}
        </PWAInstallButton>
        <NavItem
          {...item}
          to={{ name: 'settings', section: null }}
          icon={Settings}
          label={t('nav.settings')}
          current={areaState('settings', true)}
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
          current={areaState('about', false)}
        />
      </div>
    </nav>
  );
}
