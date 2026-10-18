import { describe, expect, spyOn, test } from 'bun:test';
import { ImageInputUnsupportedError, InvalidAnswerError, isAbortError } from '../src/services/ai/errors';
import {
  MAX_EXTRACT_IMAGES,
  explainMistake,
  extractMaterial,
  generateAdaptiveDrills,
  generateExercises,
  gradeOpenAnswer,
  hint,
  transcribeMaterial,
} from '../src/services/ai/tasks';
import { geminiText } from '../src/services/ai/providers/gemini/client';
import { gemini } from '../src/services/ai/providers/gemini';
import { draftFixture } from './fixtures/importDraft';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { ITEMS, unitOf } from './fixtures/units';

/** Every key at any depth. */
function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const entry of value) keysOf(entry, found);
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) {
      found.add(key);
      keysOf(entry, found);
    }
  return found;
}

const expectSchemaSent = (request: { jsonSchema?: Record<string, unknown> }) => {
  expect(request.jsonSchema).toBeDefined();
  expect(request.jsonSchema!.type).toBe('object');
  expect(keysOf(request.jsonSchema).has('const')).toBe(false);
  expect(JSON.stringify(request.jsonSchema)).not.toContain('"const"');
};

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the task to throw');
};

const item = { id: 'h1', prompt: 'Je [___] française.', userAnswer: 'es', grammarTag: 'present' };

describe('hint', () => {
  const good = { hint: 'Look at the **subject**.', grammarRule: 'je + suis', clueWord: 's' };

  test('returns the validated hint and sends the hint schema', async () => {
    const provider = fakeProvider(good);
    const result = await hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(provider));
    expect(result).toEqual(good);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain('Je [___] française.');
    expect(provider.requests[0].images).toBeUndefined();
  });

  test('clueWord is optional', async () => {
    const { clueWord: _clue, ...without } = good;
    const result = await hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(fakeProvider(without)));
    expect(result.clueWord).toBeUndefined();
  });

  test('a malformed answer throws with the real reason and no fallback', async () => {
    const provider = fakeProvider({ hint: 'Look.', clueWord: 's' });
    const err = await rejection(hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(provider)));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('grammarRule');
    expect((err as InvalidAnswerError).issues.length).toBeGreaterThan(0);
  });

  test('a provider failure is passed through unchanged', async () => {
    const failure = new Error('quota exceeded');
    const err = await rejection(hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(fakeProvider(failure))));
    expect(err).toBe(failure);
  });
});

describe('explainMistake', () => {
  const good = { summary: 'Être in the present.', details: 'Je **suis**.', tip: 'je suis, tu es' };
  const input = { ...item, expectedAnswer: 'suis' };

  test('validates and sends the explanation schema', async () => {
    const provider = fakeProvider(good);
    expect(await explainMistake(input, contextOf(provider))).toEqual(good);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain('suis');
  });

  test('rejects an empty field', async () => {
    const err = await rejection(explainMistake(input, contextOf(fakeProvider({ ...good, tip: '  ' }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('tip');
  });
});

describe('gradeOpenAnswer', () => {
  const input = {
    prompt: "Comment demande-t-on l'âge ?",
    expectedAnswer: 'Vous avez quel âge ?',
    userAnswer: 'Quel âge as-tu ?',
  };

  test('returns a verdict and feedback, with no invented score', async () => {
    const provider = fakeProvider({ isCorrect: true, feedback: 'Fine, informal.', score: 97 });
    const result = await gradeOpenAnswer(input, contextOf(provider));
    expect(result).toEqual({ isCorrect: true, feedback: 'Fine, informal.' });
    expectSchemaSent(provider.requests[0]);
    expect(JSON.stringify(provider.requests[0].jsonSchema)).not.toContain('score');
  });

  test('rejects a verdict that is not a boolean', async () => {
    const err = await rejection(gradeOpenAnswer(input, contextOf(fakeProvider({ isCorrect: 'yes', feedback: 'ok' }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('isCorrect');
  });
});

describe('generateAdaptiveDrills', () => {
  const dictation = { ...ITEMS.NUMBER_DICTATION, id: 'd2', type: 'NUMBER_DICTATION' };
  const drills = {
    drillTitle: 'Passé composé',
    focusSummary: 'Auxiliaries and agreement.',
    items: [{ ...ITEMS.WORD_TRANSFORM, type: 'WORD_TRANSFORM' }, dictation],
  };
  const input = { targets: ['passe-compose' as const], count: 2, level: 'A2' };

  test('validates the set and sends the drills schema', async () => {
    const provider = fakeProvider(drills);
    const result = await generateAdaptiveDrills(input, contextOf(provider));
    expect(result.items).toHaveLength(2);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain('passe-compose');
  });

  test('recent mistakes reach the prompt as data', async () => {
    const provider = fakeProvider(drills);
    const recentMistakes = [{ prompt: 'Elle [___] partie.', userAnswer: 'a', expectedAnswer: 'est' }];
    await generateAdaptiveDrills({ ...input, recentMistakes }, contextOf(provider));
    expect(provider.requests[0].prompt).toContain(JSON.stringify(recentMistakes));
  });

  test('a dictation without the text to read aloud is rejected', async () => {
    const { audioText: _audio, ...silent } = dictation;
    const err = await rejection(generateAdaptiveDrills(input, contextOf(fakeProvider({ ...drills, items: [silent] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('audioText');
  });

  test('an item whose answer does not fit its type is rejected', async () => {
    const wrong = { ...ITEMS.GENDER_CHECK, type: 'GENDER_CHECK', expectedAnswer: 'neutre' };
    const err = await rejection(generateAdaptiveDrills(input, contextOf(fakeProvider({ ...drills, items: [wrong] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
  });

  test('refuses impossible requests before sending anything', async () => {
    const provider = fakeProvider(drills);
    await rejection(generateAdaptiveDrills({ ...input, targets: [] }, contextOf(provider)));
    await rejection(generateAdaptiveDrills({ ...input, count: 0 }, contextOf(provider)));
    await rejection(generateAdaptiveDrills({ ...input, count: 50 }, contextOf(provider)));
    await rejection(generateAdaptiveDrills({ ...input, level: ' ' }, contextOf(provider)));
    expect(provider.requests).toHaveLength(0);
  });
});

describe('generateExercises', () => {
  const article = 'Le matin, Léa prend le train pour Lyon. Elle a rendez-vous avec une amie.';
  const input = { articleText: article, count: 2, level: 'A2' };
  const {
    setId: _setId,
    level: _level,
    ...unit
  } = unitOf('FILL_BLANKS', [
    {
      ...ITEMS.FILL_BLANKS,
      prompt: 'Léa [___] le train.',
      expectedAnswer: 'prend',
      articleQuote: 'Léa prend le train',
    } as never,
  ]);
  const answer = (articleQuote: string | undefined) => ({
    units: [{ ...unit, items: [{ ...unit.items[0], articleQuote }] }],
  });
  /** One unit of three items numbered 1-3, with the given quotes. */
  const threeItems = (quotes: (string | undefined)[]) => ({
    units: [
      {
        ...unit,
        items: quotes.map((articleQuote, index) => ({
          ...unit.items[0],
          id: `i${index + 1}`,
          itemNumber: index + 1,
          articleQuote,
        })),
      },
    ],
  });

  test('keeps a quote that is in the article and sends the exercise schema', async () => {
    const provider = fakeProvider(answer('Le matin, Léa  PREND le train'));
    const result = await generateExercises(input, contextOf(provider));
    expect(result.units[0].items[0].articleQuote).toBe('Le matin, Léa  PREND le train');
    expect(result.dropped).toBe(0);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain(article);
  });

  test('a quote may join stretches with an ellipsis', async () => {
    const result = await generateExercises(input, contextOf(fakeProvider(answer('Léa prend … une amie.'))));
    expect(result.units).toHaveLength(1);
  });

  test('an item without a quote cannot be checked and is kept', async () => {
    const result = await generateExercises(input, contextOf(fakeProvider(answer(undefined))));
    expect(result.units[0].items[0].articleQuote).toBeUndefined();
    expect(result.dropped).toBe(0);
  });

  test('items whose quote is not in the article are left out and counted; the rest is kept and renumbered', async () => {
    const result = await generateExercises(
      input,
      contextOf(fakeProvider(threeItems(['Léa prend le train', 'Léa prend le bus', undefined]))),
    );
    expect(result.dropped).toBe(1);
    expect(result.units).toHaveLength(1);
    expect(result.units[0].items.map((item) => item.id)).toEqual(['i1', 'i3']);
    expect(result.units[0].items.map((item) => item.itemNumber)).toEqual([1, 2]);
  });

  test('a unit left with no items is dropped and the other units stay', async () => {
    const second = { ...unit, id: 'u2', items: [{ ...unit.items[0], articleQuote: 'Léa prend le bus' }] };
    const first = { ...unit, items: [{ ...unit.items[0], articleQuote: 'Elle a rendez-vous' }] };
    const result = await generateExercises(input, contextOf(fakeProvider({ units: [first, second] })));
    expect(result.units.map((u) => u.id)).toEqual([unit.id]);
    expect(result.dropped).toBe(1);
  });

  test('when nothing is left it fails and names the quotes', async () => {
    const err = await rejection(generateExercises(input, contextOf(fakeProvider(answer('Léa prend le bus')))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain(unit.items[0].id);
    expect(err.message).toContain('Léa prend le bus');
  });

  test('a schema failure throws with the schema reason', async () => {
    const err = await rejection(generateExercises(input, contextOf(fakeProvider({ units: [] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
  });

  test('an item that breaks its type shape is rejected', async () => {
    const broken = { units: [{ ...unit, items: [{ ...unit.items[0], expectedAnswer: ['a', 'b'] }] }] };
    const err = await rejection(generateExercises(input, contextOf(fakeProvider(broken))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('expectedAnswer');
  });

  test('a generated cloze without its passage fails instead of inventing one', async () => {
    const cloze = { ...unit, type: 'READING_CLOZE' };
    const err = await rejection(generateExercises(input, contextOf(fakeProvider({ units: [cloze] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('readingPassage');
    const readingPassage = { content: article };
    const result = await generateExercises(input, contextOf(fakeProvider({ units: [{ ...cloze, readingPassage }] })));
    expect(result.units[0].readingPassage).toEqual(readingPassage);
  });

  test('refuses an empty article or a bad count before sending', async () => {
    const provider = fakeProvider(answer('Léa prend le train'));
    await rejection(generateExercises({ ...input, articleText: '  ' }, contextOf(provider)));
    await rejection(generateExercises({ ...input, count: 2.5 }, contextOf(provider)));
    expect(provider.requests).toHaveLength(0);
  });
});

describe('transcribeMaterial', () => {
  const page = { data: 'AAAA', mimeType: 'image/png' };
  const article = { title: 'Le renard', text: 'Le renard dit au petit prince : « Adieu. »' };

  test('reads page images into a title and text, one attempt, with the abort signal', async () => {
    const provider = fakeProvider(article);
    const controller = new AbortController();
    const result = await transcribeMaterial({ images: [page, page], signal: controller.signal }, contextOf(provider));
    expect(result).toEqual(article);
    const request = provider.requests[0];
    expectSchemaSent(request);
    expect(request.images).toEqual([page, page]);
    expect(request.signal).toBe(controller.signal);
    expect(request.singleAttempt).toBe(true);
    expect(request.prompt).toContain('Transcribe the attached images');
    expect(provider.requests).toHaveLength(1);
  });

  test('uses the language of the interface', async () => {
    const provider = fakeProvider(article);
    await transcribeMaterial({ images: [page] }, contextOf(provider, 'vision', 'zh'));
    expect(provider.requests[0].prompt).toContain('转录');
  });

  test('accepts a page without a title', async () => {
    const result = await transcribeMaterial(
      { images: [page] },
      contextOf(fakeProvider({ title: '', text: 'Un texte sans titre.' })),
    );
    expect(result.title).toBe('');
  });

  test('refuses images for a model that cannot read them, before any request', async () => {
    const provider = fakeProvider(article);
    const err = await rejection(transcribeMaterial({ images: [page] }, contextOf(provider, 'text-only')));
    expect(err).toBeInstanceOf(ImageInputUnsupportedError);
    expect(err.message).toContain('text-only');
    expect(provider.requests).toHaveLength(0);
  });

  test('an unknown image model reaches the provider and surfaces its real error', async () => {
    const failure = new Error('The selected model does not accept image input.');
    const provider = fakeProvider(failure);
    const err = await rejection(transcribeMaterial({ images: [page] }, contextOf(provider, 'unknown')));
    expect(err).toBe(failure);
    expect(provider.requests).toHaveLength(1);
  });

  test('refuses no images, too many pages and bad images', async () => {
    const provider = fakeProvider(article);
    const ctx = contextOf(provider);
    await rejection(transcribeMaterial({ images: [] }, ctx));
    await rejection(transcribeMaterial({ images: new Array(MAX_EXTRACT_IMAGES + 1).fill(page) }, ctx));
    await rejection(transcribeMaterial({ images: [{ data: '', mimeType: 'image/png' }] }, ctx));
    await rejection(transcribeMaterial({ images: [{ data: 'AAAA', mimeType: 'application/pdf' }] }, ctx));
    expect(provider.requests).toHaveLength(0);
  });

  test('a malformed or empty transcription throws with the schema reason', async () => {
    const empty = await rejection(
      transcribeMaterial({ images: [page] }, contextOf(fakeProvider({ title: 'Titre', text: '   ' }))),
    );
    expect(empty).toBeInstanceOf(InvalidAnswerError);
    expect(empty.message).toContain('text');
    const notAnObject = await rejection(transcribeMaterial({ images: [page] }, contextOf(fakeProvider('oops'))));
    expect(notAnObject).toBeInstanceOf(InvalidAnswerError);
  });

  test('a cancelled request surfaces as an abort, not a bad answer', async () => {
    const abort = new DOMException('The request was cancelled.', 'AbortError');
    const err = await rejection(transcribeMaterial({ images: [page] }, contextOf(fakeProvider(abort))));
    expect(isAbortError(err)).toBe(true);
  });
});

describe('extractMaterial', () => {
  const page = { data: 'AAAA', mimeType: 'image/png' };

  test('reads pasted text into a validated draft', async () => {
    const provider = fakeProvider(draftFixture);
    const draft = await extractMaterial({ mode: 'complete', text: 'Un exercice sans corrigé.' }, contextOf(provider));
    expect(draft.units[0].items[0].expectedAnswer).toBeNull();
    const request = provider.requests[0];
    expectSchemaSent(request);
    expect(request.images).toBeUndefined();
    expect(request.prompt).toContain('Un exercice sans corrigé.');
    // One attempt on the chosen model, as the learner was told.
    expect(request.singleAttempt).toBe(true);
  });

  test('sends images to a model that reads them, with the abort signal', async () => {
    const provider = fakeProvider(draftFixture);
    const controller = new AbortController();
    await extractMaterial({ mode: 'extract', images: [page, page], signal: controller.signal }, contextOf(provider));
    expect(provider.requests[0].images).toEqual([page, page]);
    expect(provider.requests[0].signal).toBe(controller.signal);
    expect(provider.requests[0].prompt).toContain('one or more images');
  });

  test('refuses images for a model that cannot read them, before any request', async () => {
    const provider = fakeProvider(draftFixture);
    const err = await rejection(
      extractMaterial({ mode: 'complete', images: [page] }, contextOf(provider, 'text-only')),
    );
    expect(err).toBeInstanceOf(ImageInputUnsupportedError);
    expect(err.message).toContain('text-only');
    expect(provider.requests).toHaveLength(0);
  });

  test('an explicitly selected unknown image model reaches the provider and surfaces its real error', async () => {
    const failure = new Error('The selected model does not accept image input.');
    const provider = fakeProvider(failure);
    const err = await rejection(extractMaterial({ mode: 'complete', images: [page] }, contextOf(provider, 'unknown')));
    expect(err).toBe(failure);
    expect(provider.requests).toHaveLength(1);
    expect(provider.configs[0].model).toBe('unknown');
    expect(provider.requests[0].singleAttempt).toBe(true);
  });

  test('text alone works on a model without image input', async () => {
    const provider = fakeProvider(draftFixture);
    await extractMaterial({ mode: 'complete', text: 'Bonjour' }, contextOf(provider, 'text-only'));
    expect(provider.requests).toHaveLength(1);
  });

  test('refuses nothing to read, too many pages and bad images', async () => {
    const provider = fakeProvider(draftFixture);
    const ctx = contextOf(provider);
    await rejection(extractMaterial({ mode: 'complete' }, ctx));
    await rejection(extractMaterial({ mode: 'complete', text: '   ' }, ctx));
    await rejection(extractMaterial({ mode: 'complete', images: new Array(MAX_EXTRACT_IMAGES + 1).fill(page) }, ctx));
    await rejection(extractMaterial({ mode: 'complete', images: [{ data: '', mimeType: 'image/png' }] }, ctx));
    await rejection(
      extractMaterial({ mode: 'complete', images: [{ data: 'AAAA', mimeType: 'application/pdf' }] }, ctx),
    );
    expect(provider.requests).toHaveLength(0);
  });

  test('a malformed draft throws with the schema reason', async () => {
    const bad = { ...draftFixture, units: [{ ...draftFixture.units[0], section: 'NOPE' }] };
    const err = await rejection(extractMaterial({ mode: 'complete', text: 'x' }, contextOf(fakeProvider(bad))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('section');
    const notAnObject = await rejection(
      extractMaterial({ mode: 'complete', text: 'x' }, contextOf(fakeProvider('oops'))),
    );
    expect(notAnObject).toBeInstanceOf(InvalidAnswerError);
  });

  test('the mode decides which answers stand', async () => {
    const answered = {
      ...draftFixture,
      units: [{ ...draftFixture.units[0], items: [{ ...draftFixture.units[0].items[0], expectedAnswer: 'étudiant' }] }],
    };
    const extractOnly = await extractMaterial({ mode: 'extract', text: 'x' }, contextOf(fakeProvider(answered)));
    expect(extractOnly.units[0].items[0].expectedAnswer).toBeNull();
    const completed = await extractMaterial({ mode: 'complete', text: 'x' }, contextOf(fakeProvider(answered)));
    expect(completed.units[0].items[0].expectedAnswer).toBe('étudiant');
  });

  test('a cancelled request surfaces as an abort, not a bad answer', async () => {
    const abort = new DOMException('The request was cancelled.', 'AbortError');
    const err = await rejection(extractMaterial({ mode: 'complete', text: 'x' }, contextOf(fakeProvider(abort))));
    expect(isAbortError(err)).toBe(true);
  });
});

describe('Gemini image input', () => {
  test('the text models read images and the speech model does not', () => {
    for (const model of gemini.info.text!.models) expect(geminiText.imageInputCapability(model)).toBe('supported');
    expect(gemini.info.text!.imageModels).toEqual(gemini.info.text!.models);
    expect(geminiText.imageInputCapability('gemini-3.8-flash-lite-tts')).toBe('unsupported');
    expect(geminiText.imageInputCapability('gemini-custom-vision')).toBe('unknown');
    expect(geminiText.imageInputCapability('some-other-model')).toBe('unknown');
  });

  test('an image request to a model that cannot read images is refused before the network', async () => {
    const err = await rejection(
      geminiText.generateJson(
        { prompt: 'x', images: [{ data: 'AAAA', mimeType: 'image/png' }] },
        { apiKey: 'test', model: 'gemini-3.8-flash-lite-tts' },
      ),
    );
    expect(err).toBeInstanceOf(ImageInputUnsupportedError);
  });

  test('Gemini sends an explicitly selected unknown image model once and returns the real unsupported error', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json(
        {
          error: { code: 400, message: 'This model cannot accept image input.', status: 'INVALID_ARGUMENT' },
        },
        { status: 400 },
      ),
    );
    try {
      const err = await rejection(
        geminiText.generateJson(
          { prompt: 'x', images: [{ data: 'AAAA', mimeType: 'image/png' }], singleAttempt: true },
          { apiKey: 'fixture-key', model: 'gemini-unknown-image-model' },
        ),
      );
      expect(err).not.toBeInstanceOf(ImageInputUnsupportedError);
      expect(err.message).toContain('This model cannot accept image input.');
      expect(fetch).toHaveBeenCalledTimes(1);
      const requested = fetch.mock.calls[0][0];
      const url = requested instanceof Request ? requested.url : requested.toString();
      expect(url).toContain('gemini-unknown-image-model:generateContent');
    } finally {
      fetch.mockRestore();
    }
  });

  test('an already cancelled request never reaches the network', async () => {
    const controller = new AbortController();
    controller.abort();
    const err = await rejection(
      geminiText.generateJson(
        { prompt: 'x', signal: controller.signal, singleAttempt: true },
        { apiKey: 'test', model: 'gemini-2.5-flash' },
      ),
    );
    expect(isAbortError(err)).toBe(true);
  });
});
