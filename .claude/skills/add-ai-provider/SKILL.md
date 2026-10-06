---
name: add-ai-provider
description: Add a new AI provider (text, speech, or both) to Relire's provider registry so it appears in Settings with its models, voices and key. Use when asked to support another AI service such as OpenAI, Mistral or a local model.
---

# Add an AI provider

Read `docs/architecture.md` (AI layer) and `src/services/ai/types.ts` first. Use `providers/gemini/` as the reference implementation.

## Decide with the user first
- Which roles it serves: text (explanations, drills, scoring), speech (TTS), or both.
- Model and voice lists, and the default of each.
- Whether its text models accept audio input. If not, pronunciation scoring falls back to the transcript automatically (`supportsAudioInput: false`).
- Whether it can be called from a browser (CORS) with a user key. Relire has no server; a provider that needs one cannot be added this way.

## Steps
1. Create `src/services/ai/providers/<id>/` with an `index.ts` exporting a `Provider`: `info` (`id`, `keyUrl`, `text` and/or `speech` with models and voices) plus `text` and/or `speech` implementations.
   - `TextProvider.generateJson(request, config)`: send `request.prompt` (and `request.audio` when supported), return parsed JSON. Retries, model fallback and response cleanup live in this folder.
   - `TextProvider.checkKey(config)`: a cheap call that proves the key in `config` works (throws otherwise).
   - `SpeechProvider.synthesize(request, config)`: return a WAV `Blob` (convert if the API returns another format).
2. Register it in `src/services/ai/providers/index.ts`.
3. Add display names to **both** locale files: `providers.<id>`, `models.<model>`, `voices.<voice>`.
4. Do not touch prompts, tasks or the cache: tasks are provider-neutral, and cache keys deliberately ignore provider and model.
5. Add a CHANGELOG line under Unreleased → Added.

## Verify
- `bun run lint`, `bun run i18n:check`, `bun run build`.
- Settings lists the provider for the roles it supports; text and speech can use different providers, each keeping its own key.
- A saved settings object naming an unknown provider or model still falls back to defaults (`appSettings.ts`).
- Mock the provider's endpoint in a browser check (`verify-ui` skill, add a route) for a lookup and a clip. Tell the user it was not tested against the real API unless they supplied a key.
