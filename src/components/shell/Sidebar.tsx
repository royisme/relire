/**
 * The sidebar from `md` up: a 56px icon rail, or from `lg` an expanded 240px column that can be
 * collapsed to the rail. It sits in the page flow beside the content, so it never covers text.
 * The tree itself is NavTree; whether it is expanded is hooks/useSidebar.
 */
import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { Route } from '../../utils/routes';
import { Button } from '../ui/button';
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
      className={`sticky top-14 z-20 flex h-[calc(100dvh-3.5rem)] shrink-0 flex-col overflow-y-auto border-r border-ink-200 bg-ink-50 ${
        expanded ? 'w-60' : 'w-14'
      }`}
    >
      {onToggle && (
        <div className={`px-2 pt-3 ${expanded ? 'flex justify-end' : ''}`}>
          <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={onToggle}>
            {expanded ? (
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      )}
      <NavTree route={route} dueCount={dueCount} rail={!expanded} />
    </aside>
  );
}
