---
paths:
  - "src/storage/**"
  - "src/App.tsx"
  - "src/utils/appSettings.ts"
  - "src/utils/pronunciationPreferences.ts"
---

# Storage rules

Data map and lifetimes are in `docs/architecture.md` (Data and persistence).

- Only `src/storage/` touches IndexedDB; `db.ts` owns the schema (stores `articles`, `vocab`, `meta`, `cache`, `audio`, `shadowing`, `units`, `itemStates`, `attempts`; version 5).
- A new persisted entity needs: a store in `db.ts`, an entry in `exportData` / `importData`, and a `usePersist` call in `App.tsx`.
- Backups never include API keys. They include prompt edits and, optionally, the vocabulary's audio (`exportProtectedAudio`) and shadowing recordings (`exportShadowing`; a backup without the key keeps existing recordings, `[]` clears them, malformed recordings reject the whole import). The `cache` store is never backed up.
- Only settings needed synchronously at startup live in localStorage (`relire_app_settings_v1`, `relire_prompts_v1`, `relire_lang`, `relire_onboarded`, `relire_theme`, `relire_sidebar` (expanded or collapsed sidebar), `relire_practice_card_pos` (where the learner dragged the practice card), `relire_pronunciation_preferences_v1`, `relire_pronunciation_skipped_v1`). Marker preferences contain only per-article display/layer flags; the skipped list holds only sentence texts whose AI answers failed validation, with the error. Neither holds annotations or a readiness flag, and neither is backed up.
- The app is not released yet, so stored shapes may change freely. After the first release, keep them backwards compatible and bump the IndexedDB version with an `upgrade` step.
- Audio for saved vocabulary (word, context sentence, example sentences) is protected from trimming; other clips are trimmed least-recently-used past `AUDIO_CAP_BYTES`.
- Recordings live only in `storage/shadowing.ts`: a take is saved in one transaction that checks the article still exists and keeps at most `MAX_TAKES`; deleting an article goes through `deleteArticleData` (article and recordings together), never the generic `saveArticles` sync.
- Exercise data lives only in `storage/exercises.ts` (with `exerciseAttempts.ts`, `exerciseRows.ts`, `exerciseBackup.ts`, `exerciseEvents.ts`). Checking an item writes its item state and its attempt in one transaction; a failure rejects, and checking an already checked item returns the committed state without a second attempt. Never write these stores outside that module except the cascade in `deleteArticleData` and the restore in `importData`.
- Every exercise state write takes the unit's reset token (`getResetToken`, read when the work starts) and is rejected with `StaleResetError` when the token moved. Reset, unit delete, article delete and restore bump it in the same transaction as their change; tokens (`meta`, `exerciseReset:<unitId>`) are bumped, never removed.
- Reset keeps attempts. Deleting a unit keeps attempts. Deleting an article deletes its units and item states (same transaction as the article) but keeps attempts: they carry their own prompt and answer text.
- Backups always include `units`, `itemStates`, `attempts` (no toggle). `importData` validates them with the Zod schemas before opening the transaction; malformed data or dangling references reject the whole restore, an absent key keeps the stored rows, `[]` clears them. `Article.kind` (`'article' | 'workbook'`, absent = article) needs no migration.
- Storage tests (`bun test`) run on `fake-indexeddb`: call `freshDb()` from `tests/fixtures/storage.ts` in `beforeEach` so every test gets a new database.
