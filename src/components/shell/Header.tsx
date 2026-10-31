/**
 * The top bar: brand, theme and language, plus the menu button on phones, which opens the same
 * navigation tree as the sidebar in a left drawer. Everything else lives in the sidebar.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import type { Route } from '../../utils/routes';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Drawer, OverlayHeader } from '../ui/overlay';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { Link } from './Link';
import { NavTree } from './NavTree';

interface HeaderProps {
  route: Route;
  dueCount: number;
  /** Phones have no sidebar; the menu button is the way to the tree. */
  showMenu: boolean;
  /** The sidebar column is wide enough for the full brand; otherwise only its initial. */
  expanded: boolean;
}

export function Header({ route, dueCount, showMenu, expanded }: HeaderProps) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Growing past the phone width swaps the drawer for the sidebar; don't bring it back on the next shrink.
  if (!showMenu && drawerOpen) setDrawerOpen(false);

  return (
    <header className="sticky top-0 z-30 bg-ink-50 border-b border-ink-200">
      <div className={`flex items-center gap-2 h-14 ${showMenu ? 'px-3' : 'pr-3 sm:pr-4'}`}>
        {showMenu && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('nav.menu')}
            aria-expanded={drawerOpen}
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        <Link
          to={{ name: 'today' }}
          aria-label={t('common.appName')}
          className={cn(
            'font-serif text-xl font-semibold italic text-ink-900 cursor-pointer',
            showMenu
              ? 'shrink-0'
              : 'flex h-full w-(--sidebar-w) shrink-0 items-center border-r border-ink-200 bg-ink-100',
            !showMenu && (expanded ? 'px-5' : 'justify-center'),
          )}
        >
          {showMenu || expanded ? t('common.appName') : t('common.appName').charAt(0)}
        </Link>
        {!showMenu && <span className="w-1 sm:w-2" aria-hidden="true" />}

        <div className="ml-auto flex items-center gap-1">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>

      {showMenu && drawerOpen && (
        <Drawer onClose={() => setDrawerOpen(false)} label={t('nav.menu')}>
          <OverlayHeader
            title={t('common.appName')}
            onClose={() => setDrawerOpen(false)}
            closeLabel={t('common.close')}
          />
          <div className="flex flex-1 flex-col overflow-y-auto">
            <NavTree route={route} dueCount={dueCount} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </Drawer>
      )}
    </header>
  );
}
