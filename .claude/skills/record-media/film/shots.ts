// One entry per recorded clip in public/clips. Every caption states what the clip shows;
// nothing here is drawn by Remotion except the caption text and the frame.
export type Shot = { clip: string; fromSec: number; toSec: number; caption: string };
export type Lang = 'en' | 'zh';

export const FPS = 30;
export const CAPTION_FADE = 12;

export const shots: Record<Lang, Shot[]> = {
  en: [
    {
      clip: 'read.mp4',
      fromSec: 4.5,
      toSec: 7.5,
      caption: 'Today opens on your next steps, taken from your own activity. Readers need no key.',
    },
    {
      clip: 'read.mp4',
      fromSec: 7.5,
      toSec: 13.3,
      caption: 'Tap any word in a graded reader. The meaning was written ahead of time; no key is needed.',
    },
    {
      clip: 'read.mp4',
      fromSec: 13.3,
      toSec: 19.4,
      caption: 'Each reader says what checked it: AI-written and AI-reviewed, not human-reviewed.',
    },
    {
      clip: 'conj.mp4',
      fromSec: 5.5,
      toSec: 15.5,
      caption: 'Reviewed verbs show their forms from the app’s own list. No AI is involved.',
    },
    {
      clip: 'gender.mp4',
      fromSec: 1,
      toSec: 6.5,
      caption: 'Gender lists noun-ending tendencies with examples and the exceptions in the A1 sample.',
    },
  ],
  zh: [
    { clip: 'read-zh.mp4', fromSec: 4.3, toSec: 7.2, caption: '“今天”按你自己的练习记录列出下一步。读物不需要 Key。' },
    { clip: 'read-zh.mp4', fromSec: 7.2, toSec: 13.8, caption: '点读物里的任意一个词。词义是事先写好的，不需要 Key。' },
    {
      clip: 'read-zh.mp4',
      fromSec: 13.8,
      toSec: 20.3,
      caption: '每篇读物都标明审核方式：AI 撰写、AI 审核，未经人工审核。',
    },
    { clip: 'conj-zh.mp4', fromSec: 5, toSec: 15, caption: '已审核的动词直接用应用自带的列表显示变位，不涉及 AI。' },
    { clip: 'gender-zh.mp4', fromSec: 1, toSec: 6.5, caption: '名词性别列出词尾倾向、例词，以及 A1 样本里的例外。' },
  ],
};

export const framesOf = (lang: Lang) => shots[lang].reduce((n, s) => n + Math.round((s.toSec - s.fromSec) * FPS), 0);
