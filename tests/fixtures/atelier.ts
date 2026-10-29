/** Hand-written French for the atelier boundary and exercise mapping; no generated answers. */
import type { AtelierItem, Modify } from '../../src/types/atelier';

export const negative: Modify = {
  change: 'negative',
  instruction: { zh: '改为否定句。', en: 'Make the sentence negative.' },
  sentence: 'Nous n’allons pas à la plage.',
  bricks: [
    { text: 'Nous', role: 'subject' },
    { text: 'n’', role: 'negation' },
    { text: 'allons', role: 'verb' },
    { text: 'pas', role: 'negation' },
    { text: 'à', role: 'preposition' },
    { text: 'la', role: 'determiner' },
    { text: 'plage', role: 'noun' },
    { text: '.', role: 'punctuation' },
  ],
};

export const beach: AtelierItem = {
  meaning: { zh: '我们去海滩。', en: 'We are going to the beach.' },
  sentence: 'Nous allons à la plage.',
  variants: ['À la plage nous allons.'],
  bricks: [
    { text: 'Nous', role: 'subject' },
    { text: 'allons', role: 'verb' },
    { text: 'à', role: 'preposition' },
    { text: 'la', role: 'determiner' },
    { text: 'plage', role: 'noun' },
    { text: '.', role: 'punctuation' },
  ],
  distractors: [
    { text: 'au', role: 'contraction', reason: { zh: 'plage 是阴性名词。', en: 'Plage is feminine, so use à la.' } },
  ],
  frame: { verb: 1, sockets: [{ label: 'à + nom', filledBy: [2, 3, 4] }] },
  explanation: { zh: 'aller 后用 à 表示目的地。', en: 'Aller takes à to introduce the destination.' },
  grammarTag: 'prepositions',
  modify: negative,
};

export const coffee: AtelierItem = {
  meaning: { zh: '我喜欢咖啡。', en: 'I like coffee.' },
  sentence: 'J’aime le café.',
  variants: [],
  bricks: [
    { text: 'J’', role: 'subject' },
    { text: 'aime', role: 'verb' },
    { text: 'le', role: 'determiner' },
    { text: 'café', role: 'noun' },
    { text: '.', role: 'punctuation' },
  ],
  distractors: [
    {
      text: 'du',
      role: 'contraction',
      reason: { zh: '表示一般喜好时用定冠词。', en: 'General preferences use the definite article.' },
    },
  ],
  frame: { verb: 1, sockets: [{ label: 'COD', filledBy: [2, 3] }] },
  explanation: { zh: 'Je 在元音前省音为 J’。', en: 'Je elides to J’ before a vowel.' },
  grammarTag: 'articles',
};

export const cinema: AtelierItem = {
  meaning: { zh: '我去电影院。', en: 'I am going to the cinema.' },
  sentence: 'Je vais au cinéma.',
  variants: [],
  bricks: [
    { text: 'Je', role: 'subject' },
    { text: 'vais', role: 'verb' },
    { text: 'au', role: 'contraction' },
    { text: 'cinéma', role: 'noun' },
    { text: '.', role: 'punctuation' },
  ],
  distractors: [
    { text: 'en', role: 'preposition', reason: { zh: '这里 à 和 le 缩合为 au。', en: 'À and le fuse to au here.' } },
  ],
  frame: { verb: 1, sockets: [{ label: 'à + nom', filledBy: [2, 3] }] },
  explanation: { zh: 'à 和 le 缩合为 au。', en: 'À and le fuse to au.' },
  grammarTag: 'prepositions',
};
