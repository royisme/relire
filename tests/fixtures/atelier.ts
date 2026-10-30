/** Hand-written French for the atelier boundary and exercise mapping; no generated answers. */
import type { AtelierItem, Modify } from '../../src/types/atelier';
import devItems from '../../src/data/atelier/devItems.json';
import { parseRound } from '../../src/services/atelier/parse';
import type { RoundChoice } from '../../src/services/atelier/source';

export const devRound = parseRound({ items: devItems });
export const atelierChoice: RoundChoice = { themeId: 'leisure', level: 'A2' };

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
  links: [
    {
      head: 2,
      dependents: [0],
      relation: 'subject',
      label: 'sujet',
      note: { en: 'Nous is the subject of allons.', zh: 'Nous 是 allons 的主语。' },
    },
    {
      head: 2,
      dependents: [1, 3],
      relation: 'negation',
      label: 'ne … pas',
      note: { en: 'Ne and pas surround the verb.', zh: 'ne 和 pas 放在动词两侧。' },
    },
    {
      head: 2,
      dependents: [4, 5, 6],
      relation: 'complement',
      label: 'à + nom',
      note: { en: 'Aller takes à for a destination.', zh: 'aller 用 à 引出目的地。' },
    },
    {
      head: 6,
      dependents: [5],
      relation: 'article',
      label: 'article défini',
      note: { en: 'La agrees with feminine plage.', zh: 'la 与阴性名词 plage 配合。' },
    },
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
  links: [
    {
      head: 1,
      dependents: [0],
      relation: 'subject',
      label: 'sujet',
      note: { en: 'Nous is the subject of allons.', zh: 'Nous 是 allons 的主语。' },
    },
    {
      head: 1,
      dependents: [2, 3, 4],
      relation: 'complement',
      label: 'à + nom',
      note: { en: 'Aller takes à for a destination.', zh: 'aller 用 à 引出目的地。' },
    },
    {
      head: 4,
      dependents: [3],
      relation: 'article',
      label: 'article défini',
      note: { en: 'La agrees with feminine plage.', zh: 'la 与阴性名词 plage 配合。' },
    },
  ],
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
  links: [
    {
      head: 1,
      dependents: [0],
      relation: 'subject',
      label: 'sujet',
      note: { en: 'J’ is the subject of aime.', zh: 'J’ 是 aime 的主语。' },
    },
    {
      head: 1,
      dependents: [2, 3],
      relation: 'object',
      label: 'COD',
      note: { en: 'Aimer takes a direct object.', zh: 'aimer 接直接宾语。' },
    },
    {
      head: 3,
      dependents: [2],
      relation: 'article',
      label: 'article défini',
      note: { en: 'General preferences use le.', zh: '一般喜好用定冠词 le。' },
    },
  ],
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
  links: [
    {
      head: 1,
      dependents: [0],
      relation: 'subject',
      label: 'sujet',
      note: { en: 'Je is the subject of vais.', zh: 'Je 是 vais 的主语。' },
    },
    {
      head: 1,
      dependents: [2, 3],
      relation: 'complement',
      label: 'à + nom',
      note: { en: 'Aller takes à for a destination.', zh: 'aller 用 à 引出目的地。' },
    },
    {
      head: 3,
      dependents: [2],
      relation: 'article',
      label: 'à + le',
      note: { en: 'À and le fuse to au.', zh: 'à 与 le 缩合为 au。' },
    },
  ],
  explanation: { zh: 'à 和 le 缩合为 au。', en: 'À and le fuse to au.' },
  grammarTag: 'prepositions',
};
