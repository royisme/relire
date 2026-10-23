---
paths:
  - "src/services/**"
---

# AI layer rules

Structure is in `docs/architecture.md` (AI layer section).

- All AI calls go through `src/services/ai`. `tasks.ts` is written against `TextProvider` / `SpeechProvider` only and never names a provider.
- Features ask `getAiAccess()` (`services/ai/access.ts`) for their purpose — `text`, `ocr` or `speech` — and take the bound execution from it. That boundary is the only place that reads `AppSettings`, resolves a provider or touches a key; a feature never reads a key or a provider directly. It is also the stated replacement point for a future hosted, paid service: no backend, account or balance exists, and there is no fallback between the two.
- One key per provider is shared by every purpose that names it; each purpose's provider and model stay independent. A new stored model ID is kept even when no static or fetched list contains it (`normalizeModelId`: nonempty, at most 512 characters, no control characters, `models/` prefix stripped).
- Capabilities are `supported`, `unsupported` or `unknown`. Only a confirmed `unsupported` blocks a request or is filtered out of the suggestions; an `unknown` model reaches the provider with the learner's selection and returns the provider's real error. Never infer support from `generateContent`, and never call a fetch or a check a successful test.
- Model discovery lives in the provider's `catalogue` and must use the provider's official listing endpoint (key in a header, never the URL), follow pagination with a bound, deduplicate canonical IDs, honour the abort signal, and throw on malformed or empty responses instead of substituting defaults. Nothing about a fetched list is persisted.
- A provider that offers an endpoint override declares `defaultBaseUrl`; the override lives in `AppSettings.baseUrls`, is validated in `services/ai/baseUrl.ts` (http(s) only, no credentials, query or fragment) and travels through the `AiAccess` snapshot. A nonempty unusable endpoint fails the request rather than silently posting to the default host.
- `requiresKey: false` means a local provider (Ollama) is configured without a key: never invent one, never send an empty `Authorization`, and say in the help text that the machine must allow this origin (`OLLAMA_ORIGINS`). A local or browser-restricted provider is reported with its real network error; there is no proxy.
- A provider may be the platform's own voice: `info.speech.device` declares it (no key, no model, no voice list, no clip), and its `SpeechProvider.synthesize` throws `DeviceVoiceError` instead of inventing a Blob. Settings, `AiAccess.selection('speech').device` and playback read that one declaration, never a provider id.
- A speech provider may return MP3 as well as WAV: keep the Blob's own type, key clips by provider+model+voice as before, and preserve each clip's MIME type through backup export/import.
- Never fabricate fallback content when a call fails. Throw, and let the UI show the error (`errorMessage`); a missing key throws `MissingApiKeyError`.
- **Never write prompt wording in TypeScript.** Prompts are templates in `prompts/defaults/<task>.<lang>.txt`; a new variable is declared in `registry.ts` and supplied by `prompts/index.ts`. Both languages change together.
- `promptFingerprint` is part of every cache key, so editing a template never serves answers made with the old one. Do not remove it from keys.
- Cache keys are language + prompt fingerprint + normalized text, deliberately not provider, model or article context. Keep it that way unless the user decides otherwise.
- Import consent pins an `AiAccess` snapshot (settings and keys, in memory) through asynchronous rendering; pass it to the api function (`api.extractMaterial` or `api.transcribeMaterial`) so provider/model/key cannot silently change before send. The article import reads images and PDFs with `api.transcribeMaterial` on the `ocr` selection and sends pasted text nowhere; the exercise import uses `ocr` for images and PDFs and `text` for pasted text. Never persist that snapshot.
- Exercise tasks (extraction, transcription of article pages, hints, explanations, grading, drills, generated exercises) send the JSON schema from `services/exercises/jsonSchema.ts` and parse the answer with the Zod schema of the contract; a failure throws with the schema's reasons. A template describes exactly the fields its schema accepts, in both languages. A task that sends images checks its `imageInput` capability first and refuses with `ImageInputUnsupportedError` when it is `unsupported`. Extraction is one attempt, cancellable, never cached; grading and adaptive drills are never cached either (the caching table is in `docs/architecture.md`).
- Pronunciation assessments are never cached. Text pronunciation markers are a separate cached task: validate unknown output before cache/render and revalidate hits against canonical source tokens. JSON-schema output is not enough, and unresolved annotations must remain unmarked.
- Provider code (HTTP, retries, response parsing, audio format) stays inside its `providers/<id>/` folder, including its `catalogue` when it offers model listing.
- Adding a provider is a workflow: use the `add-ai-provider` skill.
