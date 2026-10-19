/**
 * Test fixtures: an onboarded app with a fake key, every Gemini request answered
 * from per-task fixtures (chosen by prompt text), and layout helpers. Exercise tasks
 * are answered from the shared catalogue (tests/fixtures/exerciseCatalog.ts), so
 * e2e and unit tests practise the same 11-type set. Fixtures never contain invented
 * phonetic data by default; tests supply what they assert.
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { mockIndex, mockLexicon, mockTopics } from './contentService.helpers';
import {
  CATALOG_ARTICLE,
  CATALOG_EXERCISES,
  CATALOG_EXPLANATION,
  CATALOG_HINT,
  CATALOG_OPEN_GRADE,
} from '../tests/fixtures/exerciseCatalog';

type Task =
  | 'adaptive'
  | 'extract'
  | 'transcribe'
  | 'word'
  | 'conjugate'
  | 'sentence'
  | 'pronunciation'
  | 'prosody'
  | 'exercises'
  | 'hint'
  | 'explain'
  | 'grade';
/** A fixed answer, or a function of the prompt that returns one (possibly async). */
type Answer = unknown;

/** The sentence a prosody prompt annotates. */
export function prosodySentence(prompt: string): string {
  return JSON.parse(prompt.match(/^".*"$/m)?.[0] || '""');
}

/** Every reader token in a prosody prompt, as listed by `enumeratedReaderWords`. */
export function prosodyTokens(prompt: string): { ordinal: number; source: string }[] {
  return JSON.parse(prompt.match(/^\[\{"ordinal":.*$/m)?.[0] || '[]');
}

/** The catalogue item a hint, explanation or grade prompt is about, by the item's prompt text. */
function catalogueItem(prompt: string) {
  return CATALOG_EXERCISES.units.flatMap((unit) => unit.items).find((item) => prompt.includes(item.prompt));
}

/** A default with no catalogue answer for this request: fail with guidance instead of inventing one. */
const noCatalogAnswer = (task: Task, about: string): never => {
  throw new Error(`No default ${task} answer for ${about}; give this spec an explicit ai.answer({ ${task} }) override`);
};

export const defaultAnswers: Record<Task, Answer> = {
  adaptive: () => noCatalogAnswer('adaptive', 'these targets'),
  extract: () => noCatalogAnswer('extract', 'this source'),
  transcribe: () => noCatalogAnswer('transcribe', 'these pages'),
  word: {
    word: 'chose',
    lemma: 'chose',
    partOfSpeech: 'nom',
    ipa: '/ʃoz/',
    phoneticsGuide: '',
    translation: 'thing',
    otherMeanings: [],
    contextTense: '',
    usageExamples: [{ fr: 'Quelle chose !', zh: '', highlight: 'chose' }],
    cefrLevel: 'A1',
    memoryTrick: '',
  },
  // Conjugation answers depend on the verb asked, so each spec supplies its own ai.answer({ conjugate }).
  conjugate: () => noCatalogAnswer('conjugate', 'a verb the spec did not give an answer for'),
  sentence: {
    sentence: 'Je suis en vacances !',
    translation: 'I am on holiday!',
    syntaxStructure: [],
    grammarPoints: [],
    patternCollocations: [],
    shadowingGuide: {
      speedTip: 'Slow, then natural.',
      rhythmGroups: ['Je suis', 'en vacances !'],
      liaisons: [],
      intonation: 'Falling at the end.',
    },
  },
  pronunciation: {
    overallScore: 80,
    accuracyScore: 81,
    fluencyScore: 79,
    rhythmScore: 78,
    phonemeFeedback: [],
    corrections: [],
    coachingNotes: '',
  },
  // Exercise tasks: answered with the catalogue, which is written about CATALOG_ARTICLE (the
  // "petit-prince" sample article) and carries one hint, one explanation and one open grade, for
  // fb-1, fb-1 and qa-1. A request about anything else needs an explicit ai.answer override.
  exercises: (prompt: string) =>
    // The prompt embeds the article trimmed (the app's 8,000-character cap is far above the sample).
    prompt.includes(CATALOG_ARTICLE.trim())
      ? CATALOG_EXERCISES
      : noCatalogAnswer('exercises', 'an article other than CATALOG_ARTICLE'),
  hint: (prompt: string) =>
    catalogueItem(prompt)?.id === 'fb-1' ? CATALOG_HINT : noCatalogAnswer('hint', 'an item other than fb-1'),
  explain: (prompt: string) =>
    catalogueItem(prompt)?.id === 'fb-1' ? CATALOG_EXPLANATION : noCatalogAnswer('explain', 'an item other than fb-1'),
  grade: (prompt: string) =>
    catalogueItem(prompt)?.id === 'qa-1' ? CATALOG_OPEN_GRADE : noCatalogAnswer('grade', 'an item other than qa-1'),
  // Source-addressed and unresolved: only the built-in function-word table resolves anything.
  prosody: (prompt: string) => ({
    words: prosodyTokens(prompt).map(({ ordinal, source }) => ({
      ordinal,
      source,
      status: 'unresolved',
      syllables: [],
      groupEnd: false,
    })),
    connections: [],
  }),
};

/** Which task a request is for, from the shipped prompt text (src/services/ai/prompts/defaults). */
function taskOf(body: string): Task {
  if (/Give the conjugation of the French verb|给出法语动词.+的变位/.test(body)) return 'conjugate';
  if (/French test curriculum designer|法语.*课程设计/.test(body)) return 'adaptive';
  if (/Turn the French workbook material into an exercise draft|请把下面的法语练习材料整理成一份练习草稿/.test(body))
    return 'extract';
  if (/Transcribe the attached images into one French article|请把附图转录成一篇法语文章/.test(body))
    return 'transcribe';
  if (/task: prosody|任务：prosody/i.test(body)) return 'prosody';
  if (/phonetics (professor|coach)|语音学教授/i.test(body)) return 'pronunciation';
  if (/Create practice from an article that a learner is reading|根据学习者正在阅读的一篇法语文章/.test(body))
    return 'exercises';
  if (/has asked for a hint|并请求提示/.test(body)) return 'hint';
  if (/explain the rule behind the expected answer|解释标准答案背后的规则/.test(body)) return 'explain';
  if (/grading a learner's open-ended French answer|批改学习者的一道开放式/.test(body)) return 'grade';
  if (/syntax breakdown|shadowing guide|句法拆解/i.test(body)) return 'sentence';
  return 'word';
}

export interface MockAi {
  /** Requests per task, plus `tts`. The provider's model fallback can send several per logical call. */
  calls: Record<Task | 'tts', number>;
  /** Prompt text of every text request, per task, in order. */
  prompts: Record<Task, string[]>;
  /** Replace answers for some tasks; takes effect on the next request. */
  answer(answers: Partial<Record<Task, Answer>>): void;
  /** Tasks that answer HTTP 500 from now on (empty array restores success). */
  fail(tasks: (Task | 'tts')[]): void;
  /** Milliseconds each speech clip takes, to observe loading states. */
  ttsDelayMs: number;
}

const silence = Buffer.alloc(24000 * 2).toString('base64'); // 1 s of 24 kHz 16-bit PCM

export const test = base.extend<{ ai: MockAi }>({
  page: async ({ page }, use) => {
    await mockTopics(page);
    await mockIndex(page);
    await mockLexicon(page);
    await use(page);
  },
  ai: async ({ page }, use) => {
    const answers = { ...defaultAnswers };
    const failing = new Set<string>();
    const ai: MockAi = {
      calls: {
        adaptive: 0,
        extract: 0,
        transcribe: 0,
        tts: 0,
        word: 0,
        conjugate: 0,
        sentence: 0,
        pronunciation: 0,
        prosody: 0,
        exercises: 0,
        hint: 0,
        explain: 0,
        grade: 0,
      },
      prompts: {
        adaptive: [],
        extract: [],
        transcribe: [],
        word: [],
        conjugate: [],
        sentence: [],
        pronunciation: [],
        prosody: [],
        exercises: [],
        hint: [],
        explain: [],
        grade: [],
      },
      answer: (next) => Object.assign(answers, next),
      fail: (tasks) => {
        failing.clear();
        tasks.forEach((task) => failing.add(task));
      },
      ttsDelayMs: 300,
    };
    page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
    await page.addInitScript(() => {
      localStorage.setItem('relire_onboarded', '1');
      if (!localStorage.getItem('relire_app_settings_v1'))
        localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: { gemini: 'TEST' } }));
    });
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const request = route.request();
      if (request.url().includes('-tts:')) {
        ai.calls.tts++;
        await new Promise((resolve) => setTimeout(resolve, ai.ttsDelayMs));
        if (failing.has('tts')) return route.fulfill({ status: 500, body: '{"error":{"message":"tts failed"}}' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: silence } }] } }],
          }),
        });
      }
      const body = JSON.parse(request.postData() || '{}');
      const prompt = (body.contents || [])
        .flatMap((content: { parts?: { text?: string }[] }) => content.parts || [])
        .map((part: { text?: string }) => part.text || '')
        .join('\n');
      const task = taskOf(prompt);
      ai.calls[task]++;
      ai.prompts[task].push(prompt);
      if (failing.has(task)) return route.fulfill({ status: 500, body: `{"error":{"message":"${task} failed"}}` });
      const answer = answers[task];
      let value: unknown;
      try {
        value = typeof answer === 'function' ? await answer(prompt) : answer;
      } catch (error) {
        // A default that does not cover this request: say so, so a missing spec override fails loudly.
        return route.fulfill({ status: 500, body: JSON.stringify({ error: { message: String(error) } }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
      });
    });
    await use(ai);
  },
});

export { expect };

/** Opens a sample article from the library by its title. */
export async function openArticle(page: Page, title = 'Le Petit Prince') {
  await page.goto('/');
  await page.getByText(title).first().click();
  await expect(page.locator('article [data-sentence]').first()).toBeVisible();
  await settled(page);
}

/** Waits for fonts and two equal layout readings, so "before" measurements are not mid-load. */
export async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await layout(page, 'body'));
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [100] },
    )
    .toBe(true);
}

/** Document size and the top of `selector`, to assert that an action did not move the page. */
export async function layout(page: Page, selector = 'main') {
  return page.evaluate(
    (sel) => ({
      top: Math.round((document.querySelector(sel)?.getBoundingClientRect().top ?? NaN) + scrollY),
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
    }),
    selector,
  );
}

/** Elements inside `root` that stick out of it horizontally. Empty means no overflow. */
export async function overflowing(root: Locator) {
  return root.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const out: string[] = [];
    el.querySelectorAll('*').forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > box.right + 1 || rect.left < box.left - 1))
        out.push(`${node.tagName}.${String(node.className).slice(0, 40)}`);
    });
    return out;
  });
}
