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
- Whether it can be called from a browser (CORS) with a user key. Relire has no server; a provider that needs one cannot be added this way. Probe the endpoint's `OPTIONS` answer before building.
- Whether the learner supplies a key at all. A local server (Ollama) declares `requiresKey: false`; never invent a key or send an empty `Authorization` for it.
- Whether it has a default endpoint the learner may override (declare `defaultBaseUrl`, and the Settings page grows a Base URL field) or one fixed host. An override goes through `services/ai/baseUrl.ts` and `config.baseUrl`; never build a URL from an unvalidated setting.
- Whether it has a fixed voice list. An empty `speech.voices` means the learner types a voice ID, so provide an `acceptsVoice` rule that storage, Save and the field all share.

## Steps
1. Create `src/services/ai/providers/<id>/` with an `index.ts` exporting a `Provider`: `info` (`id`, `keyUrl`, `text` and/or `speech` with models and voices, `defaultBaseUrl` when the endpoint is editable, `requiresKey: false` when no key is needed) plus `text` and/or `speech` implementations and, when discovery exists, a `catalogue`.
   - `TextProvider.generateJson(request, config)`: send `request.prompt` (and `request.audio` when supported), return parsed JSON. Retries, model fallback and response cleanup live in this folder; a new provider starts with one attempt and no fallback.
   - `TextProvider.checkKey(config)`: a cheap call that proves the key in `config` works (throws otherwise). A keyless provider still offers one that proves the server answers.
   - `TextProvider.imageInputCapability(model)`: `supported` only for models verified to read images, `unsupported` only for models verified not to, and `unknown` for everything else. Keep the verified set small and explicit; never infer image input from a name pattern.
   - `SpeechProvider.synthesize(request, config)`: return a playable `Blob` (WAV or MP3, with its own MIME type); honour `request.signal`. Add `acceptsVoice` when the voice space is not a fixed list.
   - `ModelCatalogue.listModels(apiKey, signal, baseUrl)`: call the official listing endpoint with the key in a header, follow pagination with a bound, deduplicate canonical IDs, honour the abort signal and throw on malformed or empty answers. `capabilities(model)` returns `supported`/`unsupported`/`unknown` the same way as `imageInputCapability`; a model's presence in the list proves neither image input nor audio output.
2. Register it in `src/services/ai/providers/index.ts`.
3. Add display names to **both** locale files: `providers.<id>`, `models.<model>`, `voices.<voice>`.
4. Do not touch prompts, tasks or the cache: tasks are provider-neutral, and cache keys deliberately ignore provider and model.
5. Add a CHANGELOG line under Unreleased → Added.

## Verify
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run i18n:check`, `bun run build`.
- Settings lists the provider for the roles it supports; Text AI, OCR and speech each choose a provider and model independently, and one key per provider serves every purpose that names it.
- Fetch models returns the real list (paged, deduplicated) and an error is shown as-is; a custom typed model ID survives save and reload.
- A provider with `defaultBaseUrl` shows the Base URL field: the default as placeholder, an unusable address refused inline and never saved, and the override reaching this provider only. A `requiresKey: false` provider works with no key at all, and its check proves the server answers.
- A speech provider without a fixed voice list shows a Voice ID field, rejects an id its own rule refuses, and stores a clip under provider+model+voice with the returned MIME type.
- A saved settings object naming an unknown provider still falls back to defaults; an unknown model ID is kept (`appSettings.ts`).
- Mock the provider's endpoint in a browser check (`verify-ui` skill, add a route) for a lookup, an image extraction and a clip. Tell the user it was not tested against the real API unless they supplied a key.
