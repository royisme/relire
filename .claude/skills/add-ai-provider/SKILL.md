---
name: add-ai-provider
description: Add a new AI provider (text, speech, or both) to Relire's provider registry so it appears in Settings with its models, voices and key. Use when asked to support another AI service such as OpenAI, Mistral or a local model.
---

# Add an AI provider

Read `docs/architecture.md` (AI layer) and `src/services/ai/types.ts` first. Use `providers/gemini/` as the reference implementation.

## Decide with the user first
- Which roles it serves: text (explanations, drills, scoring, and page images for import), speech (TTS), or both. Settings shows one entry per role's purposes — Text AI, OCR, Speech synthesis — and one key per provider is shared across them.
- Model and voice lists, and the default of each.
- Whether its text models accept audio input. If not, pronunciation scoring falls back to the transcript automatically (`supportsAudioInput: false`).
- Whether it can list models through an official endpoint that accepts a browser request. A provider without one simply offers no discovery: never guess an endpoint.
- Whether it can be called from a browser (CORS) with a user key. Relire has no server; a provider that needs one cannot be added this way.

## Steps
1. Create `src/services/ai/providers/<id>/` with an `index.ts` exporting a `Provider`: `info` (`id`, `keyUrl`, `text` and/or `speech` with models and voices) plus `text` and/or `speech` implementations and, when discovery exists, a `catalogue`.
   - `TextProvider.generateJson(request, config)`: send `request.prompt` (and `request.audio` when supported), return parsed JSON. Retries, model fallback and response cleanup live in this folder.
   - `TextProvider.checkKey(config)`: a cheap call that proves the key in `config` works (throws otherwise).
   - `TextProvider.imageInputCapability(model)`: `supported` only for models verified to read images, `unsupported` only for models verified not to, and `unknown` for everything else. Keep the verified set small and explicit; never infer image input from a name pattern.
   - `SpeechProvider.synthesize(request, config)`: return a WAV `Blob` (convert if the API returns another format); honour `request.signal`.
   - `ModelCatalogue.listModels(apiKey, signal)`: call the official listing endpoint with the key in a header, follow pagination with a bound, deduplicate canonical IDs, honour the abort signal and throw on malformed or empty answers. `capabilities(model)` returns `supported`/`unsupported`/`unknown` the same way as `imageInputCapability`; a model's presence in the list proves neither image input nor audio output.
2. Register it in `src/services/ai/providers/index.ts`.
3. Add display names to **both** locale files: `providers.<id>`, `models.<model>`, `voices.<voice>`.
4. Do not touch prompts, tasks or the cache: tasks are provider-neutral, and cache keys deliberately ignore provider and model.
5. Add a CHANGELOG line under Unreleased → Added.

## Verify
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run i18n:check`, `bun run build`.
- Settings lists the provider for the roles it supports; Text AI, OCR and speech each choose a provider and model independently, and one key per provider serves every purpose that names it.
- Fetch models returns the real list (paged, deduplicated) and an error is shown as-is; a custom typed model ID survives save and reload.
- A saved settings object naming an unknown provider still falls back to defaults; an unknown model ID is kept (`appSettings.ts`).
- Mock the provider's endpoint in a browser check (`verify-ui` skill, add a route) for a lookup, an image extraction and a clip. Tell the user it was not tested against the real API unless they supplied a key.
