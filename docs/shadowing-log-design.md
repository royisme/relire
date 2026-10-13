# Shadowing log: design

Status: proposal on `feat/shadowing-log`, revised after a GPT (Codex) review. Nothing implemented yet. One decision is open for the user (see the end).

## Problem

The learner listens to an article sentence by sentence and wants to repeat each sentence right after hearing it, keep the recording, and come back later to compare their own reading with the reference. Today:

- Shadowing only exists inside the sentence drawer (after an AI sentence analysis) and in Practice. Listening happens in the reader's article player, so "hear" and "repeat" live in different places.
- Recordings are never kept: `useShadowingRecorder` holds one object URL and drops it when the sentence or screen changes. Only `{date, text, score}` survives in `UserStats.pronunciationHistory`.

Goal: **record a repeat where the listening happens, in one step, and review every sentence as a row of "text | reference audio | my recordings".**

## Decisions (made with the user)

| Topic | Decision |
| --- | --- |
| Shadowing style | Listen to the whole sentence, then repeat it (echo). Playback is always stopped while recording, so speakers are fine. |
| Recordings kept | 3 per sentence, first in first out. No pinning in v1. |
| Scoring | Not in v1. Later: a Settings switch to enable scoring and an option to score every take automatically. v1 makes no assessment call and does not change stats. |
| Where the log lives | The Vocabulary tab is labelled **My study** and gets two sub-tabs, **Words** (today's vocabulary, unchanged) and **Shadowing**. The last sub-tab is remembered. The top bar keeps four tabs; the internal tab id stays `vocab` (the due-count badges depend on it). |
| Stopping a recording | Tap to stop. Automatic silence detection is a possible later setting. |
| Backups | Recordings are optional in backups (off by default). |
| Edited or deleted text | Recordings are never silently lost: a sentence whose text no longer appears in its article is shown as "original text changed"; deleting an article deletes its recordings in the same action, and the dialog says so. |

## Scope

Building: Shadow mode in the article player; local storage with the 3-take limit; the Shadowing sub-tab with reference playback, take playback, reference→take comparison, take deletion and "open in reader"; Settings storage line and delete-all; optional backup; e2e specs.

Not building in v1: scoring or any assessment call; recording from the sentence pill (open decision below); a mark on recorded sentences in the reader; a "recent" sort; waveform/pitch display; simultaneous shadowing; automatic stop; sharing single recordings; sync.

**Cost note.** v1 never calls an assessment. The reference audio is the article's normal synthesized speech: if a sentence's clip is not stored yet (or was trimmed), playing the reference synthesizes it through the configured speech provider, which can cost a request, exactly like pressing play in the reader. The UI never says "free".

## Data

New IndexedDB object store `shadowing`, added by an `oldVersion < 4` step in `db.ts` (3 → 4, additive; the five existing stores are untouched). One bounded record per sentence of an article:

```ts
interface ShadowingSentence {
  key: string;            // `${articleId}|${normalizeText(text)}`
  articleId: string;
  text: string;           // trimmed sentence as written when last recorded
  updatedAt: number;      // recordedAt of the newest remaining take
  takes: ShadowingTake[]; // oldest first, at most 3
}

interface ShadowingTake {
  id: string;             // crypto.randomUUID()
  recordedAt: number;
  mimeType: string;       // MediaRecorder.mimeType actually used
  durationMs: number;     // performance.now() between start and the final dataavailable
  bytes: number;          // blob.size, measured
  blob: Blob;
}
```

- **One record per sentence** (takes inside) is kept for v1: at most three takes, so reading a record is bounded. Reading the list does read the blobs of every record it returns (IndexedDB returns whole values); the list stays lazy at the decoding level only, by creating object URLs on play. If lists get slow, split metadata and blobs later.
- **FIFO in one readwrite transaction:** get, append, drop from the front while `takes.length > 3`, put, `await tx.done`. No other async work inside the transaction. The UI reports "saved" only after `tx.done`.
- **Deleting the newest take** recomputes `updatedAt`; deleting the last take deletes the record.
- **Identity and order.** `splitArticle` ids are positional and shift on edits, so identity is the normalized text (`normalizeText`: trim, lowercase, collapse spaces), the same normalization as speech clips. Order and "open in reader" are always derived from the current `splitArticle(article.content)`: a record matches the first sentence whose normalized text equals its key. Identical sentences in one article share one record and open at the first occurrence. A record with no match is "original text changed" (playable, deletable, no reader link); a record whose article is missing is grouped under "article removed" (same, no link). No stored position.
- **Takes** under 0.5 s are discarded; a take stops at 60 s. Recorder bitrate is left to the browser; sizes are measured, not assumed. Example: opus at ~32 kbps is ~4 KB/s, so a 6 s take is ~24 KB and 3 takes × 500 sentences ≈ 36 MB. The real total is shown in Settings.
- **Retention vs backup.** Reference clips of recorded sentences are kept from trimming: `protectedTexts()` (retention) also returns those texts. The vocabulary audio backup must not grow because of this, so `exportProtectedAudio()` gets its own vocabulary-only selection instead of reusing `protectedTexts()`.
- **Storage persistence:** after the first committed take, call `navigator.storage.persist()` if not already persisted (best effort; browsers may still evict).
- **Module:** `src/storage/shadowing.ts` owns the store. Components never touch IndexedDB.

## Recording flow (article player)

The floating `ArticlePlayer` gets a **Shadow** toggle (pressed state, label in both locales). The mode choice is remembered in localStorage `relire_shadowing_mode`.

### States

```
           ┌────────────── Shadow off: today's behaviour ──────────────┐
listening(n) ──ended──► turn(n): acquiring mic ─► recording ─tap ■─► saving ─tx.done─► listening(n+1)
     ▲                     │            │                               │
     │                     │            ├ redo ──► discard, listening(n)│ save failed ──► unsaved(n): retry save | discard
     │                     │            ├ next ──► discard, listening(n+1)
     │                     │            ├ prev ──► discard, listening(n-1)
     │                     │            └ Escape / ✕ / Shadow off / leave reader / unmount ──► discard, end
     │                     └ permission denied ──► Shadow off, error on the player, listening continues paused at n
last sentence: turn(last) is recorded, then the sequence ends after the save.
```

- **Sequence changes** (`utils/speech/sequence.ts`): a new `turn` field in `SequenceState` (`null | {index}`), set instead of `playAt(index + 1)` when Shadow is on and the clip ended. While `turn` is set, prefetch does not run. `continueSequence(token, nextIndex)` and `cancelTurn(token)` are bound to the token that created the turn, so a late save or mic callback from a replaced turn does nothing. `stopSequence`, `stepSequence`, `toggleSequence` and the reader's Escape handler all end or replace the turn (Escape currently only calls `stopSpeech()`, which does nothing while recording; it must call `stopSequence()` when a sequence is active). During a turn the play/pause button becomes stop-recording; the other controls are redo, prev, next and close.
- **Shadow toggled on mid-sentence** applies from the end of the current sentence. **Toggled off during a turn** discards the take and stops after that sentence.
- **Microphone lifecycle:** the stream is acquired when Shadow is switched on (so the permission prompt appears once, not mid-sequence), kept across turns, and released when Shadow is switched off, the sequence ends, the reader unmounts, or the page is hidden for more than a minute. Each take is a new `MediaRecorder` on the shared stream.
- **Exclusive capture and playback.** Starting a Shadow turn calls `stopSpeech()`; starting any speech (another speak button) ends the sequence through the existing `interrupted` path, which discards an active take. The sentence drawer and Practice recorders may not start while a Shadow session holds the microphone: they show "Shadow mode is using the microphone" with a stop action (and vice versa).
- **Player display** (on the player only, fixed size): "Listen" → "Your turn · 0:03" with a stop button → "Saving…" → "Saved" (brief) or the real error with Retry/Discard. `aria-live` announces phase changes and errors, not timer ticks. Focus stays on the player's primary button across phases.

### Recorder

`FrenchAudioRecorder` today opens and closes the stream inside `start()`/`stop()`, returns a boolean from `start()` and always produces base64. It is split into:

- a **stream session**: `acquire()` (throws the real `DOMException` name/message), `release()` (idempotent);
- a **take**: `startTake(stream)`, `stopTake()` → `{blob, mimeType, durationMs}` resolved after the final `dataavailable`, `cancelTake()`; handles the recorder's own `error` and a track ending unexpectedly (device unplugged) as a failed take.

`useShadowingRecorder` (drawer/Practice assessment) keeps its behaviour through a thin wrapper (acquire + one take + release + base64), so existing cleanup guarantees stay. A new `hooks/useShadowSession.ts` owns the Shadow session for the reader. MIME is whatever the browser picks from the existing preference list (Safari 18.4+ also records WebM/Opus); the stored `mimeType` is the recorder's actual value. Real iOS/Safari is checked by hand: repeated takes, interruption by a call/lock screen, playback after reload.

## Review: My study → Shadowing

Desktop (≥ md): one table per article, rows in current article order.

```
 Shadowing                                               [Article ▾]
 Le Petit Prince · 12 sentences recorded
 ┌──────────────────────────────────┬────────┬────────────────────────────┐
 │ Text                             │ Ref.   │ My recordings              │
 ├──────────────────────────────────┼────────┼────────────────────────────┤
 │ Lorsque j'avais six ans…         │   ▶    │ ▶ latest · 12 Oct  ⇄  3 ▾ │
 │   ▶ 12 Oct 21:04 · 0:05  Delete                                       │
 │   ▶ 11 Oct 20:40 · 0:06  Delete                                       │
 │   ▶ 09 Oct 19:12 · 0:07  Delete                                       │
 │ Ça représentait un serpent…      │   ▶    │ ▶ latest · 12 Oct  ⇄  1   │
 └──────────────────────────────────┴────────┴────────────────────────────┘
   Original text changed (2) ▸      Article removed (1) ▸
```

- **⇄ Compare** plays the reference, then the latest take (echo order).
- **Playback goes through `playback.ts`.** Take playback is added to the same request-id machinery and state: the state's key identifies a take (`take:<id>`) separately from reference text, so a reference button and a take button never both show "playing". Comparison is a two-step chain with its own request id: any other play, Escape or unmount cancels the second step. The drawer's independent `<audio>` element is not reused.
- Rows show the current voice for the reference ("Reference: current voice, <voice name>") once above the table, not only in a tooltip, because takes recorded under another voice are compared with today's voice.
- Expanding a row lists its takes (time, duration, play, delete). The text cell opens the article in the reader scrolled to that sentence (no link for orphans).
- Phone (< md): each row is a card (text, then ▶ ref · ▶ mine · ⇄ · count, all 40 px targets). No horizontal scroll at 360 px.
- States: loading shows a placeholder of fixed height; a read error shows the real error, never "no recordings"; empty shows what to do next ("Turn on Shadow in the article player"). No sample data.

## Settings, backup and deletion

- **Data section:** "Shadowing: N sentences, M recordings, X MB" and **Delete all recordings** (confirm).
- **Export:** checkbox "Include shadowing recordings" (off by default). Each take is written with `mimeType`, `durationMs`, `recordedAt`, `id` and base64 data under a `shadowing` key.
- **Import** (`importData` today writes stores one by one and only checks outer shapes; recordings get stricter handling):
  1. Validate and decode everything first: record keys recomputed from `articleId` + text, ≤ 3 takes, unique ids, positive durations, known MIME prefix (`audio/`), base64 decodes to the stated MIME (`base64ToBlob` defaults to WAV, so the MIME is passed explicitly), bytes recomputed.
  2. Then replace in **one** transaction over the stores being restored.
  3. `shadowing` key **absent** → existing recordings kept (a backup without recordings never wipes a learner's voice). **`[]`** → recordings cleared. **Malformed** → the whole import is rejected with the reason; nothing changes.
  4. Recordings whose article is missing after import appear under "article removed".
- **Deleting an article** deletes the article and its recordings in one `articles`+`shadowing` transaction, then updates React state. This does not go through the generic `saveArticles()` sync (which also runs on restore, where orphans must survive). A take whose save completes after its article was deleted is dropped (the save checks the article still exists inside its transaction).

## IndexedDB upgrade

`openDB` gets `blocked` and `blocking` handlers: an old tab holding version 3 is asked to close its connection (`blocking` → `db.close()` and a "Relire was updated, reload this tab" notice); the new tab shows "Close other Relire tabs to finish updating" instead of waiting silently. The app is not released yet, but the upgrade path is still tested (fresh install and v3 → v4 with existing data).

## Module responsibilities

| Module | Owns |
| --- | --- |
| `storage/shadowing.ts` | Store, FIFO, queries, stats, backup (de)serialization and validation |
| `storage/db.ts` | v4 upgrade, blocked/blocking handling, atomic article+recordings delete, transactional import |
| `utils/speech/recorder.ts` | Stream session and per-take recording |
| `utils/speech/sequence.ts` | `turn` state, token-bound `continueSequence` / `cancelTurn` |
| `utils/speech/playback.ts` | Take playback and comparison chain in the shared request-id/state machinery |
| `hooks/useShadowSession.ts` | Reader's Shadow session: mic, turns, save, errors, cleanup |
| `hooks/useShadowingLog.ts` | Loading records, ordering against current article text, orphan groups |
| `components/ArticlePlayer.tsx` | Shadow toggle and turn controls (display only) |
| `components/study/StudyView.tsx` | My study shell with Words / Shadowing sub-tabs |
| `components/study/ShadowingLog.tsx` | Table / cards |

## Verification

Checks: lint, i18n, build, `impeccable detect`, `bun run e2e`.

Test infrastructure first:
- **Instrumented playback.** Fixtures add an init script that records `HTMLAudioElement.play/pause` calls with their source key in order, because cached clips make no network request and audio elements are detached. Assertions use that log, not TTS request counts.
- **Fake microphone scoped to recording specs** (`--use-fake-device-for-media-stream` and the microphone permission via `test.use`), and an explicit permission-denied context for the denial spec.
- **Layout stability vs follow-scrolling:** the reader scrolls to the current sentence on purpose; layout checks compare element geometry relative to the article, not scroll position.

Acceptance (e2e unless noted):
1. Shadow on: sentence plays → turn starts → stop → "Saved" only after commit → next sentence plays; the article layout does not change.
2. Redo replays the same sentence; next/prev discard; Escape, ✕, Shadow off and leaving the reader discard and release the microphone (track `readyState === 'ended'`).
3. The last sentence's turn is recorded, then the sequence ends.
4. A fourth take leaves three, oldest removed; two saves racing on one sentence still leave ≤ 3.
5. Takes under 0.5 s are not saved; a take stops at 60 s (clock mocked).
6. A save failure (store write forced to fail) shows the error with Retry/Discard and no "Saved".
7. Permission denied: Shadow turns off with the real reason; listening still works.
8. Starting another speak button during a turn ends the sequence and discards the take; the drawer recorder refuses to start while Shadow holds the mic.
9. The log lists rows in current article order; ref, take and compare play in the right order (playback log); interrupting compare cancels its second step; delete removes a take, then the row.
10. Editing a sentence moves its row to "original text changed"; deleting the article removes its recordings; restoring a backup without the article shows "article removed".
11. Backup with recordings round-trips (MIME preserved); without the `shadowing` key keeps existing ones; `[]` clears; a corrupt take rejects the whole import and changes nothing.
12. v3 → v4 upgrade keeps existing articles, vocab, stats, cache and audio.
13. No assessment request and no stats change in any of the above.
14. 360 px: player in every phase (including errors) and log cards fit without horizontal overflow; keyboard-only run of a Shadow turn; three themes screenshot-checked.
15. Manual, real devices: iOS/Safari and desktop Safari repeated takes and playback; Chrome on Android.

## Risks

- **Safari/iOS:** recording rules and interruptions differ; fake Chrome media proves nothing there. Manual check before release.
- **Storage pressure:** recordings are not trimmed; Settings shows their size and offers deletion; persistence is requested but not guaranteed.
- **Reference voice drift:** comparisons use the current voice; stated in the UI.

## Review log

GPT (Codex CLI, read-only) reviewed the first draft against the code. Accepted and folded in: token-bound recording turns and Escape/step/toggle behaviour; transactional, validated import with absent/empty/malformed semantics and MIME preservation; atomic article+recordings delete separate from restore; full Shadow state machine (prev/next/redo/off/permission/save failure/last sentence); exclusive playback and capture through `playback.ts`; recorder split into stream session and takes; honest blob-read statement; order derived from current text, orphan groups, `updatedAt` recompute; v4 upgrade with blocked/blocking handling; honest cost note; backup selection separated from retention; measured sizes instead of a 50 MB "worst case"; playback instrumentation and scoped fake media in tests; keep the internal `vocab` id; defer reader mic marks and recent sort. Answers adopted: one record per sentence; next during a turn discards and plays the next reference; compare in reference→take order.

## Open decision

**Recording from the sentence pill.** The pill appears on hover and is sized for 28 px buttons over the text; a reliable record control there needs a frozen target, a reachable stop button and 40 px touch targets without covering lines. Options:
- **A (recommended):** no record button on the pill in v1. Instead, the pill's play button starts the article player from that sentence (with Shadow, if on), so "practise from here" uses the one recording path.
- **B:** a record button on the pill, with the extra geometry and focus work.
