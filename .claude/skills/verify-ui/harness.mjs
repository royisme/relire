// Headless check harness for Relire: opens the app with a fake API key, answers every AI call
// from fixtures (no network, no real key), and offers layout assertions.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  for (const dir of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const bin = path.join(root, dir, 'chrome-linux', 'chrome');
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}

/** Answers per AI task. Override any of them; each is the JSON object the task returns. */
export const defaultFixtures = {
  word: { word: 'chose', lemma: 'chose', partOfSpeech: 'nom', ipa: '/ʃoz/', phoneticsGuide: '', translation: 'thing', otherMeanings: [], contextTense: '', conjugationTable: [], usageExamples: [{ fr: 'Quelle chose !', zh: '', highlight: 'chose' }], cefrLevel: 'A1', memoryTrick: '' },
  sentence: { sentence: 'Je suis en vacances !', translation: 'I am on holiday!', syntaxStructure: [], grammarPoints: [], patternCollocations: [], shadowingGuide: { speedTip: 'Slow, then natural.', rhythmGroups: ['Je suis', 'en vacances !'], liaisons: [], intonation: 'Falling at the end.' } },
  drills: { title: 'Drill', description: '', questions: [{ id: 1, type: 'oral', targetSentence: 'Je suis en vacances !', prompt: 'Read aloud', scrambledChunks: [], clozeText: '', options: [], correctOptionIndex: 0, grammarHint: '', shadowingAudioPrompt: '' }] },
  pronunciation: { overallScore: 80, accuracyScore: 81, fluencyScore: 79, rhythmScore: 78, phonemeFeedback: [], corrections: [], coachingNotes: '' },
};

/** Which task a request is for, from the prompt text (see src/services/ai/prompts/defaults). */
function taskOf(body) {
  if (/phonetics (professor|coach)/i.test(body)) return 'pronunciation';
  if (/practice drills|interactive practice/i.test(body)) return 'drills';
  if (/syntax breakdown|shadowing guide/i.test(body)) return 'sentence';
  return 'word';
}

/**
 * Opens the app. Options: url, viewport, touch, fixtures, ttsDelayMs, fail (set of task names that
 * should answer 500), mic (fake microphone). Returns { browser, page, calls, setFail }.
 */
export async function openApp(opts = {}) {
  const { url = 'http://localhost:5173', viewport = { width: 1280, height: 900 }, touch = false, ttsDelayMs = 300, mic = false } = opts;
  const fixtures = { ...defaultFixtures, ...opts.fixtures };
  const fail = new Set(opts.fail || []);
  const args = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
  if (mic) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream');
  const browser = await chromium.launch({ executablePath: findChrome(), args });
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, permissions: mic ? ['microphone'] : [] });
  const page = await context.newPage();
  const calls = { tts: 0, word: 0, sentence: 0, drills: 0, pronunciation: 0 };
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('relire_onboarded', '1');
    if (!localStorage.getItem('relire_app_settings_v1')) localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: { gemini: 'TEST' } }));
  });
  const silence = Buffer.alloc(24000 * 2).toString('base64'); // 1 s of 24 kHz 16-bit PCM
  await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.url().includes('-tts:')) {
      calls.tts++;
      await new Promise((r) => setTimeout(r, ttsDelayMs));
      if (fail.has('tts')) return route.fulfill({ status: 500, body: '{"error":{"message":"tts failed"}}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: silence } }] } }] }) });
    }
    const task = taskOf(req.postData() || '');
    calls[task]++;
    if (fail.has(task)) return route.fulfill({ status: 500, body: `{"error":{"message":"${task} failed"}}` });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fixtures[task]) }] } }] }) });
  });
  await page.goto(url);
  await page.waitForTimeout(1000);
  return { browser, page, calls, setFail: (names) => { fail.clear(); names.forEach((n) => fail.add(n)); } };
}

/** Elements inside `root` (a locator) that stick out of it horizontally. Empty means no overflow. */
export async function overflowing(root) {
  return root.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const out = [];
    el.querySelectorAll('*').forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) out.push(`${n.tagName}.${String(n.className).slice(0, 40)}`);
    });
    return out;
  });
}

/** Document height and the top of `selector`, to assert that an action did not move the page. */
export async function layout(page, selector = 'main') {
  return page.evaluate((sel) => ({ top: Math.round(document.querySelector(sel)?.getBoundingClientRect().top + scrollY), height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth }), selector);
}

/** Tiny assertion log: check(name, condition, detail) then report() at the end (exit code 1 on failure). */
export function checks() {
  const failed = [];
  return {
    check(name, ok, detail = '') { console.log(ok ? 'PASS' : 'FAIL', name, detail); if (!ok) failed.push(name); },
    report() { console.log(failed.length ? `\n${failed.length} FAILED: ${failed.join(' | ')}` : '\nALL PASS'); if (failed.length) process.exitCode = 1; },
  };
}
