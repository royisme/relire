/**
 * Hash routes: parsing an address into a Route and building one back. Pure; the browser side
 * (history, events) lives in hooks/useRoute.ts. There is no router dependency.
 *
 *   #/read                   library
 *   #/read/:articleId        reader
 *   #/study/words            My study → Words
 *   #/study/shadowing        My study → Shadowing
 *   #/practice               drills
 *   #/progress               progress
 *   #/settings               section list on phones; desktop resolves it to the first section
 *   #/settings/:section      text-ai | speech | prompts | data | about
 */

export const SETTINGS_SECTIONS = ['text-ai', 'speech', 'prompts', 'data', 'about'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const STUDY_TABS = ['words', 'shadowing'] as const;
export type StudyTab = (typeof STUDY_TABS)[number];

export type Route =
  | { name: 'library' }
  | { name: 'reader'; articleId: string }
  | { name: 'study'; tab: StudyTab }
  | { name: 'practice' }
  | { name: 'progress' }
  /** `section: null` is the section list (phones). */
  | { name: 'settings'; section: SettingsSection | null }
  | { name: 'notFound' };

export const LIBRARY: Route = { name: 'library' };

const isSection = (s: string): s is SettingsSection => (SETTINGS_SECTIONS as readonly string[]).includes(s);
const isStudyTab = (s: string): s is StudyTab => (STUDY_TABS as readonly string[]).includes(s);

/** The address for a route, always in its canonical spelling. */
export function routeHref(route: Route): string {
  switch (route.name) {
    case 'library':
    case 'notFound':
      return '#/read';
    case 'reader':
      return `#/read/${encodeURIComponent(route.articleId)}`;
    case 'study':
      return `#/study/${route.tab}`;
    case 'practice':
      return '#/practice';
    case 'progress':
      return '#/progress';
    case 'settings':
      return route.section ? `#/settings/${route.section}` : '#/settings';
  }
}

/**
 * Reads an address. `canonical` is set when the address is valid but not spelled the canonical way
 * (an empty hash, a trailing slash, `#/study`); the caller replaces it in history instead of pushing.
 */
export function parseRoute(hash: string): { route: Route; canonical: string | null } {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  const parts = path === '' ? [] : path.split('/');

  let route: Route;
  const [area, sub, ...extra] = parts;
  if (!area) route = LIBRARY;
  else if (extra.length || parts.some((p) => p === '')) route = { name: 'notFound' };
  else if (area === 'read' && sub === undefined) route = LIBRARY;
  else if (area === 'read') {
    try {
      route = { name: 'reader', articleId: decodeURIComponent(sub) };
    } catch {
      route = { name: 'notFound' };
    }
  } else if (area === 'study' && sub === undefined) route = { name: 'study', tab: 'words' };
  else if (area === 'study' && isStudyTab(sub)) route = { name: 'study', tab: sub };
  else if (area === 'practice' && sub === undefined) route = { name: 'practice' };
  else if (area === 'progress' && sub === undefined) route = { name: 'progress' };
  else if (area === 'settings' && sub === undefined) route = { name: 'settings', section: null };
  else if (area === 'settings' && isSection(sub)) route = { name: 'settings', section: sub };
  else route = { name: 'notFound' };

  if (route.name === 'notFound') return { route, canonical: null };
  const href = routeHref(route);
  return { route, canonical: href === hash ? null : href };
}

/** Which area of the app a route belongs to (for highlighting the sidebar). */
export type Area = 'read' | 'study' | 'practice' | 'progress' | 'settings';

export function areaOf(route: Route): Area | null {
  switch (route.name) {
    case 'library':
    case 'reader':
      return 'read';
    case 'study':
    case 'practice':
    case 'progress':
    case 'settings':
      return route.name;
    case 'notFound':
      return null;
  }
}
