/**
 * The browser side of hash routing: the current Route as React state, and `navigate`.
 * Parsing and building addresses is utils/routes.ts. User navigation pushes a history entry;
 * resolving a default (an empty hash) replaces the current one, so Back never lands
 * on an address the learner did not choose.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { parseRoute, routeHref, type Route } from '../utils/routes';

import { importAwareNavigate, publishedHash, ROUTE_CHANGED } from '../utils/importNavigation';
const CHANGED = ROUTE_CHANGED;

function subscribe(listener: () => void) {
  // The import coordinator publishes committed routes after browser events or explicit navigation.
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
  };
}

/** Go to a route; the import guard owns any pending leave decision. */
export function navigate(to: Route | string, options: { replace?: boolean } = {}) {
  importAwareNavigate(typeof to === 'string' ? to : routeHref(to), options.replace);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, publishedHash);
  const parsed = useMemo(() => parseRoute(hash), [hash]);
  useEffect(() => {
    if (parsed.canonical) navigate(parsed.canonical, { replace: true });
  }, [parsed.canonical]);
  return parsed.route;
}
