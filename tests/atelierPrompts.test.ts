import { expect, test } from 'bun:test';
import { atelierGradeRequest, atelierRequest, savePromptOverrides } from '../src/services/ai/prompts';
import { renderTemplate, usedVariables } from '../src/services/ai/prompts/engine';
import { PROMPTS } from '../src/services/ai/prompts/registry';
import { openGradeJsonSchema } from '../src/services/exercises/jsonSchema';
import { GRAMMAR_TAGS } from '../src/types/grammar';
import bundledThemes from '../src/data/themes/themes.json';
import { ThemesSchema } from '../src/types/themes';
import { coffee } from './fixtures/atelier';

const theme = ThemesSchema.parse(bundledThemes).find((entry) => entry.id === 'housing')!;
const input = {
  themeFr: theme.fr,
  themeTopics: theme.subtopics.map((subtopic) => subtopic.fr).join(', '),
  level: 'B1' as const,
  count: 7,
  grammarTags: GRAMMAR_TAGS.join(', '),
};

for (const id of ['atelier', 'atelierGrade'] as const) {
  test(`${id}: registered with exactly the variables both templates use`, () => {
    const def = PROMPTS.find((entry) => entry.id === id);
    expect(def).toBeDefined();
    expect([...def!.variables].sort()).toEqual(
      (id === 'atelier'
        ? ['themeFr', 'themeTopics', 'level', 'count', 'grammarTags']
        : ['item', 'userAnswer', 'expectedAnswer']
      ).sort(),
    );
    for (const lang of ['en', 'zh'] as const) {
      const used = usedVariables(def!.defaults[lang]);
      expect(used.sort()).toEqual([...def!.variables].sort());
      expect(used.some((name) => /taskId|subtopic|scope|example/i.test(name))).toBe(false);
    }
    expect(Object.keys(def!.sample).sort()).toEqual([...def!.variables].sort());
  });

  for (const lang of ['en', 'zh'] as const)
    test(`${id}.${lang}: the sample fills every required variable`, () => {
      const def = PROMPTS.find((entry) => entry.id === id)!;
      const out = renderTemplate(def.defaults[lang], def.sample);
      expect(out).not.toContain('{{');
      for (const name of def.variables) {
        const value = def.sample[name];
        expect(value?.trim().length, name).toBeGreaterThan(0);
        expect(out, name).toContain(value!);
      }
    });
}

for (const lang of ['en', 'zh'] as const) {
  test(`atelierRequest.${lang}: fixed context, count, closed tags and round schema`, () => {
    const request = atelierRequest(input, lang);
    for (const value of [input.themeFr, input.themeTopics, input.level]) expect(request.prompt).toContain(value);
    expect(request.prompt).toContain(lang === 'en' ? 'exactly 7 items' : '恰好 7 道题');
    expect(request.prompt).toContain(GRAMMAR_TAGS.join(', '));
    expect(request.prompt).toContain(lang === 'en' ? 'from this closed list' : '只能从这个封闭列表中选择');
    expect(request.jsonSchema).toMatchObject({
      type: 'object',
      required: ['items'],
      properties: { items: { type: 'array', items: { type: 'object' } } },
    });
  });

  test(`atelierRequest.${lang}: the character-for-character join rule`, () => {
    const { prompt } = atelierRequest(input, lang);
    const rules =
      lang === 'en'
        ? [
            'Bricks are joined with one space.',
            'No space after a brick that ends in an apostrophe: J’ + aime gives J’aime.',
            'No space before a punctuation brick: plage + . gives plage.',
            "Apostrophes are the typographic ’, never '.",
            'No no-break space: write Où vas-tu? with no space before ?.',
            'The first brick carries the capital letter; the last brick is the closing punctuation brick.',
            'A fused form (au, aux, du, des) is one brick, never two.',
            'sentence must equal the join of bricks exactly.',
          ]
        : [
            '积木之间用一个空格连接。',
            '以撇号结尾的积木后面不加空格：J’ + aime 得到 J’aime。',
            '标点积木前面不加空格：plage + . 得到 plage。',
            "撇号一律用排版撇号 ’，不用 '。",
            '不用不换行空格：Où vas-tu? 的 ? 前不加空格。',
            '首字母大写在第一块积木上；最后一块积木是收尾的标点积木。',
            '缩合形式（au、aux、du、des）是一块积木，绝不拆成两块。',
            'sentence 必须与 bricks 的拼接结果完全一致。',
          ];
    for (const rule of rules) expect(prompt).toContain(rule);
  });

  test(`atelierRequest.${lang}: varied situations and one differing grammar point per item`, () => {
    const { prompt } = atelierRequest(input, lang);
    for (const rule of lang === 'en'
      ? [
          'Vary the situation across the items: different people, places and purposes',
          'Each item teaches exactly one grammar point',
          'the points differ across the round',
        ]
      : [
          '各题情境要有所变化：人物、地点、目的各不相同',
          '每道题只教下面封闭标签列表中的一个语法点',
          '整轮各题的语法点互不相同',
        ])
      expect(prompt).toContain(rule);
  });

  test(`atelierRequest.${lang}: French grammar reminders`, () => {
    const { prompt } = atelierRequest(input, lang);
    const rules =
      lang === 'en'
        ? [
            'un/une/des/du/de la become de (d’ before a vowel) only on a direct object and after il y a — never after être, never after a preposition: Je ne vais pas à une fête keeps une.',
            'aimer, adorer and détester keep the definite article in the negative.',
            'Cities take à with no article (à Montréal); countries take au, en or aux (au Canada, en France).',
            'à + le = au, à + les = aux, de + le = du, de + les = des; à l’ and de l’ never fuse.',
            'regarder, écouter, attendre and chercher take a direct object with no preposition.',
            'A profession after être takes no article: Il est médecin.',
            'Register follows the situation: tutoiement with a friend, vouvoiement with an examiner or an institution.',
          ]
        : [
            'un/une/des/du/de la 变为 de（元音前为 d’），仅限直接宾语和 il y a 之后——绝不用于 être 之后，也绝不用于介词之后：Je ne vais pas à une fête 保留 une。',
            'aimer、adorer、détester 在否定式中保留定冠词。',
            '城市前用 à 且不加冠词（à Montréal）；国家前用 au、en 或 aux（au Canada、en France）。',
            'à + le = au，à + les = aux，de + le = du，de + les = des；à l’ 与 de l’ 永不缩合。',
            'regarder、écouter、attendre、chercher 直接接宾语，不加介词。',
            'être 之后的职业不加冠词：Il est médecin。',
            '语域随情境而定：对朋友用 tutoiement，对考官或机构用 vouvoiement。',
          ];
    for (const rule of rules) expect(prompt).toContain(rule);
  });

  test(`atelierRequest.${lang}: complete links, eight relations and modify's own links`, () => {
    const { prompt } = atelierRequest(input, lang);
    expect(prompt).not.toMatch(/frame/i);
    for (const relation of [
      'subject',
      'object',
      'complement',
      'article',
      'agreement',
      'negation',
      'modifier',
      'pronoun',
    ])
      expect(prompt).toMatch(new RegExp(`  - ${relation}[:：]`));
    expect(prompt).toContain(lang === 'en' ? 'List every connection' : '必须列出所有连接');
    expect(prompt).toContain(lang === 'en' ? 'an imperative has none' : '祈使句没有主语');
    expect(prompt).toContain(lang === 'en' ? 'its own links over them' : '它自己的 links');
    const sample = JSON.parse(prompt.slice(prompt.indexOf('{\n')));
    expect(sample.items[0].links[0]).toMatchObject({ head: 1, dependents: [0], relation: 'subject', label: 'sujet' });
    expect(sample.items[0].modify.links).toHaveLength(1);
    expect(Object.keys(sample.items[0].links[0].note).sort()).toEqual(['en', 'zh']);
  });

  test(`atelierGradeRequest.${lang}: item, learner answer, reference and open-grade schema`, () => {
    const item = JSON.stringify(coffee);
    const request = atelierGradeRequest(
      { item, userAnswer: 'J’aime du café.', expectedAnswer: 'J’aime le café.' },
      lang,
    );
    for (const value of [item, 'J’aime du café.', 'J’aime le café.']) expect(request.prompt).toContain(value);
    expect(request.prompt).not.toMatch(/frame/i);
    expect(request.prompt).toContain(
      lang === 'en' ? 'the brick and the connection that does not hold' : '哪块积木、哪条连接不成立',
    );
    expect(request.jsonSchema).toEqual(openGradeJsonSchema());
    expect(request.jsonSchema).toMatchObject({
      type: 'object',
      required: ['isCorrect', 'feedback'],
      properties: {
        isCorrect: { type: 'boolean' },
        feedback: { type: 'string' },
        correctedVersion: { type: 'string' },
      },
    });
  });
}

test('user overrides replace both defaults in both languages', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  try {
    savePromptOverrides({
      atelier: { en: 'Custom round {{themeFr}}', zh: 'Custom round {{themeTopics}}' },
      atelierGrade: { en: 'Custom grade {{userAnswer}}', zh: 'Custom grade {{expectedAnswer}}' },
    });
    expect(atelierRequest(input, 'en').prompt).toBe(`Custom round ${theme.fr}`);
    expect(atelierRequest(input, 'zh').prompt).toBe(`Custom round ${input.themeTopics}`);
    const gradeInput = { item: '{}', userAnswer: 'Mon essai.', expectedAnswer: 'Ma référence.' };
    expect(atelierGradeRequest(gradeInput, 'en').prompt).toBe('Custom grade Mon essai.');
    expect(atelierGradeRequest(gradeInput, 'zh').prompt).toBe('Custom grade Ma référence.');
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
