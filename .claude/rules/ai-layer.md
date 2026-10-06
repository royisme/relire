---
paths:
  - "src/services/**"
---

# AI layer rules

Structure is in `docs/architecture.md` (AI layer section).

- All AI calls go through `src/services/ai`. `tasks.ts` is written against `TextProvider` / `SpeechProvider` only and never names a provider.
- Never fabricate fallback content when a call fails. Throw, and let the UI show the error (`errorMessage`); a missing key throws `MissingApiKeyError`.
- **Never write prompt wording in TypeScript.** Prompts are templates in `prompts/defaults/<task>.<lang>.txt`; a new variable is declared in `registry.ts` and supplied by `prompts/index.ts`. Both languages change together.
- `promptFingerprint` is part of every cache key, so editing a template never serves answers made with the old one. Do not remove it from keys.
- Cache keys are language + prompt fingerprint + normalized text, deliberately not provider, model or article context. Keep it that way unless the user decides otherwise.
- Pronunciation assessments are never cached.
- Provider code (HTTP, retries, response parsing, audio format) stays inside its `providers/<id>/` folder.
- Adding a provider is a workflow: use the `add-ai-provider` skill.
