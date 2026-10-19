/**
 * Hash routes: parsing an address into a Route and building one back. Pure; the browser side
 * (history, events) lives in hooks/useRoute.ts. There is no router dependency.
 *
 *   #/read                   library
 *   #/import/article         import an article from an image, a PDF or pasted text (Read)
 *   #/import/exercises       import exercises from a worksheet (Practice)
 *   #/read/:articleId        material reader
 *   #/passage/:unitId        a unit's reading passage in the same Reader
 *   Reader routes accept ?sentence=… for durable shadowing-log focus
 *   #/study/words            My study → Words
 *   #/study/shadowing        My study → Shadowing
 *   #/study/mistakes         My study → Mistakes
 *   #/study/grammar          My study → Grammar topics; accepts ?tag=<GrammarTag>
 *   #/study/grammar/conjugation  Conjugation; accepts ?verb=<infinitive>
 *   #/study/grammar/:topicId  a published topic (conjugation and gender are reserved)
 *   #/practice               practice: the exercise sets
 *   #/practice/set/:setId     one set and its exercise table
 *   #/practice/:unitId       one exercise unit on one sheet
 *   #/progress               progress
 *   #/settings               section list on phones; desktop resolves it to the first section
 *   #/settings/:section      ai/:purpose | practice | prompts | data
 *   #/about                  About
 */

import { contentServiceUrl } from '../services/grammarTopics/service';
import { GRAMMAR_TAGS, type GrammarTag } from '../types/grammar';

export const SETTINGS_SECTIONS = ['ai', 'practice', 'prompts', 'data'] as const;
export const AI_PURPOSES = ['text', 'ocr', 'speech'] as const;
export type AiPurposeRoute = (typeof AI_PURPOSES)[number];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const STUDY_TABS = ['words', 'shadowing', 'mistakes', 'grammar'] as const;
export type StudyTab = (typeof STUDY_TABS)[number];

export type Route =
  | { name: 'library' }
  | { name: 'importArticle' }
  | { name: 'importExercises' }
  | { name: 'reader'; articleId: string; sentence?: string }
  | { name: 'passage'; unitId: string; sentence?: string }
  /** `verb` prefills the Conjugation page (Grammar tab) and runs it once. */
  | { name: 'study'; tab: StudyTab; section?: 'conjugation'; verb?: string; tag?: GrammarTag }
  | { name: 'grammarTopic'; topicId: string }
  | { name: 'practice' }
  | { name: 'practiceSet'; setId: string }
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
    case 'importArticle':
      return '#/import/article';
    case 'importExercises':
      return '#/import/exercises';
    case 'reader':
      return `#/read/${encodeURIComponent(route.articleId)}${sentenceQuery(route.sentence)}`;
    case 'passage':
      return `#/passage/${encodeURIComponent(route.unitId)}${sentenceQuery(route.sentence)}`;
    case 'study':
      if (route.tab === 'grammar') {
        if (route.section === 'conjugation')
          return `#/study/grammar/conjugation${route.verb ? `?verb=${encodeURIComponent(route.verb)}` : ''}`;
        return `#/study/grammar${route.tag ? `?tag=${encodeURIComponent(route.tag)}` : ''}`;
      }
      return `#/study/${route.tab}`;
    case 'grammarTopic':
      return `#/study/grammar/${encodeURIComponent(route.topicId)}`;
    case 'practice':
      return '#/practice';
    case 'practiceSet':
      return `#/practice/set/${encodeURIComponent(route.setId)}`;
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
export function parseRoute(
  hash: string,
  hasContentService = !!contentServiceUrl(),
): { route: Route; canonical: string | null } {
  const [rawPath, query = ''] = hash.split('?', 2);
  const path = rawPath.replace(/^#\/?/, '').replace(/\/$/, '');
  const parts = path === '' ? [] : path.split('/');

  let route: Route;
  const [area, sub, ...extra] = parts;
  const focus = new URLSearchParams(query).get('sentence');
  const sentence = focus && focus.trim() && focus.length <= 4000 ? focus : undefined;
  if (area === 'passage' && parts.length === 2 && parts.every(Boolean)) {
    try {
      route = { name: 'passage', unitId: decodeURIComponent(sub), ...(sentence ? { sentence } : {}) };
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
  } else if (
    area === 'study' &&
    sub === 'grammar' &&
    (extra.length === 0 || (extra.length === 1 && extra[0] === 'conjugation'))
  ) {
    const params = new URLSearchParams(query);
    if (extra[0] === 'conjugation' || !hasContentService) {
      const verb = params.get('verb')?.trim();
      route = {
        name: 'study',
        tab: 'grammar',
        section: 'conjugation',
        ...(extra[0] === 'conjugation' && verb ? { verb } : {}),
      };
    } else {
      const tag = params.get('tag') as GrammarTag;
      route = { name: 'study', tab: 'grammar', ...(GRAMMAR_TAGS.includes(tag) ? { tag } : {}) };
    }
  } else if (area === 'study' && sub === 'grammar' && extra.length === 1 && extra[0]) {
    try {
      const topicId = decodeURIComponent(extra[0]);
      route =
        !hasContentService || ['conjugation', 'gender'].includes(topicId)
          ? { name: 'notFound' }
          : { name: 'grammarTopic', topicId };
    } catch {
      route = { name: 'notFound' };
    }
  } else if (area === 'practice' && sub === 'set' && extra.length === 1 && extra[0] && !query) {
    // Match sets first. Unit ids start with `unit-`, so the reserved `set` segment cannot collide.
    try {
      route = { name: 'practiceSet', setId: decodeURIComponent(extra[0]) };
    } catch {
      route = { name: 'notFound' };
    }
  } else if (!area) route = LIBRARY;
  else if (extra.length || parts.some((p) => p === '')) route = { name: 'notFound' };
  else if (area === 'import' && sub === 'article') route = { name: 'importArticle' };
  else if (area === 'import' && sub === 'exercises') route = { name: 'importExercises' };
  else if (area === 'read' && sub === undefined) route = LIBRARY;
  else if (area === 'read') {
    try {
      route = { name: 'reader', articleId: decodeURIComponent(sub), ...(sentence ? { sentence } : {}) };
    } catch {
      route = { name: 'notFound' };
    }
  } else if (area === 'study' && sub === undefined) route = { name: 'study', tab: 'words' };
  else if (area === 'study' && isStudyTab(sub)) route = { name: 'study', tab: sub };
  else if (area === 'practice' && sub === undefined) route = { name: 'practice' };
  else if (area === 'practice' && sub !== 'set' && !query) {
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
    case 'importArticle':
    case 'reader':
    case 'passage':
      return 'read';
    case 'grammarTopic':
      return 'study';
    case 'study':
    case 'progress':
    case 'settings':
    case 'about':
      return route.name;
    case 'practice':
    case 'practiceSet':
    case 'importExercises':
    case 'unit':
      return 'practice';
    case 'notFound':
      return null;
  }
}
