/**
 * Test fixtures: an onboarded app with a fake key, every Gemini request answered
 * from per-task fixtures (chosen by prompt text), and layout helpers. Fixtures
 * never contain invented phonetic data by default; tests supply what they assert.
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test';

type Task = 'word' | 'sentence' | 'drills' | 'pronunciation' | 'prosody';
type Answer = unknown | ((prompt: string) => unknown | Promise<unknown>);

/** The sentence a prosody prompt annotates. */
export function prosodySentence(prompt: string): string {
  return JSON.parse(prompt.match(/^".*"$/m)?.[0] || '""');
}

/** Every reader token in a prosody prompt, as listed by `enumeratedReaderWords`. */
export function prosodyTokens(prompt: string): { ordinal: number; source: string }[] {
  return JSON.parse(prompt.match(/^\[\{"ordinal":.*$/m)?.[0] || '[]');
}

export const defaultAnswers: Record<Task, Answer> = {
  word: { word: 'chose', lemma: 'chose', partOfSpeech: 'nom', ipa: '/ʃoz/', phoneticsGuide: '', translation: 'thing', otherMeanings: [], contextTense: '', conjugationTable: [], usageExamples: [{ fr: 'Quelle chose !', zh: '', highlight: 'chose' }], cefrLevel: 'A1', memoryTrick: '' },
  sentence: { sentence: 'Je suis en vacances !', translation: 'I am on holiday!', syntaxStructure: [], grammarPoints: [], patternCollocations: [], shadowingGuide: { speedTip: 'Slow, then natural.', rhythmGroups: ['Je suis', 'en vacances !'], liaisons: [], intonation: 'Falling at the end.' } },
  drills: { title: 'Drill', description: '', questions: [{ id: 1, type: 'oral', targetSentence: 'Je suis en vacances !', prompt: 'Read aloud', scrambledChunks: [], clozeText: '', options: [], correctOptionIndex: 0, grammarHint: '', shadowingAudioPrompt: '' }] },
  pronunciation: { overallScore: 80, accuracyScore: 81, fluencyScore: 79, rhythmScore: 78, phonemeFeedback: [], corrections: [], coachingNotes: '' },
  // Source-addressed and unresolved: only the built-in function-word table resolves anything.
  prosody: (prompt: string) => ({
    words: prosodyTokens(prompt).map(({ ordinal, source }) => ({ ordinal, source, status: 'unresolved', syllables: [], groupEnd: false })),
    connections: [],
  }),
};

/** Which task a request is for, from the shipped prompt text (src/services/ai/prompts/defaults). */
function taskOf(body: string): Task {
  if (/task: prosody|任务：prosody/i.test(body)) return 'prosody';
  if (/phonetics (professor|coach)|语音学教授/i.test(body)) return 'pronunciation';
  if (/practice drills|interactive practice|法语篇章/i.test(body)) return 'drills';
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
  ai: async ({ page }, use) => {
    const answers = { ...defaultAnswers };
    const failing = new Set<string>();
    const ai: MockAi = {
      calls: { tts: 0, word: 0, sentence: 0, drills: 0, pronunciation: 0, prosody: 0 },
      prompts: { word: [], sentence: [], drills: [], pronunciation: [], prosody: [] },
      answer: (next) => Object.assign(answers, next),
      fail: (tasks) => { failing.clear(); tasks.forEach((task) => failing.add(task)); },
      ttsDelayMs: 300,
    };
    page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
    await page.addInitScript(() => {
      localStorage.setItem('relire_onboarded', '1');
      if (!localStorage.getItem('relire_app_settings_v1')) localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: { gemini: 'TEST' } }));
    });
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const request = route.request();
      if (request.url().includes('-tts:')) {
        ai.calls.tts++;
        await new Promise((resolve) => setTimeout(resolve, ai.ttsDelayMs));
        if (failing.has('tts')) return route.fulfill({ status: 500, body: '{"error":{"message":"tts failed"}}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: silence } }] } }] }) });
      }
      const body = JSON.parse(request.postData() || '{}');
      const prompt = (body.contents || []).flatMap((content: { parts?: { text?: string }[] }) => content.parts || []).map((part: { text?: string }) => part.text || '').join('\n');
      const task = taskOf(prompt);
      ai.calls[task]++;
      ai.prompts[task].push(prompt);
      if (failing.has(task)) return route.fulfill({ status: 500, body: `{"error":{"message":"${task} failed"}}` });
      const answer = answers[task];
      const value = typeof answer === 'function' ? await answer(prompt) : answer;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) });
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
}

/** Document size and the top of `selector`, to assert that an action did not move the page. */
export async function layout(page: Page, selector = 'main') {
  return page.evaluate((sel) => ({
    top: Math.round((document.querySelector(sel)?.getBoundingClientRect().top ?? NaN) + scrollY),
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
  }), selector);
}

/** Elements inside `root` that stick out of it horizontally. Empty means no overflow. */
export async function overflowing(root: Locator) {
  return root.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const out: string[] = [];
    el.querySelectorAll('*').forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > box.right + 1 || rect.left < box.left - 1)) out.push(`${node.tagName}.${String(node.className).slice(0, 40)}`);
    });
    return out;
  });
}
