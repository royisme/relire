/** Canonical hash destinations. No aliases or legacy route decoding; browser history lives in useRoute. */
import { contentServiceUrl } from '../services/grammarTopics/service';
import { GRAMMAR_TAGS, type GrammarTag } from '../types/grammar';
import { LearningAreaSchema, learningAreaPath, type LearningArea } from '../types/learningArea';

export const SETTINGS_SECTIONS = ['ai', 'practice', 'words', 'prompts', 'data'] as const;
export const AI_PURPOSES = ['text', 'ocr', 'speech', 'assessment'] as const;
export type AiPurposeRoute = (typeof AI_PURPOSES)[number];
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const STUDY_TABS = ['words', 'shadowing', 'mistakes'] as const;
export type StudyTab = (typeof STUDY_TABS)[number];
export type GrammarSectionRoute = 'conjugation' | 'gender';
export type Route =
  | { name: 'today' }
  | { name: 'library' }
  | { name: 'importArticle' }
  | { name: 'importExercises'; area: LearningArea }
  | { name: 'reader'; articleId: string; sentence?: string }
  | { name: 'passage'; unitId: string; sentence?: string }
  | { name: 'gradedReaders' }
  | { name: 'gradedReader'; readerId: string; version?: string; sentence?: string }
  | { name: 'study'; tab: StudyTab }
  | { name: 'wordsAll' }
  | { name: 'wordsReview' }
  | { name: 'grammar'; section?: GrammarSectionRoute; verb?: string; tag?: GrammarTag }
  | { name: 'grammarTopic'; topicId: string }
  | { name: 'practice'; area: LearningArea }
  | { name: 'practiceSet'; area: LearningArea; setId: string }
  | { name: 'unit'; area: LearningArea; unitId: string }
  | { name: 'speaking' }
  | { name: 'readAloud'; articleId?: string; sentence?: string }
  | { name: 'progress' }
  | { name: 'about' }
  | {
      name: 'settings';
      section: SettingsSection | null;
      purpose?: AiPurposeRoute;
      focusKey?: boolean;
      returnTo?: string;
    }
  | { name: 'notFound' };
export const LIBRARY: Route = { name: 'library' };
const sentenceQuery = (sentence?: string) => (sentence ? `?sentence=${encodeURIComponent(sentence)}` : '');
/** Pinned graded-reader edition: a full SHA-256 body hash. */
const READER_VERSION = /^[0-9a-f]{64}$/;

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'today':
      return '#/today';
    case 'library':
    case 'notFound':
      return '#/read';
    case 'importArticle':
      return '#/import/article';
    case 'importExercises':
      return `#/import/exercises?area=${route.area}`;
    case 'reader':
      return `#/read/${encodeURIComponent(route.articleId)}${sentenceQuery(route.sentence)}`;
    case 'passage':
      return `#/passage/${encodeURIComponent(route.unitId)}${sentenceQuery(route.sentence)}`;
    case 'gradedReaders':
      return '#/read/graded';
    case 'gradedReader': {
      const query = [
        ...(route.version ? [`version=${route.version}`] : []),
        ...(route.sentence ? [`sentence=${encodeURIComponent(route.sentence)}`] : []),
      ].join('&');
      return `#/read/graded/${encodeURIComponent(route.readerId)}${query ? `?${query}` : ''}`;
    }
    case 'study':
      return `#/study/${route.tab}`;
    case 'wordsAll':
      return '#/study/words/all';
    case 'wordsReview':
      return '#/study/words/review';
    case 'grammar':
      if (route.section === 'gender') return '#/grammar/gender';
      if (route.section === 'conjugation')
        return `#/grammar/conjugation${route.verb ? `?verb=${encodeURIComponent(route.verb)}` : ''}`;
      return `#/grammar${route.tag ? `?tag=${encodeURIComponent(route.tag)}` : ''}`;
    case 'grammarTopic':
      return `#/grammar/topics/${encodeURIComponent(route.topicId)}`;
    case 'practice':
      return route.area === 'listening' || route.area === 'writing'
        ? `#/${route.area}`
        : `#/${learningAreaPath(route.area)}/exercises`;
    case 'practiceSet':
      return `#/${learningAreaPath(route.area)}/exercises/set/${encodeURIComponent(route.setId)}`;
    case 'unit':
      return `#/${learningAreaPath(route.area)}/exercises/unit/${encodeURIComponent(route.unitId)}`;
    case 'speaking':
      return '#/speaking';
    case 'readAloud':
      return `#/speaking/read-aloud${route.articleId ? `/${encodeURIComponent(route.articleId)}` : ''}${sentenceQuery(route.sentence)}`;
    case 'progress':
      return '#/progress';
    case 'about':
      return '#/about';
    case 'settings': {
      if (route.section !== 'ai') return route.section ? `#/settings/${route.section}` : '#/settings';
      const query = new URLSearchParams();
      if (route.focusKey) query.set('key', '1');
      if (route.returnTo) query.set('return', route.returnTo);
      return `#/settings/ai/${route.purpose ?? 'text'}${query.size ? `?${query}` : ''}`;
    }
  }
}

export function parseRoute(
  hash: string,
  hasContentService = !!contentServiceUrl(),
): { route: Route; canonical: string | null } {
  let route: Route = { name: 'notFound' };
  const [rawPath, query = ''] = hash.split('?', 2);
  const path = rawPath.replace(/^#\/?/, '').replace(/\/$/, '');
  const parts = path ? path.split('/') : [];
  const [root, sub, third, fourth] = parts;
  const params = new URLSearchParams(query);
  const focus = params.get('sentence');
  const sentence = focus && focus.trim() && focus.length <= 4000 ? focus : undefined;
  const focused = sentence ? { sentence } : {};
  const area =
    root === 'read'
      ? 'reading'
      : root !== 'reading' && LearningAreaSchema.safeParse(root).success
        ? (root as LearningArea)
        : undefined;
  try {
    if (parts.some((part) => !part)) return { route, canonical: null };
    if (!parts.length) route = { name: 'today' };
    else if (root === 'today' && parts.length === 1 && !hash.includes('?')) route = { name: 'today' };
    else if (area && sub === 'exercises' && parts.length === 4 && ['unit', 'set'].includes(third) && !query) {
      const id = decodeURIComponent(fourth);
      route = third === 'unit' ? { name: 'unit', area, unitId: id } : { name: 'practiceSet', area, setId: id };
    } else if ((area === 'reading' || area === 'grammar') && sub === 'exercises' && parts.length === 2 && !query)
      route = { name: 'practice', area };
    else if ((root === 'listening' || root === 'writing') && parts.length === 1)
      route = { name: 'practice', area: root };
    else if (root === 'read' && parts.length === 1) route = LIBRARY;
    else if (root === 'read' && sub === 'graded' && parts.length === 2) route = { name: 'gradedReaders' };
    else if (root === 'read' && sub === 'graded' && parts.length === 3) {
      const version = params.get('version');
      if (version === null || READER_VERSION.test(version))
        route = {
          name: 'gradedReader',
          readerId: decodeURIComponent(third),
          ...(version ? { version } : {}),
          ...focused,
        };
    } else if (root === 'read' && parts.length === 2 && !['exercises', 'graded'].includes(decodeURIComponent(sub)))
      route = { name: 'reader', articleId: decodeURIComponent(sub), ...focused };
    else if (root === 'passage' && parts.length === 2)
      route = { name: 'passage', unitId: decodeURIComponent(sub), ...focused };
    else if (root === 'import' && sub === 'article' && parts.length === 2) route = { name: 'importArticle' };
    else if (root === 'import' && sub === 'exercises' && parts.length === 2) {
      const result = LearningAreaSchema.safeParse(params.get('area'));
      if (result.success) route = { name: 'importExercises', area: result.data };
    } else if (root === 'grammar' && parts.length === 1) {
      const tag = params.get('tag') as GrammarTag;
      route = hasContentService
        ? { name: 'grammar', ...(GRAMMAR_TAGS.includes(tag) ? { tag } : {}) }
        : { name: 'grammar', section: 'conjugation' };
    } else if (root === 'grammar' && parts.length === 2 && ['conjugation', 'gender'].includes(sub)) {
      const verb = params.get('verb')?.trim();
      route =
        sub === 'gender'
          ? { name: 'grammar', section: 'gender' }
          : { name: 'grammar', section: 'conjugation', ...(verb ? { verb } : {}) };
    } else if (root === 'grammar' && sub === 'topics' && parts.length === 3 && hasContentService)
      route = { name: 'grammarTopic', topicId: decodeURIComponent(third) };
    else if (root === 'study' && parts.length === 1) route = { name: 'study', tab: 'words' };
    else if (root === 'study' && parts.length === 2 && (STUDY_TABS as readonly string[]).includes(sub))
      route = { name: 'study', tab: sub as StudyTab };
    else if (root === 'study' && sub === 'words' && parts.length === 3 && !query && ['all', 'review'].includes(third))
      route = { name: third === 'all' ? 'wordsAll' : 'wordsReview' };
    else if (root === 'speaking' && parts.length === 1) route = { name: 'speaking' };
    else if (root === 'speaking' && sub === 'read-aloud' && parts.length <= 3)
      route = { name: 'readAloud', ...(third ? { articleId: decodeURIComponent(third) } : {}), ...focused };
    else if (root === 'progress' && parts.length === 1) route = { name: 'progress' };
    else if (root === 'about' && parts.length === 1) route = { name: 'about' };
    else if (root === 'settings' && parts.length === 1) route = { name: 'settings', section: null };
    else if (
      root === 'settings' &&
      sub === 'ai' &&
      (parts.length === 2 || (parts.length === 3 && (AI_PURPOSES as readonly string[]).includes(third)))
    ) {
      const returnTo = params.get('return');
      route = {
        name: 'settings',
        section: 'ai',
        purpose: (third ?? 'text') as AiPurposeRoute,
        ...(params.get('key') === '1' ? { focusKey: true } : {}),
        ...(returnTo?.startsWith('#/') && !returnTo.includes('?return=') ? { returnTo } : {}),
      };
    } else if (root === 'settings' && parts.length === 2 && (SETTINGS_SECTIONS as readonly string[]).includes(sub))
      route = { name: 'settings', section: sub as SettingsSection };
  } catch {
    route = { name: 'notFound' };
  }
  if (route.name === 'notFound') return { route, canonical: null };
  const href = routeHref(route);
  return { route, canonical: href === hash ? null : href };
}

/** Today needs no AI; graded readers use authored text and the device voice. */
export const worksWithoutKey = (route: Route) =>
  route.name === 'today' || route.name === 'gradedReaders' || route.name === 'gradedReader';

export type Area =
  | 'today'
  | 'read'
  | 'grammar'
  | 'listening'
  | 'writing'
  | 'speaking'
  | 'study'
  | 'progress'
  | 'settings'
  | 'about';
export function areaOf(route: Route): Area | null {
  switch (route.name) {
    case 'library':
    case 'importArticle':
    case 'reader':
    case 'passage':
    case 'gradedReaders':
    case 'gradedReader':
      return 'read';
    case 'wordsAll':
    case 'wordsReview':
    case 'study':
      return 'study';
    case 'grammar':
    case 'grammarTopic':
      return 'grammar';
    case 'practice':
    case 'practiceSet':
    case 'importExercises':
    case 'unit':
      return learningAreaPath(route.area);
    case 'readAloud':
    case 'speaking':
      return 'speaking';
    case 'today':
    case 'progress':
    case 'settings':
    case 'about':
      return route.name;
    case 'notFound':
      return null;
  }
}
