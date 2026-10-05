import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import i18n from '../i18n';
import { PracticeDeck, PronunciationAssessment, SentenceAnalysis, WordAnalysis } from '../types';

/**
 * Direct browser-to-Gemini client. The user's own API key (stored in this
 * browser only) is sent to Google and nowhere else; there is no app server.
 */

export class MissingApiKeyError extends Error {
  constructor() {
    super('Gemini API key is not set');
    this.name = 'MissingApiKeyError';
  }
}

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  lang: 'zh' | 'en';
}

const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro'];

function client(apiKey: string) {
  const key = apiKey?.trim();
  if (!key) throw new MissingApiKeyError();
  return new GoogleGenAI({ apiKey: key });
}

function readableError(err: any): string {
  let msg: string = err?.message || String(err);
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) msg = parsed.error.message;
  } catch {
    // message was not JSON
  }
  return msg;
}

function parseJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  try {
    return JSON.parse(cleaned.trim()) as T;
  } catch {
    throw new Error(i18n.t('errors.badResponse'));
  }
}

async function generateJson<T>(contents: any, opts: GeminiOptions): Promise<T> {
  const ai = client(opts.apiKey);
  const preferred = opts.model?.trim();
  const candidates = preferred
    ? [preferred, ...DEFAULT_MODELS.filter((m) => m !== preferred)]
    : DEFAULT_MODELS;

  let lastError: unknown = null;
  for (const model of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const config: any = { responseMimeType: 'application/json' };
        if (model.includes('gemini-3')) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
        const response = await ai.models.generateContent({ model, contents, config });
        if (response?.text) return parseJson<T>(response.text);
      } catch (err) {
        lastError = err;
        // A bad key will fail on every model; stop early instead of cycling.
        if (/API key|permission|PERMISSION_DENIED|UNAUTHENTICATED/i.test(readableError(err))) {
          throw new Error(readableError(err));
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  throw new Error(lastError ? readableError(lastError) : i18n.t('errors.allModelsFailed'));
}

/** Makes one tiny request so a pasted key can be checked before it is saved. */
export async function checkApiKey(apiKey: string, model = 'gemini-2.5-flash'): Promise<void> {
  const ai = client(apiKey);
  try {
    await ai.models.generateContent({ model, contents: 'Reply with OK.' });
  } catch (err) {
    throw new Error(readableError(err));
  }
}

export async function analyzeWord(
  p: { word: string; sentenceContext?: string; articleContext?: string },
  opts: GeminiOptions
): Promise<WordAnalysis> {
  const { word, sentenceContext, articleContext } = p;
  const isEn = opts.lang !== 'zh';
  const prompt = isEn
    ? `You are an expert French pedagogue specializing in CEFR A1-B2 learners.
Provide an intuitive, clear, practical analysis in English of the French word "${word}".
Sentence context: "${sentenceContext || word}"
${articleContext ? `Article summary: "${articleContext.slice(0, 250)}..."` : ''}

[Guidelines]:
1. Geared towards beginner-to-intermediate learners. Avoid archaic etymology or obscure grammatical jargon.
2. Provide high-utility, modern meanings and collocations.
3. Pronunciation tip: intuitive vocal cues (uvular [ʁ], rounded front vowels [y]/[ø], nasal vowels without trailing 'n', key elisions).
4. Conjugations: core everyday tenses only (Présent, Passé Composé, Imparfait).
5. 2 modern authentic example sentences with both English ("en") and Chinese ("zh") translations.

Output strictly in JSON:
{
"word": "${word}",
"lemma": "base form (infinitive or masculine singular)",
"partOfSpeech": "part of speech in English",
"ipa": "IPA transcription",
"phoneticsGuide": "intuitive pronunciation tip and pitfall warning in English",
"translation": "natural English translation for this context",
"translationEn": "natural English translation",
"otherMeanings": ["high-frequency meaning 1", "high-frequency meaning 2"],
"contextTense": "clear explanation of its grammatical form & tense in this sentence in English",
"conjugationTable": [
  {
    "tense": "Tense name (e.g. Présent / Passé composé)",
    "forms": [
      {"person": "je", "form": "form"},
      {"person": "tu", "form": "form"},
      {"person": "il/elle", "form": "form"},
      {"person": "nous", "form": "form"},
      {"person": "vous", "form": "form"},
      {"person": "ils/elles", "form": "form"}
    ]
  }
],
"usageExamples": [
  {
    "fr": "practical French example",
    "zh": "Chinese translation",
    "en": "English translation",
    "highlight": "key conjugated word"
  }
],
"cefrLevel": "A1/A2/B1/B2",
"memoryTrick": "practical mnemonic or useful collocation in English"
}`
    : `你是一位专注于【初学者到中级（CEFR A1 - B2）】的实用法语名师。
请以通俗易懂、实用生动的方式解析法语单词 "${word}"。
句子上下文： "${sentenceContext || word}"
${articleContext ? `文章大意： "${articleContext.slice(0, 250)}..."` : ''}

【教学导向与B2及以下精简原则】：
1. 核心面向初学者至B2学生，严禁使用生僻的古法语词源考证、复杂的印欧形态学术语或罕见的古代时态。
2. 释义紧扣当前语境，给出最实用、日常交流中最常用的含义与高频固定短语。
3. 发音要领请提供通俗易学的口诀技巧（例如小舌音[ʁ]轻轻含水摩擦、鼻化元音口鼻齐放且唇形固定不发n收尾音、核心连音与省音）。
4. 动词变位表严格限定在 A1-B2 日常必用核心时态（Présent 直陈式现在时、Passé Composé 复合过去时、Imparfait 未完成过去时；若为名词/形容词，说明阴阳性与复数规则）。
5. 给出 2 个生活化、现代地道的高频实用例句。

请务必按以下JSON格式输出：
{
"word": "${word}",
"lemma": "单词原型（动词不定式/名词阳性单数）",
"partOfSpeech": "通俗词性（如：动词 1er groupe / 阳性名词 / 形容词）",
"ipa": "国际音标（如 /s(ə) su.və.niʁ/）",
"phoneticsGuide": "适合初学至B2的实用发音口诀与易错避坑提示",
"translation": "当前语境中最贴切好懂的中文释义",
"otherMeanings": ["高频日常义项1", "高频日常义项2"],
"contextTense": "该词在当前句中的语法形态通俗解析（如：直陈式现在时第3人称单数，表示客观状态）",
"conjugationTable": [
  {
    "tense": "时态名称（如：Présent 现在时 / Passé composé 复合过去时）",
    "forms": [
      {"person": "je", "form": "形态"},
      {"person": "tu", "form": "形态"},
      {"person": "il/elle", "form": "形态"},
      {"person": "nous", "form": "形态"},
      {"person": "vous", "form": "形态"},
      {"person": "ils/elles", "form": "形态"}
    ]
  }
],
"usageExamples": [
  {
    "fr": "贴近现代生活的实用法语例句",
    "zh": "中文对译",
    "highlight": "重点变化的词汇"
  }
],
"cefrLevel": "A1/A2/B1/B2",
"memoryTrick": "实用联想助记或高频搭配口诀"
}`;
  return generateJson<WordAnalysis>(prompt, opts);
}

export async function analyzeSentence(
  p: { sentence: string; articleContext?: string },
  opts: GeminiOptions
): Promise<SentenceAnalysis> {
  const { sentence, articleContext } = p;
  const isEn = opts.lang !== 'zh';
  const prompt = isEn
    ? `You are an expert French language pedagogue specializing in CEFR A1-B2 level instruction.
Provide a clear, intuitive, and highly communicative syntax breakdown and shadowing guide in English for this French sentence:
"${sentence}"
${articleContext ? `Article summary: "${articleContext.slice(0, 250)}..."` : ''}

[Pedagogical Guidelines for A1-B2]:
1. Target beginner-to-intermediate learners. Avoid obscure Latinate grammatical jargon; explain logic clearly in English.
2. Structure analysis (syntaxStructure) into an intuitive 3-part framework: [Subject + Main Verb + Object/Prepositional/Complement clause].
3. Core grammar (grammarPoints) focuses on high-frequency A1-B2 rules (passé composé agreement, relative pronouns qui/que/dont, preposition usage), with easy mnemonic formulas.
4. Extract 1-2 practical sentence patterns (patternCollocations) with everyday model examples with both English ("en") and Chinese ("zh") translations.
5. Shadowing guide provides clean breath group pauses (/ separated), liaisons, intonation cues, and speed advice.

Output strictly in JSON:
{
"sentence": "${sentence}",
"translation": "Natural, fluent English translation",
"syntaxStructure": [
  {
    "segment": "Segment of the sentence",
    "role": "Syntactic role in English (e.g. 'Subject', 'Main verb (Present)', 'Direct object clause')",
    "explanation": "Brief, plain-English explanation of its function in the sentence"
  }
],
"grammarPoints": [
  {
    "title": "Grammar rule title in English (e.g. 'Passé composé auxiliary & agreement')",
    "explanation": "Intuitive explanation in English",
    "ruleFormula": "Quick formula or mnemonic"
  }
],
"patternCollocations": [
  {
    "pattern": "Extracted high-frequency sentence pattern",
    "meaning": "English explanation of function",
    "examples": [
      {
        "fr": "Everyday French example",
        "zh": "Chinese translation",
        "en": "English translation"
      }
    ]
  }
],
"shadowingGuide": {
  "rhythmGroups": ["Thought groups separated by /"],
  "liaisons": ["Mandatory or forbidden liaison rules (e.g. 'les_amis: [lez‿ami] mandatory liaison')"],
  "intonation": "Intonation contour advice in English",
  "speedTip": "Shadowing speed guidance for learners in English"
}
}`
    : `你是一位专注于【初学者到B2级别】的法语教学专家。
请对以下法语句子进行清晰直观、去学术化、注重沟通实用的句法拆解与跟读指导：
"${sentence}"
${articleContext ? `文章大意： "${articleContext.slice(0, 250)}..."` : ''}

【教学导向与B2及以下精简原则】：
1. 目标受众是初学至中级（A1-B2）学习者，杜绝复杂晦涩的拉丁语系深奥术语，用通俗亲切的汉语讲透逻辑。
2. 句法拆解（syntaxStructure）划分为清晰直观的三段式骨架：【主干：谁(Sujet) + 做了什么(Verbe) + 宾语/状语/补充从句(Complément)】。
3. 语法核心（grammarPoints）聚焦 A1-B2 高频考点（如复合过去时助动词与性数配合、疑问词与关系代词 qui/que/dont、常用介词 à/de/en 搭配），给出实用白话口诀。
4. 提取 1-2 个生活实用高频句型或固定短语（patternCollocations），配简单日常的仿造例句。
5. 影子跟读指南（shadowingGuide）提供清晰的意群停顿（/ 分隔）、关键连音（Liaison）和句调提示。

请严格按以下JSON格式输出：
{
"sentence": "${sentence}",
"translation": "自然流畅、通俗易懂的中文翻译",
"syntaxStructure": [
  {
    "segment": "句子拆解的片段",
    "role": "通俗语法成分（如 '主语', '谓语动词 (现在时)', '宾语与介词短语'）",
    "explanation": "简明通俗的说明（一句话说清该部分在句中的作用）"
  }
],
"grammarPoints": [
  {
    "title": "通俗语法点名称（如：'复合过去时与 être 的性数配合'）",
    "explanation": "初学者至B2一听就懂的语法逻辑讲解",
    "ruleFormula": "简明记忆口诀或公式"
  }
],
"patternCollocations": [
  {
    "pattern": "提取出的高频实用句型或固定搭配",
    "meaning": "中文功能说明",
    "examples": [
      {
        "fr": "日常实用法语仿造例句",
        "zh": "中文对译"
      }
    ]
  }
],
"shadowingGuide": {
  "rhythmGroups": ["按呼吸意群划分的片段，以 / 隔开"],
  "liaisons": ["必须联诵或严禁联诵的通俗提示（如：'les_amis: [lez‿ami] 必须联诵'）"],
  "intonation": "语调升降规律（如：'逗号前略微升调，句末句号自然降调'）",
  "speedTip": "初学者至B2跟读配速建议（如：'建议先以 0.75x 练准小舌音，再以 1.0x 模仿自然语流'）"
}
}`;
  return generateJson<SentenceAnalysis>(prompt, opts);
}

export async function assessPronunciation(
  p: { referenceText: string; audioBase64?: string; mimeType?: string; userTranscript?: string },
  opts: GeminiOptions
): Promise<PronunciationAssessment> {
  const { referenceText, audioBase64, mimeType, userTranscript } = p;
  const isEn = opts.lang !== 'zh';
  const parts: any[] = [];

  if (audioBase64) {
    // Audio provided
    parts.push({
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    });
    parts.push({
      text: isEn
        ? `You are an elite French phonetics professor and pronunciation coach.
Please listen closely to the user's recorded French audio and evaluate their pronunciation against the reference text:
Target reference text: "${referenceText}"
${userTranscript ? `Client speech recognition transcript: "${userTranscript}"` : ''}

Analyze thoroughly:
1. Vowel accuracy (especially French rounded front vowels [y], [ø], [œ], schwa [ə], and the nasal vowels [ɑ̃], [ɔ̃], [ɛ̃], [œ̃]).
2. Consonants & uvular [ʁ] (vibration, unaspirated French p/t/k).
3. Rhythm, liaison, elision, and intonation.

Output strictly in JSON:
{
"overallScore": 88,
"accuracyScore": 85,
"fluencyScore": 90,
"rhythmScore": 88,
"transcribedSpeech": "User's recognized French speech",
"phonemeFeedback": [
  {
    "phoneme": "[y]",
    "targetWord": "tu / vu",
    "status": "needs_work",
    "tip": "Tip in English"
  }
],
"liaisonFeedback": "Feedback on liaisons and elisions in English",
"intonationFeedback": "Feedback on intonation contour in English",
"corrections": [
  {
    "word": "word",
    "expectedIPA": "correct IPA",
    "actualNote": "observed deviation",
    "advice": "actionable tip in English"
  }
],
"strengths": ["Strengths highlight 1 in English", "Strengths highlight 2 in English"],
"coachingNotes": "Warm, constructive coach feedback in English followed by a French encouragement."
}`
        : `你是一位殿堂级法语语音学教授与语音矫正教练（Pronunciation Coach）。
请仔细聆听用户录制的法语发音音频，并对照参考文本评估其发音准确度：
目标参考文本： "${referenceText}"
${userTranscript ? `客户端语音识别参考转写： "${userTranscript}"` : ''}

请深度分析其：
1. 元音准确度（特别检查法国特有的圆唇前元音 [y], [ø], [œ]，央元音 [ə]，以及四个鼻化元音 [ɑ̃], [ɔ̃], [ɛ̃], [œ̃] 是否发准，有无发成带齿龈的鼻音 n/m）。
2. 辅音与小舌颤音（检查小舌摩擦音 [ʁ] 的震动或摩擦位置，p/t/k 是否像英语一样送气过度，是否做到了法语的“不送气清辅音”）。
3. 节奏与语流连贯（Enchaînement vocalique/consonantique 连音与 Liaison 联诵，词尾不发音辅音是否偷发）。
4. 语调升降（Intonation）。

请必须以严格的JSON格式输出：
{
"overallScore": 88,
"accuracyScore": 85,
"fluencyScore": 90,
"rhythmScore": 88,
"transcribedSpeech": "用户实际被听辨出的法语",
"phonemeFeedback": [
  {
    "phoneme": "[y]",
    "targetWord": "tu / vu",
    "status": "needs_work",
    "tip": "嘴唇要比发[u]更紧地撮成小圆孔，舌尖抵住下齿背，声带振动，切忌发成汉语拼音的u或iou"
  }
],
"liaisonFeedback": "联诵与省音表现点评",
"intonationFeedback": "语调升降曲线点评",
"corrections": [
  {
    "word": "出现瑕疵的单词",
    "expectedIPA": "正确音标",
    "actualNote": "用户实际发出的偏差特点",
    "advice": "具体矫正发音动作技巧"
  }
],
"strengths": ["发得非常棒的亮点1", "发得非常棒的亮点2"],
"coachingNotes": "温暖、专业且富有启发性的法语教练评语（中文+一句法语寄语）"
}`,
    });
  } else {
    // Text-based evaluation fallback
    parts.push({
      text: isEn
        ? `You are an expert French phonetics professor.
The user practiced reading the French sentence: "${referenceText}".
User speech transcript: "${userTranscript || referenceText}".
Provide pronunciation guidance and target phoneme tips in English.

Output strictly in JSON:
{
"overallScore": 86,
"accuracyScore": 84,
"fluencyScore": 88,
"rhythmScore": 86,
"transcribedSpeech": "${userTranscript || referenceText}",
"phonemeFeedback": [
  {
    "phoneme": "[ʁ]",
    "targetWord": "key word",
    "status": "acceptable",
    "tip": "tip in English"
  }
],
"liaisonFeedback": "Liaison guidance in English",
"intonationFeedback": "Intonation contour advice in English",
"corrections": [
  {
    "word": "word",
    "expectedIPA": "IPA",
    "actualNote": "note in English",
    "advice": "tip in English"
  }
],
"strengths": ["Smooth rhythm", "Clear vowel length"],
"coachingNotes": "Encouraging pronunciation coach notes in English"
}`
        : `你是一位专业法语语音学教授。
用户练习朗读了法语句子： "${referenceText}"。
用户的语音转录结果是： "${userTranscript || referenceText}"。

请基于法语母语者对中国学习者的常见发音偏误（如 [y]发成[u]、小舌音[ʁ]发成大舌音或喝水音、鼻化元音带有n尾音、p/t/k过度送气、词尾不发音字母误读、连诵错误），
为这句话提供针对性的发音难度评估和发音辅导要领。

请以严格的JSON格式返回：
{
"overallScore": 86,
"accuracyScore": 84,
"fluencyScore": 88,
"rhythmScore": 86,
"transcribedSpeech": "${userTranscript || referenceText}",
"phonemeFeedback": [
  {
    "phoneme": "[ʁ]",
    "targetWord": "重点词",
    "status": "acceptable",
    "tip": "小舌音技巧说明"
  }
],
"liaisonFeedback": "该句关键联诵与省音规则",
"intonationFeedback": "句型语调建议",
"corrections": [
  {
    "word": "关键易错词",
    "expectedIPA": "音标",
    "actualNote": "易混音提示",
    "advice": "唇形与舌位动作"
  }
],
"strengths": ["语音节奏自然", "元音饱满"],
"coachingNotes": "教练的贴心纠音点评"
}`,
    });
  }
  return generateJson<PronunciationAssessment>({ parts }, opts);
}

export async function generateDrills(
  p: { articleText: string; type: string },
  opts: GeminiOptions
): Promise<PracticeDeck> {
  const { articleText, type } = p;
  const isEn = opts.lang !== 'zh';
  const prompt = isEn
    ? `You are an expert French instructor specializing in CEFR A1-B2 level pedagogy.
Based on the following French text:
"""
${articleText.slice(0, 1500)}
"""

Generate a focused set of interactive practice drills for ${type === 'syntax' ? 'sentence reconstruction and syntax ordering' : type === 'cloze' ? 'high-frequency grammar and tense cloze' : type === 'oral' ? 'spoken expression & shadowing challenge' : 'comprehensive practice'}.
Target level: CEFR A1 - B2. Prompts, descriptions, and grammar hints must be in English.

Output strictly in JSON:
{
"title": "Drill Title in English",
"description": "Drill description in English",
"questions": [
  {
    "id": 1,
    "type": "scramble | cloze | translation | oral_prompt",
    "targetSentence": "Full standard French sentence",
    "prompt": "Clear task instruction in English",
    "scrambledChunks": ["Syntactic", "chunks", "for scramble"],
    "clozeText": "French sentence with ____ fill-in-the-blank",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctOptionIndex": 0,
    "grammarHint": "Intuitive grammar explanation in English",
    "shadowingAudioPrompt": "Standard French text for shadowing"
  }
]
}`
    : `你是一位面向初学至B2水平的法语教学专家。请基于以下法语篇章：
"""
${articleText.slice(0, 1500)}
"""

请生成一组针对${type === 'syntax' ? '核心句法重组与结构梳理' : type === 'cloze' ? '初中级高频语法与时态填空' : type === 'oral' ? '口语日常表达与影子跟读挑战' : '综合训练'}的练习题。
难度控制在 CEFR A1 - B2 范围内，题目必须地道实用，解析通俗好懂。
格式必须为严格的JSON：
{
"title": "练习主题",
"description": "练习说明与目标",
"questions": [
  {
    "id": 1,
    "type": "scramble | cloze | translation | oral_prompt",
    "targetSentence": "完整的原句或标准答案",
    "prompt": "题目说明或中文句子",
    "scrambledChunks": ["打乱的", "语法意群", "用于重组"],
    "clozeText": "带有 ____ 填空的法语句子",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "correctOptionIndex": 0,
    "grammarHint": "通俗好懂的语法解析或提示",
    "shadowingAudioPrompt": "供跟读的标准文本"
  }
]
}`;
  return generateJson<PracticeDeck>(prompt, opts);
}

/** Gemini TTS returns raw 16-bit PCM; wrap it in a WAV header so <audio> can play it. */
function pcmToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  let bin = '';
  for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function synthesizeSpeech(
  p: { text: string; voice: string; model: string; style?: string },
  apiKey: string
): Promise<string> {
  const ai = client(apiKey);
  let response;
  try {
    response = await ai.models.generateContent({
      model: p.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: p.text,
              speechMetadata: {
                style: p.style || 'Natural, authentic native French speaker with clear French accent, standard liaisons, and warm tone',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: p.voice } } },
      },
    } as any);
  } catch (err) {
    throw new Error(readableError(err));
  }
  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) throw new Error(i18n.t('errors.noAudio'));
  if (inline.mimeType?.includes('wav')) return inline.data;
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType || '')?.[1]) || 24000;
  return pcmToWavBase64(inline.data, rate);
}
