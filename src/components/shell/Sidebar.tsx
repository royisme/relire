/**
 * The sidebar from `md` up: a 56px icon rail, or from `lg` an expanded 240px column that can be
 * collapsed to the rail. It sits in the page flow beside the content, so it never covers text.
 * The tree itself is NavTree; whether it is expanded is hooks/useSidebar.
 */
import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { Route } from '../../utils/routes';
import { NavItem } from './NavItem';
import { NavTree } from './NavTree';

interface SidebarProps {
  route: Route;
  dueCount: number;
  /** Expanded (icon + label) or a rail. Below `lg` it is always a rail and cannot be toggled. */
  expanded: boolean;
  onToggle?: () => void;
}

export function Sidebar({ route, dueCount, expanded, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const label = expanded ? t('nav.collapse') : t('nav.expand');
  return (
    <aside
      data-sidebar={expanded ? 'expanded' : 'rail'}
      className={`sticky top-14 z-20 flex h-[calc(100dvh-3.5rem)] shrink-0 flex-col overflow-y-auto border-r border-ink-200 bg-ink-100 ${
        expanded ? 'w-60' : 'w-14'
      }`}
    >
      <NavTree route={route} dueCount={dueCount} rail={!expanded} />
      {onToggle && (
        <div className="space-y-0.5 border-t border-ink-200 px-2 py-3">
          <NavItem rail={!expanded} icon={expanded ? PanelLeftClose : PanelLeftOpen} label={label} onClick={onToggle} />
        </div>
      )}
    </aside>
  );
}
