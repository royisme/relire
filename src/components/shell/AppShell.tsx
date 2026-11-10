/** Owns the page frame: header, sidebar, banners and the content column. Not which page shows, shared data or the dialogs (passed in as overlays). */
import type { CSSProperties, ReactNode } from 'react';
import { PageContentBoundary } from './PageContentBoundary';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SaveFailedBanner } from './SaveFailedBanner';
import { MissingKeyBanner } from './MissingKeyBanner';
import { routeHref, type Route } from '../../utils/routes';
import type { Breakpoint } from '../../hooks/useMediaQuery';

interface AppShellProps {
  route: Route;
  dueCount: number;
  breakpoint: Breakpoint;
  /** The sidebar shows labels (desktop and expanded); Settings then lists its sections in it. */
  expanded: boolean;
  onToggleSidebar: () => void;
  saveFailed: boolean;
  keyBanner: boolean;
  onRequestKey: () => void;
  children: ReactNode;
  overlays: ReactNode;
}

export function AppShell({
  route,
  dueCount,
  breakpoint,
  expanded,
  onToggleSidebar,
  saveFailed,
  keyBanner,
  onRequestKey,
  children,
  overlays,
}: AppShellProps) {
  // The sidebar is a rail from md and expands from lg.
  const sidebarWidth = breakpoint === 'phone' ? 0 : expanded ? 240 : 56;

  return (
    <div
      className="min-h-screen bg-ink-50 text-ink-900 flex flex-col font-sans"
      style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
    >
      <Header route={route} dueCount={dueCount} showMenu={breakpoint === 'phone'} expanded={expanded} />

      <div className="flex flex-1 items-start">
        {breakpoint !== 'phone' && (
          <Sidebar
            route={route}
            dueCount={dueCount}
            expanded={expanded}
            onToggle={breakpoint === 'desktop' ? onToggleSidebar : undefined}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {saveFailed && <SaveFailedBanner />}
          {keyBanner && <MissingKeyBanner onRequestKey={onRequestKey} />}
          <PageContentBoundary routeKey={routeHref(route)}>{children}</PageContentBoundary>
        </div>
      </div>
      {overlays}
    </div>
  );
}
