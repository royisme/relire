---
paths:
  - "src/storage/**"
  - "src/App.tsx"
  - "src/utils/appSettings.ts"
---

# Storage rules

Data map and lifetimes are in `docs/architecture.md` (Data and persistence).

- Only `src/storage/` touches IndexedDB; `db.ts` owns the schema (stores `articles`, `vocab`, `meta`, `cache`, `audio`).
- A new persisted entity needs: a store in `db.ts`, an entry in `exportData` / `importData`, and a `usePersist` call in `App.tsx`.
- Backups never include API keys. They include prompt edits and, optionally, the vocabulary's audio (`exportProtectedAudio`). The `cache` store is never backed up.
- Only settings needed synchronously at startup live in localStorage (`relire_app_settings_v1`, `relire_prompts_v1`, `relire_lang`, `relire_onboarded`, `relire_theme`).
- The app is not released yet, so stored shapes may change freely. After the first release, keep them backwards compatible and bump the IndexedDB version with an `upgrade` step.
- Audio for saved vocabulary (word, context sentence, example sentences) is protected from trimming; other clips are trimmed least-recently-used past `AUDIO_CAP_BYTES`.
