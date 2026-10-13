# Shadowing log: design

Status: proposal on `feat/shadowing-log`. Revised after a first GPT (Codex) review, redesigned with the user around a record button and a practice card, then revised after a second review. Nothing implemented yet.

## Problem

The learner listens to an article sentence by sentence and wants to repeat each sentence right after hearing it, keep the recording, and come back later to compare their own reading with the reference. Today:

- Shadowing only exists inside the sentence drawer (after an AI sentence analysis) and in Practice. Listening happens in the reader's article player, so "hear" and "repeat" live in different places.
- Recordings are never kept: `useShadowingRecorder` holds one object URL and drops it when the sentence or screen changes. Only `{date, text, score}` survives in `UserStats.pronunciationHistory`.

Goal: **practise any sentence where the reading happens — listen, record, listen back, record again — keep the recordings, and review every sentence as a row of "text | reference audio | my recordings".**

## Decisions (made with the user)

| Topic | Decision |
| --- | --- |
| Shadowing style | Listen to the whole sentence, then repeat it (echo). Playback is always stopped while recording, so speakers are fine. |
| Recordings kept | 3 per sentence, first in first out. No pinning in v1. |
| Scoring | Not in v1. Later: a Settings switch to enable scoring and an option to score every take automatically. The new card and log make no assessment call and do not change stats; the existing drawer and Practice scoring are unchanged. |
| Where the log lives | The Vocabulary tab is labelled **My study** and gets two sub-tabs, **Words** (today's vocabulary, unchanged) and **Shadowing**. The last sub-tab is remembered. The top bar keeps four tabs; the internal tab id stays `vocab` (the due-count badges depend on it). |
| Entry point | A record button (●) in the sentence action pill, beside play and analyse. Recording is always started by the learner, sentence by sentence, so a sentence can be repeated as often as wanted. |
| Where recording happens | A closable **practice card** docked at the bottom of the screen (an overlay like the article player). It holds the sentence, reference playback, record/stop with a live input level, the sentence's takes with play/compare/delete, and a hint line; later the score and static waveforms. |
| No automatic mode in v1 | The article player's automatic "record after each sentence" mode is deferred; it can reuse the same recorder and storage later. |
| Pause | No pause while recording: a sentence is a few seconds long. Instead, **Redo** discards the current take and starts again. |
| Pressing ● | Opens the card on that sentence and starts recording immediately (the learner has usually just listened). |
| Stopping a recording | Tap to stop. Automatic silence detection is a possible later setting. |
| Card lifetime | Closed with ✕ or Escape; closes automatically when leaving the reader or switching article. A running take is discarded on close. |
| Backups | Recordings are optional in backups (off by default). |
| Edited or deleted text | Recordings are never silently lost: a sentence whose text no longer appears in its article is shown as "original text changed"; deleting an article deletes its recordings in the same action, and the dialog says so. |

## Scope

Building: the ● button in the sentence pill; the practice card (record/stop/redo, live input level, reference, takes with play/compare/delete, hint); local storage with the 3-take limit; the Shadowing sub-tab with reference playback, take playback, reference→take comparison, take deletion and "open in reader"; Settings storage line and delete-all; optional backup; e2e specs.

Not building in v1: scoring or any assessment call; the player's automatic shadow mode; static waveforms of takes and reference (they need audio decoding and come with scoring); a mark on recorded sentences in the reader; a "recent" sort; pitch display; simultaneous shadowing; automatic stop; sharing single recordings; sync.

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

## Recording flow: sentence pill and practice card

### Entry

The sentence action pill (play, analyse) gets a third button, **●** (label "Practise this sentence"). The pill holds no recording state; everything lives in the card.

- **Pointer:** today's pill (28 px buttons, measured as 71×38, centred on the sentence's last line) grows to three buttons; its measured geometry is updated.
- **Touch:** three 40 px buttons make a ~50 px pill, taller than the smallest line pitch (≈31 px), so centring it on a line would cover text. On touch the pill is placed in clear space: below the sentence's last line when the next line has room in the gap, otherwise above its first line, otherwise docked at the paragraph's end. Placement is collision-checked against the neighbouring line boxes at every font size.
  - **Implemented deviation (v1):** on touch the pill keeps today's geometry (compact buttons at the sentence end) with ● added, because no clear-space placement worked for a 50 px pill at every font size. Proposed follow-up: on touch screens, show the selected sentence's actions in the bottom dock instead of a floating pill.
- **Keyboard:** focusing a sentence (its first word, or the sentence itself, which becomes focusable) reveals and pins its pill; Tab moves into it. The pill stays pinned while focus is inside it, and is the return target when the card closes.

Pressing ● opens the card for that sentence and starts a take at once. ● on another sentence while the card is open switches it, but only from `ready`; in `acquiring`, `recording`, `saving` or `unsaved` the pill's ● is disabled with "Finish the current recording first".

### The card

Docked at the bottom (fixed overlay, `max-w-md`, safe-area aware). It never changes the article's layout.

```
┌────────────────────────────────────────────────┐
│ Lorsque j'avais six ans, j'ai vu…        ▾  ✕  │  sentence: 2 lines, ▾ expands the full text in place
│                                                │
│  [▶ Reference]   [● Record]                    │  recording: [■ Stop 0:04] [↺ Redo]  ▁▃▅▃▂▆▃ input level
│                                                │
│  Latest: ▶ 21:04 · 0:05   ⇄ Compare            │  latest take only; empty until the first take
│  All recordings (3) →                          │  opens the log at this sentence
│                                                │
│  Listen to the reference, then read it aloud.  │  hint / error line; later: score
└────────────────────────────────────────────────┘
```

- **Only the latest take** is in the card (play, compare). History (all three, delete) is managed in the log; this keeps the dock short and the focus order simple.
- **Stable, not fixed, height:** each region has a minimum height so phase changes (idle → recording → saving → saved) swap content without resizing in the common case. Long translations, an expanded sentence, Retry/Discard or a long error may wrap: controls are `flex-wrap` slots (overriding the button's `whitespace-nowrap` where needed), and the hint/error region scrolls inside a bounded height. The card is at most `min(45vh, 22rem)` tall and scrolls internally beyond that, including short landscape viewports.
- **Input level:** an `AnalyserNode` on the live stream draws a small level bar while recording (decorative, `aria-hidden`), showing that the microphone hears the learner. Released with the stream.
- **Compare** plays the reference, then the latest take.

### Dock stack

The card and the article player share one bottom **dock** (a single fixed container: card above player when both are visible). The dock publishes its measured height (ResizeObserver) as a CSS variable; the reader uses it for bottom clearance at the article end and for follow/focus scrolling (today a fixed 112 px), so the sentence being practised or read is never under the dock.

### States (one card, one sentence at a time)

```
closed ─● on s─► acquiring(s) ─granted─► recording(s) ─■─► saving(s) ─tx.done─► ready(s)
                   │ denied/error ─────────────────────────────────────────────► ready(s) + error
                   │ ✕/Esc/leave/sheet opens ─► cancel acquisition, closed
recording(s): ↺ redo ─► discard, recording(s) on the same stream
              ✕/Esc/leave/sheet opens/external playback ─► discard, release, closed (or ready(s) for playback)
              60 s reached ─► as ■;  < 0.5 s on ■ ─► discard, ready(s) + "Too short"
              device/recorder error ─► discard, release, ready(s) + error
saving(s):    ✕/Esc/leave ─► the save still completes (Stop authorised it, target fixed); UI closes, no late UI update
              failed ─► unsaved(s)
unsaved(s):   Retry save | Discard; ✕/Esc keeps nothing but asks first ("Discard unsaved recording?")
ready(s):     ▶ reference · ● record again · ▶/⇄ latest · ● on another sentence ─► acquiring(s')
```

- **Capture lock with an owner token.** One module-level lock in `utils/speech/recorder.ts` is reserved **before** awaiting `getUserMedia`, so a pending permission prompt already owns capture: repeated ● presses, the drawer recorder and Practice cannot start a second acquisition. Cancelling (close, sheet, external playback) releases the lock synchronously; if permission is granted after cancellation, the stale stream is stopped immediately and ignored. A pending prompt may never resolve; closing the card is always possible.
- **Microphone lifetime:** acquired on ● (the browser remembers the permission), kept through Redo, released when a take ends (saved, discarded or failed), on close and on unmount, so the mic indicator is never on while the learner is only listening.
- **Article listening is suspended, not ended.** Starting a take must not call `stopSpeech()` while a sequence is playing, because its `interrupted` outcome ends the sequence (`sequence.ts` `onSettled`). Instead, `sequence.ts` gets `suspendSequence()`: pause the current clip (`pauseSpeech`), mark the sequence suspended (invalidating pending prefetch via its token check), keep `index`. The player shows paused; its play button resumes the current sentence from where it paused (`resumeSpeech`). Playing audio **from the card** (reference, latest, compare) is a new speech request and therefore ends the sequence, as any other speak button does today; the player then disappears. This is stated in the card's hint the first time it happens.
- **External playback during a take:** a speak button elsewhere first cancels the take synchronously (the speak path calls the card's cancel before `speakFrench`, not a later React effect), then plays.
- **Card playback ownership:** the card's reference/latest/compare requests carry the card session id; closing or switching the card stops them immediately and cancels compare's second step.
- **Escape has one owner, outermost first:** an open sheet or menu (it already has its own listener) → the card → speech. The reader's handler and the sheet's handler both check the topmost layer; while a sheet is open the card ignores Escape.
- **Sentence sheet (analyse) and the card:** opening a lookup sheet cancels a take in `acquiring`/`recording` (the sheet's scrim would cover it) and leaves a `ready` card in place underneath. The sheet's close no longer stops speech it did not start.
- **Late work:** permission, final `dataavailable` and UI updates after a save carry the card session id (bumped on close, switch, Redo or cancel). A committed save cannot be aborted (`tx.done`); the target sentence and article are fixed when Stop is pressed, and the save checks inside its transaction that the article still exists.
- **Focus and announcements:** opening moves focus to the card's close button during `acquiring` (always enabled) and to Stop once recording; a late permission result never moves focus if the learner has moved it. Tab moves through the card and back to the article; closing returns focus to the pill's ● (pinned) or the sentence. `aria-live` on the hint line announces phase changes and errors, not timer ticks. The card is a non-modal region labelled with the sentence.

### Recorder

`FrenchAudioRecorder` today opens and closes the stream inside `start()`/`stop()`, returns a boolean from `start()` and always produces base64. It is split into:

- a **stream session**: `acquire()` (throws the real `DOMException` name/message), `release()` (idempotent), plus the capture lock;
- a **take**: `startTake(stream)`, `stopTake()` → `{blob, mimeType, durationMs}` resolved after the final `dataavailable`, `cancelTake()`; handles the recorder's own `error` and a track ending unexpectedly (device unplugged) as a failed take.

`useShadowingRecorder` (drawer/Practice assessment) keeps its behaviour through a thin wrapper (acquire + one take + release + base64), so its cleanup guarantees stay. A new `hooks/usePracticeCard.ts` owns the card's session. MIME is whatever the browser picks from the existing preference list (Safari 18.4+ also records WebM/Opus); the stored `mimeType` is the recorder's actual value. Real iOS/Safari is checked by hand: repeated takes, interruption by a call/lock screen, playback after reload.

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
- States: loading shows a placeholder of fixed height; a read error shows the real error, never "no recordings"; empty shows what to do next ("Press ● next to a sentence in the reader to practise it"). No sample data.

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
| `utils/speech/recorder.ts` | Stream session, per-take recording, owner-token capture lock |
| `utils/speech/sequence.ts` | `suspendSequence()` keeping position for resume |
| `utils/speech/playback.ts` | Take playback and comparison chain in the shared request-id/state machinery |
| `hooks/usePracticeCard.ts` | The card's session: target sentence, mic, take, save, errors, cleanup |
| `hooks/useShadowingLog.ts` | Loading records, ordering against current article text, orphan groups |
| `components/reader/PracticeCard.tsx` | The card (display only) |
| `components/reader/BottomDock.tsx` | Shared fixed dock for the card and the player; publishes its height |
| `components/ReaderView.tsx` | ● in the sentence pill, opening/switching/closing the card, Escape order |
| `components/study/StudyView.tsx` | My study shell with Words / Shadowing sub-tabs |
| `components/study/ShadowingLog.tsx` | Table / cards |

## Verification

Checks: lint, i18n, build, `impeccable detect`, `bun run e2e`.

Test infrastructure first:
- **Instrumented playback.** Fixtures add an init script that records `HTMLAudioElement.play/pause` calls with their source key in order, because cached clips make no network request and audio elements are detached. Assertions use that log, not TTS request counts.
- **Fake microphone scoped to recording specs** (`--use-fake-device-for-media-stream` and the microphone permission via `test.use`), and an explicit permission-denied context for the denial spec.
- **Layout stability vs follow-scrolling:** the reader scrolls to the current sentence on purpose; layout checks compare element geometry relative to the article, not scroll position.

Acceptance (e2e unless noted):
1. ● on a sentence opens the card and records; ■ saves; "saved" appears only after commit; the latest take is shown; the article layout does not change; at 1280 px and 360 px the card's height is unchanged across idle/recording/saving/saved.
2. Redo discards and records again; ✕, Escape and leaving the reader discard a running take and release the microphone (track `readyState === 'ended'`); the mic is not live while the card is idle.
3. ● on another sentence switches the card in `ready`; it is refused in acquiring/recording/saving/unsaved; a second ● during a pending permission prompt does not start a second acquisition; closing during a pending prompt and then granting leaves no live track.
4. A fourth take leaves three, oldest removed; two saves racing on one sentence still leave ≤ 3.
5. Takes under 0.5 s are not saved; a take stops at 60 s (clock mocked).
6. A save failure (store write forced to fail) shows the error with Retry/Discard and no "saved".
7. Permission denied: the card shows the real reason; reference playback still works.
8. Reference, latest and compare play in the right order (playback log); compare's second step is cancelled by any other play, Escape or close; recording suspends a running article sequence and the player's play resumes the same sentence; playing from the card ends the sequence; a speak button elsewhere cancels a take before playing; the drawer recorder refuses to start while the card holds capture and vice versa; opening the analyse sheet cancels a take; Escape closes the sheet first, then the card, then speech; closing during saving still saves; closing in `unsaved` asks first.
9. The log lists rows in current article order; delete removes a take, then the row; "All recordings" opens the log filtered to the article.
10. Editing a sentence moves its row to "original text changed"; deleting the article removes its recordings; restoring a backup without the article shows "article removed".
11. Backup with recordings round-trips (MIME preserved); without the `shadowing` key keeps existing ones; `[]` clears; a corrupt take rejects the whole import and changes nothing.
12. v3 → v4 upgrade keeps existing articles, vocab, stats, cache and audio.
13. No assessment request and no stats change from the card or the log.
14. Touch at 360 px and every font size: the pill with three 40 px buttons does not overlap any line box; the dock never covers the practised or currently read sentence, including at the article end and in a 640×360 landscape viewport; card in every phase (including errors) and log cards fit without horizontal overflow; keyboard-only run (focus sentence → pill → ● → card → stop → compare → close, focus returned to ●); three themes screenshot-checked.
15. Manual, real devices: iOS/Safari and desktop Safari repeated takes and playback; Chrome on Android.

## Risks

- **Safari/iOS:** recording rules and interruptions differ; fake Chrome media proves nothing there. Manual check before release.
- **Storage pressure:** recordings are not trimmed; Settings shows their size and offers deletion; persistence is requested but not guaranteed.
- **Reference voice drift:** comparisons use the current voice; stated in the UI.

## Review log

GPT (Codex CLI, read-only) reviewed the first draft against the code. Accepted and folded in: token-bound recording turns and Escape/step/toggle behaviour; transactional, validated import with absent/empty/malformed semantics and MIME preservation; atomic article+recordings delete separate from restore; full Shadow state machine (prev/next/redo/off/permission/save failure/last sentence); exclusive playback and capture through `playback.ts`; recorder split into stream session and takes; honest blob-read statement; order derived from current text, orphan groups, `updatedAt` recompute; v4 upgrade with blocked/blocking handling; honest cost note; backup selection separated from retention; measured sizes instead of a 50 MB "worst case"; playback instrumentation and scoped fake media in tests; keep the internal `vocab` id; defer reader mic marks and recent sort. Answers adopted: one record per sentence; compare in reference→take order.

A second review of this redesign was folded in: owner-token capture lock reserved before permission, sequence suspension instead of `stopSpeech()`, save completion after close and `unsaved` exits, one Escape owner and sheet coexistence, a shared measured dock, stable-not-fixed card height with wrapping, collision-aware touch pill placement, keyboard reveal of the pill, and the card limited to the latest take.

Before that, with the user: recording starts from a ● in the sentence pill and happens in a docked practice card, so a sentence can be repeated at will; the player's automatic mode, and with it the sequence `turn` state machine, left v1. No pause (Redo instead); live input level in v1, static waveforms with scoring later; the card closes with the reader.
