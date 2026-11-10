/** Owns material extraction, transcription and Gemini image-input cases, not exercise feedback or generation. */
import { describe, expect, spyOn, test } from 'bun:test';
import { ImageInputUnsupportedError, InvalidAnswerError, isAbortError } from '../src/services/ai/errors';
import { MAX_EXTRACT_IMAGES, extractMaterial, transcribeMaterial } from '../src/services/ai/tasks';
import { geminiText } from '../src/services/ai/providers/gemini/client';
import { gemini } from '../src/services/ai/providers/gemini';
import { draftFixture } from './fixtures/importDraft';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { expectSchemaSent, rejection } from './fixtures/aiTaskAssertions';

describe('transcribeMaterial', () => {
  const page = { data: 'AAAA', mimeType: 'image/png' };
  const article = { title: 'Le renard', text: 'Le renard dit au petit prince : « Adieu. »' };

  test('reads page images into a title and text, one attempt, with the abort signal', async () => {
    const provider = fakeProvider(article);
    const controller = new AbortController();
    const images = Array.from({ length: MAX_EXTRACT_IMAGES }, (_, index) => ({ ...page, data: `page-${index}` }));
    const result = await transcribeMaterial({ images, signal: controller.signal }, contextOf(provider));
    expect(result).toEqual(article);
    const request = provider.requests[0];
    expectSchemaSent(request);
    expect(request.images).toEqual(images);
    expect(request.prompt).toContain('up to five pages');
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
    const draft = await extractMaterial(
      { mode: 'complete', learningArea: 'grammar', text: 'Un exercice sans corrigé.' },
      contextOf(provider),
    );
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
    const images = Array.from({ length: MAX_EXTRACT_IMAGES }, (_, index) => ({ ...page, data: `page-${index}` }));
    await extractMaterial(
      { mode: 'extract', learningArea: 'grammar', images, signal: controller.signal },
      contextOf(provider),
    );
    expect(provider.requests[0].images).toEqual(images);
    expect(provider.requests[0].prompt).toContain('up to five pages');
    expect(provider.requests[0].signal).toBe(controller.signal);
    expect(provider.requests[0].prompt).toContain('one or more images');
  });

  test('refuses images for a model that cannot read them, before any request', async () => {
    const provider = fakeProvider(draftFixture);
    const err = await rejection(
      extractMaterial({ mode: 'complete', learningArea: 'grammar', images: [page] }, contextOf(provider, 'text-only')),
    );
    expect(err).toBeInstanceOf(ImageInputUnsupportedError);
    expect(err.message).toContain('text-only');
    expect(provider.requests).toHaveLength(0);
  });

  test('an explicitly selected unknown image model reaches the provider and surfaces its real error', async () => {
    const failure = new Error('The selected model does not accept image input.');
    const provider = fakeProvider(failure);
    const err = await rejection(
      extractMaterial({ mode: 'complete', learningArea: 'grammar', images: [page] }, contextOf(provider, 'unknown')),
    );
    expect(err).toBe(failure);
    expect(provider.requests).toHaveLength(1);
    expect(provider.configs[0].model).toBe('unknown');
    expect(provider.requests[0].singleAttempt).toBe(true);
  });

  test('text alone works on a model without image input', async () => {
    const provider = fakeProvider(draftFixture);
    await extractMaterial(
      { mode: 'complete', learningArea: 'grammar', text: 'Bonjour' },
      contextOf(provider, 'text-only'),
    );
    expect(provider.requests).toHaveLength(1);
  });

  test('refuses nothing to read, too many pages and bad images', async () => {
    const provider = fakeProvider(draftFixture);
    const ctx = contextOf(provider);
    await rejection(extractMaterial({ mode: 'complete', learningArea: 'grammar' }, ctx));
    await rejection(extractMaterial({ mode: 'complete', learningArea: 'grammar', text: '   ' }, ctx));
    await rejection(
      extractMaterial(
        { mode: 'complete', learningArea: 'grammar', images: new Array(MAX_EXTRACT_IMAGES + 1).fill(page) },
        ctx,
      ),
    );
    await rejection(
      extractMaterial(
        { mode: 'complete', learningArea: 'grammar', images: [{ data: '', mimeType: 'image/png' }] },
        ctx,
      ),
    );
    await rejection(
      extractMaterial(
        { mode: 'complete', learningArea: 'grammar', images: [{ data: 'AAAA', mimeType: 'application/pdf' }] },
        ctx,
      ),
    );
    expect(provider.requests).toHaveLength(0);
  });

  test('a malformed draft throws with the schema reason', async () => {
    const bad = { ...draftFixture, units: [{ ...draftFixture.units[0], section: 'NOPE' }] };
    const err = await rejection(
      extractMaterial({ mode: 'complete', learningArea: 'grammar', text: 'x' }, contextOf(fakeProvider(bad))),
    );
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('section');
    const notAnObject = await rejection(
      extractMaterial({ mode: 'complete', learningArea: 'grammar', text: 'x' }, contextOf(fakeProvider('oops'))),
    );
    expect(notAnObject).toBeInstanceOf(InvalidAnswerError);
  });

  test('the mode decides which answers stand', async () => {
    const answered = {
      ...draftFixture,
      units: [{ ...draftFixture.units[0], items: [{ ...draftFixture.units[0].items[0], expectedAnswer: 'étudiant' }] }],
    };
    const extractOnly = await extractMaterial(
      { mode: 'extract', learningArea: 'grammar', text: 'x' },
      contextOf(fakeProvider(answered)),
    );
    expect(extractOnly.units[0].items[0].expectedAnswer).toBeNull();
    const completed = await extractMaterial(
      { mode: 'complete', learningArea: 'grammar', text: 'x' },
      contextOf(fakeProvider(answered)),
    );
    expect(completed.units[0].items[0].expectedAnswer).toBe('étudiant');
  });

  test('a cancelled request surfaces as an abort, not a bad answer', async () => {
    const abort = new DOMException('The request was cancelled.', 'AbortError');
    const err = await rejection(
      extractMaterial({ mode: 'complete', learningArea: 'grammar', text: 'x' }, contextOf(fakeProvider(abort))),
    );
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
