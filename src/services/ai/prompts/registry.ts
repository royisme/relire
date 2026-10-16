import type { Lang } from '../types';
import wordEn from './defaults/word.en.txt?raw';
import wordZh from './defaults/word.zh.txt?raw';
import sentenceEn from './defaults/sentence.en.txt?raw';
import sentenceZh from './defaults/sentence.zh.txt?raw';
import audioEn from './defaults/pronunciation-audio.en.txt?raw';
import audioZh from './defaults/pronunciation-audio.zh.txt?raw';
import textEn from './defaults/pronunciation-text.en.txt?raw';
import textZh from './defaults/pronunciation-text.zh.txt?raw';
import type { PromptVars } from './engine';
import prosodyEn from './defaults/prosody.en.txt?raw';
import prosodyZh from './defaults/prosody.zh.txt?raw';
import extractEn from './defaults/extract.en.txt?raw';
import extractZh from './defaults/extract.zh.txt?raw';
import hintEn from './defaults/hint.en.txt?raw';
import hintZh from './defaults/hint.zh.txt?raw';
import explainEn from './defaults/explain.en.txt?raw';
import explainZh from './defaults/explain.zh.txt?raw';
import gradeEn from './defaults/grade.en.txt?raw';
import gradeZh from './defaults/grade.zh.txt?raw';
import adaptiveEn from './defaults/adaptive.en.txt?raw';
import adaptiveZh from './defaults/adaptive.zh.txt?raw';
import exercisesEn from './defaults/exercises.en.txt?raw';
import exercisesZh from './defaults/exercises.zh.txt?raw';

/** The prompts the app sends. Defaults ship as text files in ./defaults and can be overridden by the user. */
export type PromptId =
  | 'word'
  | 'sentence'
  | 'pronunciationAudio'
  | 'pronunciationText'
  | 'prosody'
  | 'extract'
  | 'hint'
  | 'explain'
  | 'grade'
  | 'adaptive'
  | 'exercises';

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
    id: 'prosody',
    variables: ['sentence', 'tokens'],
    defaults: { en: prosodyEn, zh: prosodyZh },
    sample: {
      sentence: '"Bonjour."',
      tokens: '[{"ordinal":0,"source":"Bonjour","graphemes":["B","o","n","j","o","u","r"]}]',
    },
  },
  {
    id: 'word',
    variables: ['word', 'sentence', 'articleContext'],
    defaults: { en: wordEn, zh: wordZh },
    sample: {
      word: 'apprivoiser',
      sentence: 'Mais, si tu m’apprivoises, nous aurons besoin l’un de l’autre.',
      articleContext: 'Le renard explique au petit prince ce que signifie apprivoiser.',
    },
  },
  {
    id: 'sentence',
    variables: ['sentence', 'articleContext'],
    defaults: { en: sentenceEn, zh: sentenceZh },
    sample: {
      sentence: 'On ne voit bien qu’avec le cœur.',
      articleContext: 'Le renard confie son secret au petit prince.',
    },
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
    sample: {
      referenceText: 'Bonjour tout le monde.',
      userTranscript: 'bonjour tout le monde',
      transcript: 'bonjour tout le monde',
    },
  },
  {
    id: 'extract',
    variables: ['source', 'mode', 'rawText', 'customTitle'],
    defaults: { en: extractEn, zh: extractZh },
    sample: {
      source: 'text',
      mode: 'complete',
      rawText: 'Exercice 1. Complétez avec être.\n1. Je [___] étudiante.\n2. Tu [___] polonais.',
      customTitle: 'Unité 1',
    },
  },
  {
    id: 'hint',
    variables: ['exerciseType', 'prompt', 'userAnswer', 'grammarTag', 'context'],
    defaults: { en: hintEn, zh: hintZh },
    sample: {
      exerciseType: 'FILL_BLANKS',
      prompt: 'Hier, elle [___] au marché.',
      userAnswer: 'va',
      grammarTag: 'passe-compose',
      context: 'Léa raconte sa journée de samedi.',
    },
  },
  {
    id: 'explain',
    variables: ['prompt', 'userAnswer', 'expectedAnswer', 'grammarTag', 'context'],
    defaults: { en: explainEn, zh: explainZh },
    sample: {
      prompt: 'Hier, elle [___] au marché.',
      userAnswer: 'a allé',
      expectedAnswer: 'est allée',
      grammarTag: 'passe-compose',
      context: 'Léa raconte sa journée de samedi.',
    },
  },
  {
    id: 'grade',
    variables: ['prompt', 'expectedAnswer', 'userAnswer', 'context'],
    defaults: { en: gradeEn, zh: gradeZh },
    sample: {
      prompt: "Comment demande-t-on l'âge ?",
      expectedAnswer: 'Vous avez quel âge ?',
      userAnswer: 'Quel âge as-tu ?',
      context: 'Dialogue : deux collègues se rencontrent.',
    },
  },
  {
    id: 'adaptive',
    variables: ['targetCategories', 'recentMistakes', 'count', 'level'],
    defaults: { en: adaptiveEn, zh: adaptiveZh },
    sample: {
      targetCategories: 'passe-compose, past-participle-agreement',
      recentMistakes: '[{"prompt":"Hier, elle [___] au marché.","userAnswer":"a allé","expectedAnswer":"est allée"}]',
      count: '6',
      level: 'B1',
    },
  },
  {
    id: 'exercises',
    variables: ['level', 'articleText', 'count'],
    defaults: { en: exercisesEn, zh: exercisesZh },
    sample: {
      level: 'B1',
      articleText:
        'Le matin, Léa prend le train pour Lyon. Elle a rendez-vous avec une amie qu’elle n’a pas vue depuis deux ans.',
      count: '6',
    },
  },
];

export const getPromptDefinition = (id: PromptId) => PROMPTS.find((p) => p.id === id)!;
