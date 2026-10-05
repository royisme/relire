import type { PracticeDeck, PronunciationAssessment, SentenceAnalysis, WordAnalysis } from '../../types';
import { drillsRequest, pronunciationRequest, sentenceRequest, wordRequest } from './prompts';
import type { Lang, TextConfig, TextProvider } from './types';

/**
 * What the app asks the AI to do. Each task is a prompt (prompts/) sent through
 * whichever text provider the user picked; nothing here knows about Gemini.
 */

export interface TextContext {
  provider: TextProvider;
  config: TextConfig;
  lang: Lang;
}

export const analyzeWord = (input: Parameters<typeof wordRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<WordAnalysis>(wordRequest(input, ctx.lang), ctx.config);

export const analyzeSentence = (input: Parameters<typeof sentenceRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<SentenceAnalysis>(sentenceRequest(input, ctx.lang), ctx.config);

export const generateDrills = (input: Parameters<typeof drillsRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<PracticeDeck>(drillsRequest(input, ctx.lang), ctx.config);

export const assessPronunciation = (input: Parameters<typeof pronunciationRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<PronunciationAssessment>(
    // A provider that cannot listen is scored on the transcript alone.
    pronunciationRequest({ ...input, audio: ctx.provider.supportsAudioInput ? input.audio : undefined }, ctx.lang),
    ctx.config
  );
