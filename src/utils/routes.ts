/**
 * Hash routes: parsing an address into a Route and building one back. Pure; the browser side
 * (history, events) lives in hooks/useRoute.ts. There is no router dependency.
 *
 *   #/read                   library
 *   #/import                 material import workspace
 *   #/read/:articleId        material reader
 *   #/passage/:materialId/:unitId  unit passage in the same Reader
 *   Reader routes accept ?sentence=… for durable shadowing-log focus
 *   #/study/words            My study → Words
 *   #/study/shadowing        My study → Shadowing
 *   #/study/mistakes         My study → Mistakes
 *   #/practice               practice: an article's exercise units (`?article=:articleId` picks the article)
 *   #/practice/:unitId       one exercise unit on one sheet
 *   #/progress               progress
 *   #/settings               section list on phones; desktop resolves it to the first section
 *   #/settings/:section      ai/:purpose | practice | prompts | data
 *   #/about                  About
 */

export const SETTINGS_SECTIONS = ['ai', 'practice', 'prompts', 'data'] as const;
export const AI_PURPOSES = ['text', 'ocr', 'speech'] as const;
export type AiPurposeRoute = (typeof AI_PURPOSES)[number];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const STUDY_TABS = ['words', 'shadowing', 'mistakes'] as const;
export type StudyTab = (typeof STUDY_TABS)[number];

export type Route =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'reader'; articleId: string; sentence?: string }
  | { name: 'passage'; materialId: string; unitId: string; sentence?: string }
  | { name: 'study'; tab: StudyTab }
  /** `articleId` is the material whose units are listed; absent means the app's default (the article read last). */
  | { name: 'practice'; articleId?: string }
  | { name: 'unit'; unitId: string }
  | { name: 'progress' }
  | { name: 'about' }
  /** `section: null` is the section list (phones). */
  | {
      name: 'settings';
      section: SettingsSection | null;
      purpose?: AiPurposeRoute;
      focusKey?: boolean;
      returnTo?: string;
    }
  | { name: 'notFound' };

export const LIBRARY: Route = { name: 'library' };

const isSection = (s: string): s is SettingsSection => (SETTINGS_SECTIONS as readonly string[]).includes(s);
const isStudyTab = (s: string): s is StudyTab => (STUDY_TABS as readonly string[]).includes(s);

const sentenceQuery = (sentence?: string) => (sentence ? `?sentence=${encodeURIComponent(sentence)}` : '');

/** The address for a route, always in its canonical spelling. */
export function routeHref(route: Route): string {
  switch (route.name) {
    case 'library':
    case 'notFound':
      return '#/read';
    case 'import':
      return '#/import';
    case 'reader':
      return `#/read/${encodeURIComponent(route.articleId)}${sentenceQuery(route.sentence)}`;
    case 'passage':
      return `#/passage/${encodeURIComponent(route.materialId)}/${encodeURIComponent(route.unitId)}${sentenceQuery(route.sentence)}`;
    case 'study':
      return `#/study/${route.tab}`;
    case 'practice':
      return route.articleId ? `#/practice?article=${encodeURIComponent(route.articleId)}` : '#/practice';
    case 'unit':
      return `#/practice/${encodeURIComponent(route.unitId)}`;
    case 'progress':
      return '#/progress';
    case 'about':
      return '#/about';
    case 'settings':
      if (route.section === 'ai') {
        const query = new URLSearchParams();
        if (route.focusKey) query.set('key', '1');
        if (route.returnTo) query.set('return', route.returnTo);
        return `#/settings/ai/${route.purpose ?? 'text'}${query.size ? `?${query}` : ''}`;
      }
      return route.section ? `#/settings/${route.section}` : '#/settings';
  }
}

/**
 * Reads an address. `canonical` is set when the address is valid but not spelled the canonical way
 * (an empty hash, a trailing slash, `#/study`); the caller replaces it in history instead of pushing.
 */
export function parseRoute(hash: string): { route: Route; canonical: string | null } {
  const [rawPath, query = ''] = hash.split('?', 2);
  const path = rawPath.replace(/^#\/?/, '').replace(/\/$/, '');
  const parts = path === '' ? [] : path.split('/');

  let route: Route;
  const [area, sub, ...extra] = parts;
  const focus = new URLSearchParams(query).get('sentence');
  const sentence = focus && focus.trim() && focus.length <= 4000 ? focus : undefined;
  if (area === 'passage' && parts.length === 3 && parts.every(Boolean)) {
    try {
      route = {
        name: 'passage',
        materialId: decodeURIComponent(sub),
        unitId: decodeURIComponent(extra[0]),
        ...(sentence ? { sentence } : {}),
      };
    } catch {
      route = { name: 'notFound' };
    }
  } else if (
    area === 'settings' &&
    sub === 'ai' &&
    (extra.length === 0 || (extra.length === 1 && (AI_PURPOSES as readonly string[]).includes(extra[0])))
  ) {
    const params = new URLSearchParams(query);
    const returnTo = params.get('return');
    route = {
      name: 'settings',
      section: 'ai',
      purpose: (extra[0] ?? 'text') as AiPurposeRoute,
      ...(params.get('key') === '1' ? { focusKey: true } : {}),
      ...(returnTo?.startsWith('#/') && !returnTo.includes('?return=') ? { returnTo } : {}),
    };
  } else if (!area) route = LIBRARY;
  else if (extra.length || parts.some((p) => p === '')) route = { name: 'notFound' };
  else if (area === 'import' && sub === undefined) route = { name: 'import' };
  else if (area === 'read' && sub === undefined) route = LIBRARY;
  else if (area === 'read') {
    try {
      route = { name: 'reader', articleId: decodeURIComponent(sub), ...(sentence ? { sentence } : {}) };
    } catch {
      route = { name: 'notFound' };
    }
  } else if (area === 'study' && sub === undefined) route = { name: 'study', tab: 'words' };
  else if (area === 'study' && isStudyTab(sub)) route = { name: 'study', tab: sub };
  else if (area === 'practice' && sub === undefined) {
    const articleId = new URLSearchParams(query).get('article');
    route = articleId ? { name: 'practice', articleId } : { name: 'practice' };
  } else if (area === 'practice' && !query) {
    try {
      route = { name: 'unit', unitId: decodeURIComponent(sub) };
    } catch {
      route = { name: 'notFound' };
    }
  } else if (area === 'progress' && sub === undefined) route = { name: 'progress' };
  else if (area === 'about' && sub === undefined) route = { name: 'about' };
  else if (area === 'settings' && sub === undefined) route = { name: 'settings', section: null };
  else if (area === 'settings' && isSection(sub)) route = { name: 'settings', section: sub };
  else route = { name: 'notFound' };

  if (route.name === 'notFound') return { route, canonical: null };
  const href = routeHref(route);
  return { route, canonical: href === hash ? null : href };
}

/** Which area of the app a route belongs to (for highlighting the sidebar). */
export type Area = 'read' | 'study' | 'practice' | 'progress' | 'settings' | 'about';

export function areaOf(route: Route): Area | null {
  switch (route.name) {
    case 'library':
    case 'import':
    case 'reader':
    case 'passage':
      return 'read';
    case 'study':
    case 'progress':
    case 'settings':
    case 'about':
      return route.name;
    case 'practice':
    case 'unit':
      return 'practice';
    case 'notFound':
      return null;
  }
}
