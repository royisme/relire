import type { Lang } from '../types';
import wordEn from './defaults/word.en.txt?raw';
import wordZh from './defaults/word.zh.txt?raw';
import sentenceEn from './defaults/sentence.en.txt?raw';
import sentenceZh from './defaults/sentence.zh.txt?raw';
import drillsEn from './defaults/drills.en.txt?raw';
import drillsZh from './defaults/drills.zh.txt?raw';
import audioEn from './defaults/pronunciation-audio.en.txt?raw';
import audioZh from './defaults/pronunciation-audio.zh.txt?raw';
import textEn from './defaults/pronunciation-text.en.txt?raw';
import textZh from './defaults/pronunciation-text.zh.txt?raw';
import type { PromptVars } from './engine';

/** The prompts the app sends. Defaults ship as text files in ./defaults and can be overridden by the user. */
export type PromptId = 'word' | 'sentence' | 'drills' | 'pronunciationAudio' | 'pronunciationText';

export interface PromptDefinition {
  id: PromptId;
  /** Variables the app fills in, documented for the editor. */
  variables: string[];
  defaults: Record<Lang, string>;
  /** Realistic values for the editor's preview. */
  sample: PromptVars;
}

export const PROMPTS: PromptDefinition[] = [
  {
    id: 'word',
    variables: ['word', 'sentence', 'articleContext'],
    defaults: { en: wordEn, zh: wordZh },
    sample: { word: 'apprivoiser', sentence: 'Mais, si tu m’apprivoises, nous aurons besoin l’un de l’autre.', articleContext: 'Le renard explique au petit prince ce que signifie apprivoiser.' },
  },
  {
    id: 'sentence',
    variables: ['sentence', 'articleContext'],
    defaults: { en: sentenceEn, zh: sentenceZh },
    sample: { sentence: 'On ne voit bien qu’avec le cœur.', articleContext: 'Le renard confie son secret au petit prince.' },
  },
  {
    id: 'drills',
    variables: ['articleText', 'type'],
    defaults: { en: drillsEn, zh: drillsZh },
    sample: { articleText: 'Le petit prince commença à comprendre…', type: 'syntax' },
  },
  {
    id: 'pronunciationAudio',
    variables: ['referenceText', 'userTranscript'],
    defaults: { en: audioEn, zh: audioZh },
    sample: { referenceText: 'Bonjour tout le monde.', userTranscript: 'bonjour tout le monde' },
  },
  {
    id: 'pronunciationText',
    variables: ['referenceText', 'userTranscript', 'transcript'],
    defaults: { en: textEn, zh: textZh },
    sample: { referenceText: 'Bonjour tout le monde.', userTranscript: 'bonjour tout le monde', transcript: 'bonjour tout le monde' },
  },
];

export const getPromptDefinition = (id: PromptId) => PROMPTS.find((p) => p.id === id)!;
