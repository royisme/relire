# Real-content learning extension: technical design draft

Status: proposal for review, not an approved implementation plan.
Date: 2026-10-09.
Target: Relire. No functional code is changed by this document.

## 1. Recommendation and scope

Add a small media-processing backend while preserving Relire's local-first reader, vocabulary review, and bring-your-own-key (BYOK) model. The backend is justified by reliable media preparation, timestamped transcription, and jobs that continue after the browser closes. Basic reading, subtitles, playback, recording, and AI explanations can work without it.

Use one Bun HTTP service, SQLite for durable job records, and FFmpeg/ffprobe subprocesses for media preparation. Run this on a host/container with persistent disk. Keep the Vite PWA build and current frontend modules; do not migrate frameworks or introduce a separate cloud material library.

The initial backend serves one owner or one private installation. A public service serving unrelated users would need a separate ownership, authentication, quota, and billing design before launch. An instance access token is not a multi-user account system.

The screenshots establish a material library, multiple import entries, bilingual text beside video, sentence navigation, recording/replay, sentence analysis, copy, calibration, notes, and favorites. The exact meaning of orange word highlights, calibration, and the header counter cannot be established from images alone. Numeric pronunciation scores are an existing Relire feature, not evidence about the reference app.

Proposed meanings: calibration edits transcript text and timing; word highlighting distinguishes current selection from saved vocabulary; the header counter has no corresponding new requirement. Existing French-learning scope and English/Chinese explanations remain the first release. Additional learning languages are a separate capability expansion.

## 2. System boundaries

```text
Relire PWA
  Library / Import / Reader / Word detail / Sentence drawer / Shadowing
       |                              |
       | current services/api.ts      | media-job client
       v                              v
  Gemini + existing AI/audio cache    Bun API + SQLite job records
       |                                  |
       |                                  +-- FFmpeg / ffprobe
       |                                  +-- timestamped ASR
       |                                  +-- Gemini for long import pipelines
       v                                  |
  IndexedDB <--- validated transcript/result download ----------------+
  articles, vocab, meta, cache, audio + transcripts, assets, annotations
```

The browser owns the library, original local media, transcripts committed to materials, annotations, learning position, and vocabulary. The backend owns temporary processing files, job state, and downloadable job results. AI providers receive only the input needed for the user-triggered task.

Keep current short word/sentence analysis and TTS calls in the existing browser AI layer. A media import pipeline may use server-side ASR and translation so it can finish without the page. Local material edits and playback require no API requests.

## 3. Feature goals and design

### 3.1 Material library and continuation

- Goal: find a material, understand its processing/readiness state, and resume learning.
- UI: reuse `LibraryView`; add media type, thumbnail, optional duration, current position, and explicit completed state. Keep title search, existing level/category controls, edit, and delete. Date grouping is optional presentation, not a second storage model.
- Data: extend `Article` with source kind/language, asset reference, duration, updated time, and learning position. Keep the existing `content`, title, level, category, source, and created date for compatibility.
- Interaction: opening a material loads its transcript and referenced Blob on demand; the list never loads every video Blob. Closing saves position. Marking complete is explicit; playing to the end does not prove learning completion.
- API/resources: IndexedDB only for library operations. Delete related transcript and annotations transactionally; retain saved vocabulary with its context snapshot so deleting the source does not destroy the review deck.
- Acceptance: old articles still open; reopening a media material resumes the correct sentence/time; deleting one material does not delete another material's records.

### 3.2 Paste and manual text import

- Goal: turn user text into readable, sentence-addressable material.
- UI: one text editor reused for paste/manual input; title and source language are editable. Clipboard reads happen only after a user gesture, with manual paste available.
- Processing: normalize line endings and safe display text; segment by language using `Intl.Segmenter` where supported, with a tested fallback. Preserve paragraphs, punctuation, and offsets into the source text. Show a preview so abbreviations and punctuation can be corrected.
- Interaction: validate non-empty text, save the article and initial transcript in one transaction, then open the reader. Translation and TTS are separate user-triggered work and do not block saving.
- API/resources: no backend required; existing Gemini service for translation/analysis and existing speech service for synthesized reading.
- Acceptance: apostrophes, French accents, abbreviations, multiple paragraphs, and repeated identical sentences keep correct identity and ordering.

### 3.3 AI-generated material

- Goal: generate a material at a requested topic, language, level, and approximate length.
- UI: extend the import dialog with topic, CEFR level, and length; preview/edit before saving.
- Processing: add a task/template in `services/ai`, declared variables in the prompt registry, and both explanation-language templates. Validate title/body/language before offering the result.
- Interaction: user starts generation; the existing provider/key settings are used; only an accepted preview is stored. A failed call leaves the form and user inputs intact.
- API/resources: Gemini text generation. No extra account, search API, or backend is needed for this entry.
- Acceptance: missing key, invalid structured output, rate limit, and retry are visible; generated text is never fabricated as a fallback.

### 3.4 Local audio/video import with existing subtitles

- Goal: use original speech immediately when the learner already has a media file and SRT/VTT subtitles.
- UI: select a media file, optionally attach subtitles, inspect metadata/preview, then save. Initial tested formats are MP3/WAV/M4A audio and MP4/WebM video; the extension alone does not prove decoder support.
- Processing: inspect duration/decoding using native media APIs; parse SRT/VTT locally into raw cues; normalize cues into learning segments. Reject invalid or out-of-duration ranges and report the affected row. Subtitle HTML is rendered as text, never executed.
- Interaction: store the original Blob in a dedicated asset store; store cue/segment records separately; create object URLs when opening, revoke them when replaced/closed. Local playback never uploads the media.
- API/resources: `HTMLMediaElement`, File/Blob/object URL APIs, deterministic subtitle parsing. Backend normalization is offered only when a supported conversion is needed.
- Acceptance: the import survives reload, bilingual subtitles retain correct language separation, and rejected imports leave no partial material.

### 3.5 Local media without subtitles

- Goal: create an editable, timed transcript from user-owned audio/video.
- UI: show the upload/transcription steps and identify that media will be sent for processing; let the learner choose the speech language and start the task explicitly.
- Backend: stream the upload to a temporary file; ffprobe validates duration/streams; FFmpeg extracts a speech track while preserving original time. No trimming of leading silence without recording the resulting offset.
- ASR recommendation: use a dedicated timestamped transcription API, such as AssemblyAI, for word/segment timing. Preserve returned words and timing, derive sentence ranges, then optionally translate in batches with Gemini. This adds an ASR credential. A one-key Gemini alternative is an editable transcription draft with approximate timings and mandatory calibration for inaccurate boundaries, not a precision-equivalent replacement.
- Interaction: persist job/provider identifiers before advancing; browser polls status and downloads a completed result; validate the result before committing it to the local article. Opening the page again can retrieve a result completed while it was closed.
- Acceptance: closing the page does not cancel a running server job; provider failure does not discard the original local material; retries reuse an existing external job where possible.

AssemblyAI documents [timestamped words](https://support.assemblyai.com/articles/6819078983-does-your-api-return-timestamps-for-individual-words) and [sentence results](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/get-sentences). These establish API shape, not accuracy on the learner's media.

### 3.6 YouTube import and playback

- Goal: import an eligible YouTube source and use its original player beside a transcript.
- UI: paste a URL or open the provider-specific import entry; parse the video ID; show separate choices for playback with supplied subtitles and AI transcription of an eligible public URL.
- Playback: use the official IFrame Player API for play/pause, seek, current time, duration, and available rates. Poll the actual player clock while playing; tolerate unavailable embedding, playback errors, and user-gesture restrictions.
- Transcript paths: user-supplied SRT/VTT; captions for a video the authenticated user can edit; or Gemini transcription of a supported public YouTube URL. URL-based AI processing is a new transcript, not a download of the creator's caption track.
- Data: retain video ID, source URL, title, transcript revision, and timestamps. Do not copy a YouTube video into the local asset store by default.
- Backend role: durable URL-transcription jobs and result validation. It cannot grant caption permission or control an unavailable player.
- Acceptance: inaccessible/unsupported videos offer supplied subtitles or local media import; no promise of arbitrary public-caption download or offline YouTube playback.

The [IFrame API](https://developers.google.com/youtube/iframe_api_reference) exposes playback controls. [Caption download](https://developers.google.com/youtube/v3/docs/captions/download) requires video edit permission. Gemini documents [public YouTube URL input](https://ai.google.dev/gemini-api/docs/video-understanding); availability must be tested with the configured model and actual videos.

### 3.7 Bilibili import and playback

- Goal: provide the platform entry without claiming unsupported synchronization.
- Verified boundary: the [official external player documentation](https://player.bilibili.com/) describes video identifiers, embedding, and an initial time parameter. This review did not establish a supported JavaScript clock/seek interface equivalent to YouTube's.
- Initial behavior: embed the source alongside supplied/imported text; offer manual text study and synthesized sentence reading. Do not show original-audio sentence loops or synchronized highlighting unless the player clock/control capability is verified.
- Full original-audio learning path: user-supplied local media plus subtitles/transcription. A platform-authorized media/caption API can replace this path when available.
- Backend boundary: a backend alone cannot overcome cross-origin player isolation or create platform permission. Undocumented scraping/downloader maintenance is not part of the recommended baseline.
- Acceptance: unsupported synchronized controls are clearly unavailable; the text and independent sentence practice remain useful.

### 3.8 Transcript segmentation and calibration

- Goal: create learning sentences that correspond to actual speech, with recoverable corrections.
- Data: retain raw subtitle/ASR cues separately from learning segments. A segment references contributing cue IDs; timing is stored as integer milliseconds. Cues can overlap; ambiguous learning boundaries are flagged for review instead of silently treated as precise.
- Deterministic processing: use source-language segmentation and provider word times; never invent timing by dividing duration by character count. Preserve pauses and speaker turns where available.
- Calibration: edit text, move an individual start/end, shift a whole transcript, merge/split segments, and preview the affected audio. The global offset is separate from raw timing so it can be reset.
- Identity: a text/timing edit preserves the segment ID. Split/merge creates new IDs and records the relationship to the replaced segments. Annotations keep a text snapshot and are marked for review when their target is replaced; never silently reattach by list index.
- Interaction: commit a complete revision atomically. Late AI responses carry their starting revision; a changed material prevents them from overwriting newer local corrections.
- Acceptance: edits cannot produce a negative/inverted range; bookmarks and notes survive reorder and ordinary edits; split/merge cannot attach a note to an unrelated sentence.

### 3.9 Bilingual reader and word interactions

- Goal: understand original content while retaining orientation in the material.
- UI: adapt `ReaderView` to persistent segment IDs; desktop uses media/text columns, mobile uses media above text. Original-only/bilingual display, font size, theme, and follow-playback are reader settings. Preserve the existing word detail and sentence sheet.
- State: `activeSegmentId` follows playback; `selectedSegmentId` follows user selection. A selected note or explanation must not disappear when playback moves to another sentence. Manual scrolling suspends automatic following until the learner resumes it.
- Word selection: preserve apostrophes, accents, and multiword selections; identify the clicked occurrence by offsets, not just the word string. Existing vocabulary saves continue to use their explanation/context snapshots.
- Actions: copy sentence or bilingual text; open word explanation, sentence analysis, shadowing, calibration, notes, or favorites. Use Relire tokens instead of copying the reference app's orange/blue palette.
- API/resources: local transcript/annotations; existing word analysis API; clipboard under a user gesture with an accessible failure path.
- Acceptance: controls work by touch and keyboard; selected and playing sentences remain distinguishable; opening an overlay does not lose position.

### 3.10 Playback and sentence navigation

- Goal: reliably control the appropriate audio source for the current material.
- Sources: native local media, YouTube player, or existing TTS clips. Introduce only the small shared playback operations the UI actually needs; do not invent a universal plugin framework.
- Controls: play/pause, available speed, progress seek, previous/next learning segment, repeat segment, and stop after segment. Native media uses its actual clock; while playing, frame-based checks handle sentence endings and `timeupdate` updates general progress. YouTube needs bounded clock polling and its supported seek/rate methods.
- Source arbitration: original playback, TTS, recording, and learner replay are mutually exclusive. Starting one stops the others. A request ID prevents a late generated clip from starting after stop/switch.
- Text-only materials: play one TTS clip per segment, show sentence position and clip progress. Do not fabricate a continuous full-material time axis before clip durations are known.
- Acceptance: previous/next use sentence order, not fixed seconds; no two audio sources play together; loop/seek tolerance is measured per platform and disclosed when precise boundaries cannot be achieved.

### 3.11 Translation

- Goal: show a translation for each segment in the learner's explanation language.
- API contract: batches contain segment IDs and original text; output contains matching IDs and translations. Validate missing/duplicate IDs and preserve source text. Retrying failed rows must not rerun completed rows.
- Processing: reuse the Gemini layer and prompt-template conventions. Store committed translations in the transcript; generated translations are learning data, not only disposable cache entries. Language switching selects the matching translation or exposes a generate action.
- Cache: introduce a translation-specific key with source language, target language, prompt fingerprint, and normalized source text. Preserve existing word/sentence cache behavior; changing its context/provider/model policy is outside this proposal.
- Acceptance: a partially translated material stays readable; untranslated rows never masquerade as successfully translated; changed text invalidates its translation.

### 3.12 AI sentence close reading

- Goal: explain structure, vocabulary/collocations, and grammar without hiding the material.
- UI: reuse `SentenceDrawer` with clear sections for structure, lexical interpretation, grammar, translation, and shadowing. The practice action enters the selected segment's recorder.
- Service: reuse `fetchSentenceAnalysis`/`fetchWordAnalysis`; add required structured fields only when existing types cannot express the reference's content. Both prompt languages and validators change together. Missing/invalid output is an error, not a synthetic explanation.
- Source context: supply surrounding text within the existing bounded article context. Preserve the current cache rule: explanation language + prompt fingerprint + normalized text, without adding provider/model/article context to existing keys.
- Acceptance: a cached result needs no second call; editing prompts causes a cache miss; failures can retry while the original text remains usable.

### 3.13 Shadowing, recordings, and feedback

- Goal: listen to a sentence, say it, replay, retry, and continue to the next sentence.
- UI: reuse `ShadowingRecorder`, `useShadowingRecorder`, and `AssessmentResult`. Add original-segment reference playback and next-segment navigation; synthesized reading remains an explicit alternative.
- State sequence: ready, listening, recording, recorded, assessing, result/error. Request microphone permission on record. Check supported recording MIME types; stop tracks, recognition, playback, and object URLs on exit/segment change.
- Persistence: keep recording Blobs transient as in the existing flow. Persist a completed attempt's real summary/reference, not the audio. Recording archives would be a separate requested storage feature.
- Feedback: reuse existing audio-capable Gemini assessment. An estimate is not an official TCF or phonetic measurement. If only a text transcript was assessed, disclose that limitation rather than presenting it as audio pronunciation evidence.
- Acceptance: denied permission and unsupported MIME leave listening available; switching segments releases the microphone; starting assessment does not upload a different or stale segment's recording.

[Microphone access](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) requires a secure context and permission; [recording type support](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static) must be checked at runtime.

### 3.14 Notes, favorites, vocabulary, and learning progress

- Goal: retain useful learning results and return to their original context.
- Notes/favorites: local annotation records refer to article/segment ID and keep a text snapshot. Copying a sentence does not create a record. Saving a word reuses `vocab` and FSRS-6; favorite sentences are distinct from word review cards.
- Progress: save last segment, actual media position, completed state, and recorded practice events. Save after meaningful interactions and periodically during playback, not once per animation frame. Store no invented mastery percentage based on watch time.
- Review: reuse the current word review deck. A new sentence SRS algorithm is not required by the screenshots; favorite sentences initially reopen the original learning location.
- Acceptance: metadata survives reload/offline use; unrelated article deletion cannot erase saved word learning; reviewed/replaced segments remain identifiable.

### 3.15 Settings, multi-language support, offline, and backup

- Settings: retain provider/model/voice settings; add backend URL/connection check and optional ASR credential. Keep app language, explanation language, and source language conceptually separate. Do not make a backend access token double as an AI provider key.
- First release: French learning with English/Chinese explanations; new learning languages require audited segmentation, prompts, voices, and assessment capabilities. Existing French TTS style and phonetics must not silently serve another language.
- Offline: local media, original text, committed translations, notes, vocabulary review, and cached speech/analysis work without a server. New AI generation, remote sources, and processing jobs need connectivity. Service workers must not cache credential-bearing requests/results indiscriminately.
- Backup: extend existing export/import to include new learning records. Export a versioned JSON manifest; original media is optional and supplied as separate files, verified by IDs/digests on restore. Do not place large original files into a base64 JSON backup by default. Derived AI caches remain excluded and API keys/access tokens are always excluded.
- Storage: original media is user data in a dedicated store and never subject to the existing 200 MB disposable-speech LRU policy. Surface storage usage and deletion choices. Persistence requests can be declined by the browser; backups remain necessary.
- Acceptance: restoring an old backup still works; malformed backup validation completes before replacing data; missing media can be reattached without deleting the transcript and notes.

## 4. Local data model

Keep the five existing stores. Add only `transcripts`, `assets`, and `annotations`; small import/attempt references can live under named `meta` keys.

| Entity/store | Important fields | Ownership and lifetime |
| --- | --- | --- |
| Article / `articles` | Existing fields; source kind/language, source identifier, asset ID, duration, learning position, completion and updated time | Browser, until deletion; retain existing article compatibility |
| Transcript / `transcripts` | Article ID, revision, raw cues, learning segments, global timing offset, transcription source | Browser, backed up; fetched only for opened material |
| Learning segment | Stable ID, order, paragraph, original text, character offsets, cue IDs, optional start/end ms, translations, replaced IDs | Within transcript; no milliseconds for untimed text |
| Asset / `assets` | ID, Blob, original filename, MIME, bytes, digest, optional thumbnail | Browser original media; loaded on demand, never generic cache eviction |
| Annotation / `annotations` | ID, article/segment ID, kind (note/favorite), body, text snapshot, target revision, needs-review state | Browser, backed up |
| Vocab / existing `vocab` | Existing word, context, explanation, and SRS fields | Existing review behavior retained |
| Progress / Article and `meta` | Last segment/time, explicit completion, real attempt summary | Browser; no recorded audio required |
| Job / server SQLite | ID, owner/instance identity, input digest, task/version, base revision, provider job ID, state/stage, result/error, timestamps, expiry | Backend processing record; never credentials |
| Temporary asset / server disk | Server-generated ID/path, bytes/MIME, job linkage, expiry | Backend only for processing; not the user's permanent media library |

Bump the current IndexedDB version from 3 with an additive upgrade. Existing text articles default to French/text and gain a transcript lazily when first opened. Do not destructively rewrite all stored articles at startup. Local transcript/annotation changes use transactions and revision checks; a backend result is validated/staged before commit.

## 5. Data interaction flows

### A. Text with sentence analysis

User submits text -> local validation/segmentation -> article and transcript commit -> reader selects segment -> existing analysis service checks cache -> Gemini only on miss -> validated result -> existing cache -> sentence sheet. The original material remains readable when AI fails.

### B. Media with supplied subtitles

User selects File + SRT/VTT -> local media/cue validation -> asset, article, and transcript commit -> reader creates object URL -> player clock selects active segment -> notes/progress update local storage. No backend upload or ASR charge occurs.

### C. Media with transcription

Browser stores source locally -> uploads processing copy -> creates idempotent job -> backend extracts audio -> submits timestamped ASR -> stores provider job ID -> obtains/validates transcript -> optional batched translation -> stores result -> browser downloads it -> checks article base revision -> commits local transcript -> acknowledges result -> backend removes temporary input and later result.

If the user changes the article while a job runs, return a staged result instead of overwriting corrections. If the browser closes, server processing continues. Reopening uses a locally saved job ID to retrieve status/result.

### D. Shadowing

Select segment -> stop other audio -> play original range/TTS -> user records -> stop tracks -> learner replays -> optional assessment through existing API -> store real attempt summary -> select next segment. A recorded Blob is not sent unless the user requests feedback.

## 6. API proposal

These are proposed endpoints for the new backend, not currently existing Relire endpoints. Local library CRUD, annotations, and progress stay in IndexedDB.

| Endpoint | Input | Result and behavior |
| --- | --- | --- |
| `GET /api/v1/capabilities` | Instance authorization | Available processing tasks/providers, upload/duration limits; no key values |
| `POST /api/v1/assets` | Streaming media upload, declared MIME/filename | Validated temporary asset ID, digest, duration and expiry; rejects unsupported/oversized input |
| `DELETE /api/v1/assets/:id` | Authorized temporary asset ID | Deletes unreferenced upload; cannot delete another owner's input |
| `POST /api/v1/jobs` | Client request ID, task, temporary asset ID or eligible source URL, source/target languages, base revision, selected provider and credential | Returns `202`, job ID and state; duplicate request does not submit a second paid task |
| `GET /api/v1/jobs/:id` | Authorized job ID | State/stage, completed units, real error and result availability; no invented provider percentage |
| `GET /api/v1/jobs/:id/result` | Authorized completed job ID | Versioned raw cues, segments, translations, timing source and warnings |
| `POST /api/v1/jobs/:id/retry` | Failed/interrupted job ID, renewed credentials if required | Resumes recoverable stage; does not blindly resubmit an accepted provider job |
| `POST /api/v1/jobs/:id/cancel` | Authorized job ID | Stops future local stages and requests provider cancellation only when supported; prior provider usage may remain billable |
| `POST /api/v1/jobs/:id/ack` | Successful local-import acknowledgement | Starts cleanup policy; does not count as learner completion |

Use an instance access token for a private installation, HTTPS remotely, and an explicit allowed-origin list. CORS alone is not authentication. Bind jobs/assets to the instance identity; identifiers are not access credentials. Validate paths, IDs, MIME, size, duration, and structured output. For supported URL processing, constrain protocols/domains and reject redirects/private-network destinations; never expose a general arbitrary-URL fetch endpoint.

Frontend service entry points belong beside current `services/api.ts`: material import, job create/read/result/retry, transcript save, and annotations. Components do not call providers or IndexedDB directly.

## 7. External APIs and resources

| Dependency | Used for | Credential/runtime requirement |
| --- | --- | --- |
| Existing `@google/genai` / Gemini | Existing word/sentence analysis, TTS, recording feedback; new translation and text generation; supported YouTube URL transcription | User's Gemini key; network; selected model must support the task |
| Gemini Files API | File references for the one-key media transcription path when needed | Same user's key; temporary provider storage; not permanent media hosting |
| AssemblyAI prerecorded transcription | Dedicated word/segment timestamps for original-audio navigation | New user ASR key; backend upload/submit/poll; optional if supplied subtitles or approximate Gemini transcription suffice |
| YouTube IFrame API | Remote playback, seek, time, supported speed | Player script; no caption-download permission granted by embedding |
| YouTube captions API | Captions for editable/authorized videos only | Separate Google OAuth scopes and video edit permission; not needed for normal iframe playback |
| Bilibili external player | Eligible embedding and documented initial-time parameter | Network; synchronization remains capability-gated |
| FFmpeg / ffprobe | Validate streams, extract/normalize speech for transcription | Executables inside backend deployment; child-process limits; no new JS wrapper required initially |
| Bun HTTP / SQLite | Private API, durable job queue/state | One backend host/container and persistent disk |
| Browser APIs | Media playback, recording, local files, storage, clipboard | Runtime capability checks; microphone requires permission/secure context |

Concrete ASR flow: [upload media](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/files/upload) -> [submit transcript](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit) -> [read transcript](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/get) -> [sentence results](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/get-sentences). Provider words carry millisecond timing; this is distinct from learner pronunciation assessment.

Gemini supports [structured output schemas](https://ai.google.dev/gemini-api/docs/structured-output), but responses still need semantic validation. Its [Files API](https://ai.google.dev/gemini-api/docs/files) is temporary provider storage and automatically expires uploads; keep the learner's original elsewhere. [Bun HTTP](https://bun.sh/docs/runtime/http/server), [Bun SQLite](https://bun.sh/docs/api/sqlite), and [FFmpeg](https://ffmpeg.org/ffmpeg.html) provide the proposed backend building blocks.

No payment integration, cloud database, Redis, application server rewrite, or account system is required for the private first release. Optional platform OAuth is confined to the authorized-caption feature.

## 8. Job state, credentials, and recovery

Persist states `queued`, `running`, `succeeded`, `failed`, `cancelled`, and `awaiting_credentials`; record the current processing stage separately. One runner claims one job at a time. SQLite records survive restarts; subprocess work is not performed inside a long-held HTTP request.

BYOK credentials are transmitted for the explicitly requested job over HTTPS and kept in server memory only. Never log, export, put in URLs, or persist them in job records. Closing the page can leave that server job running. Restarting the server loses the credential, so an incomplete job becomes `awaiting_credentials`; already completed results remain downloadable. A private owner-operated server may use an owner-managed environment credential instead, but it must not become an unrestricted public paid API.

Persist an external job ID after acceptance and reuse it for polling. If acceptance is uncertain after a transport error, mark the operation uncertain rather than automatically issuing another paid transcription. Cancellation means stopping additional work; it cannot promise a refund or recall an already accepted provider call.

Initial proposed limits: one active media pipeline, upload up to 100 MB, transcription input up to 30 minutes, and an explicit 30-minute application attempt deadline. These are application policy proposals, not provider promises. Larger files can still be studied locally with supplied subtitles when storage/decoder capacity allows.

Cleanup: acknowledged terminal jobs lose temporary media immediately; unacknowledged terminal results and associated input expire after seven days. Unattached uploads expire after 24 hours. Running jobs retain input until terminal/deadline; failed jobs retain input only through their disclosed retry window. Provider-side deletion/retention is separately documented and cannot be inferred from local cleanup.

## 9. Implementation slices and acceptance gates

| Slice | Independently useful delivery | Required evidence |
| --- | --- | --- |
| 1. Local material study | Persistent segments, text/local media+subtitles, bilingual reader, sentence controls, existing analysis/recording, notes/favorites/continuation | Deterministic segmentation/timing failure tests; browser flow and storage reload evidence |
| 2. Processing backend | Upload, FFmpeg preparation, durable jobs, timestamped ASR, result import, calibration | API contract tests; mocked provider jobs; restart, cancellation, idempotency and temporary-file cleanup evidence |
| 3. Remote sources | YouTube player+eligible transcript paths; limited Bilibili embedding with honest capability boundaries | Browser seek/clock failure scenarios; real eligible source smoke with owner-triggered credentials only |
| 4. Import convenience | AI text generation, translated batches, backup/restore, supported language expansion when audited | Partial translation/retry, backup migration, missing media and locale checks |

Must-have failure scenarios include: empty/malformed input; cue overlap/inverted timestamps; decoder failure; refused microphone; stale AI result after segment edits; quota exhaustion; provider rate limit; tab close; backend restart without credentials; accepted-provider retry; cancellation during extraction; split/merge annotation recovery; old backups; unsupported remote playback; and offline entry.

Current frontend commands: `bun run lint`, `bun run i18n:check`, `bun run build`. There is no current automated frontend test suite; add focused behavior coverage before new logic. Introduce backend verification commands with that package rather than pretending they already exist. Live paid provider calls are owner-triggered validation, not automated CI checks.

## 10. Change reach and unresolved release conditions

Expected frontend reach exceeds eight files: shared types; `App.tsx`; library/import/reader/sentence/shadowing views; speech arbitration; storage schema/backup; services/tasks/prompts; settings; both locales; and docs. The proposal also adds one backend service. This is a feature extension spanning several independently reviewable slices, not a one-component UI change.

Reuse local patterns: IndexedDB remains confined to `src/storage`; AI tasks remain behind service/provider contracts; prompts remain editable templates; existing explanation cache policy remains intact; speech request cancellation and microphone cleanup survive every new source. Update `PRODUCT.md`, `docs/architecture.md`, README, and CHANGELOG only when the approved feature actually changes behavior.

The backend recommendation is ready for discussion. Release commitments for arbitrary Bilibili synchronization, YouTube caption access, ASR accuracy, and additional learning languages are intentionally constrained by verified capabilities. No real upload/transcription, key availability, billing, decoder matrix, or deployment reliability was tested during this design pass.
