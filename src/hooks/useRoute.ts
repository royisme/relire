/**
 * The browser side of hash routing: the current Route as React state, and `navigate`.
 * Parsing and building addresses is utils/routes.ts. User navigation pushes a history entry;
 * resolving a default (an empty hash, `#/study`) replaces the current one, so Back never lands
 * on an address the learner did not choose.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { parseRoute, routeHref, type Route } from '../utils/routes';

const CHANGED = 'relire-route';

function subscribe(listener: () => void) {
  // Back/forward and typed addresses fire popstate/hashchange; our own pushState and replaceState fire neither.
  window.addEventListener('popstate', listener);
  window.addEventListener('hashchange', listener);
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('hashchange', listener);
    window.removeEventListener(CHANGED, listener);
  };
}

const currentHash = () => window.location.hash;

/** Go to a route (or a hash such as `#/read/abc`). Pushes history unless `replace`; the same address is a no-op. */
export function navigate(to: Route | string, options: { replace?: boolean } = {}) {
  const href = typeof to === 'string' ? to : routeHref(to);
  if (href === currentHash()) return;
  if (options.replace) {
    window.history.replaceState(null, '', href);
  } else {
    window.history.pushState(null, '', href);
    // A new page starts at its top. Back and forward keep the browser's own scroll restoration.
    window.scrollTo(0, 0);
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, currentHash);
  const parsed = useMemo(() => parseRoute(hash), [hash]);
  useEffect(() => {
    if (parsed.canonical) navigate(parsed.canonical, { replace: true });
  }, [parsed.canonical]);
  return parsed.route;
}
