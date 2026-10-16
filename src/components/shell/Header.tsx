/**
 * The top bar: brand, theme and language, plus the menu button on phones, which opens the same
 * navigation tree as the sidebar in a left drawer. Everything else lives in the sidebar.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import type { Route } from '../../utils/routes';
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
}

export function Header({ route, dueCount, showMenu }: HeaderProps) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Growing past the phone width swaps the drawer for the sidebar; don't bring it back on the next shrink.
  if (!showMenu && drawerOpen) setDrawerOpen(false);

  return (
    <header className="sticky top-0 z-30 bg-ink-50 border-b border-ink-200">
      <div className="flex items-center gap-2 h-14 px-3 sm:px-4">
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
          to={{ name: 'library' }}
          className="shrink-0 font-serif text-xl font-semibold italic text-ink-900 cursor-pointer"
        >
          {t('common.appName')}
        </Link>

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
