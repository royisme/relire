# Learning order for the 93 grammar topics, and a grammar step in Today

Status: G1 to G3 landed (2026-10-24); G4 (Today) remains separate. Revised after Argon's review (six findings, checked against the code and applied). Queue item 3 of the standing goal. Platform only: no topic text is written or changed.

## Why

The Grammar tab lists 93 topics with no sequence. The Worker sorts them `ORDER BY chapter, id`, which is alphabetical, so `chapter-eight` appears before `chapter-one` and the topics inside a chapter are in id order. A beginner cannot tell where to start or what comes next, and Today has nothing to say about grammar.

## Facts (code, 2026-10-24)

- No order, position or prerequisite exists anywhere: not in the manifest entry (`id, level, chapter, tags, related, reference, include`), the pack, the D1 table (`id, chapter, level, title_en, title_zh, tags, body, content_hash`) or `/v1/topics`.
- The committed `data/grammar-topics/manifest.json` array is already in the source textbook's order: ten chapters one to ten, consecutive, 93 unique ids. `related` is cross-reference only (48 of 96 links point forward), not a prerequisite.
- Topics reach the app only from the content service (`/v1/topics` list, `/v1/topics/:id` body). With no service configured there are no topics, the Grammar tab shows conjugation and gender only, and `grammarTopic` does not parse.
- 91 of the 93 topics are reading-only: only two have checkpoint exercises, and opening a topic writes nothing. "Done" therefore cannot come from checkpoints.

## Design

1. **Order is the manifest position.** `position` = the 1-based index of the topic in `manifest.json` (included topics only, in array order). Reordering later is a content decision the owner or a teacher makes by moving entries; v1 does not claim it is the best order for beginners, only that it is the textbook's own. The UI says "in book order", never "recommended".
2. **Publish it.** `scripts/grammar-topics/publish.ts` records each topic's 1-based manifest position BEFORE it sorts `pack.topics` by id for hashing (the sort would otherwise turn `position` into alphabetical order), writes it into a new D1 column, and includes `position` in the `packVersion` digest input (`id:position:hash`), so reordering the manifest changes the pack version and the `/v1/topics` ETag; `tests/grammarTopicPublish.test.ts`, which pins that a reversed manifest gives identical SQL and version, is updated to expect a change. `worker/migrations/0001_init.sql` gets the column directly (unreleased: no new migration file); `tests/fixtures/workerDb.ts` seeds it; `/v1/topics` returns `position` and sorts `ORDER BY position`. In `src/types/grammarTopic.ts` `GrammarTopicSchema` spreads the summary shape, so `position` does NOT go into `GrammarTopicSummarySchema`: a separate `GrammarTopicListEntrySchema = GrammarTopicSummarySchema.extend({ position })` and a `GrammarTopicListSchema` (array, `position` unique and positive) are used only by `load.ts` for `/v1/topics`, and every summary fixture used for the list (unit tests and e2e) gains `position`. The full topic, the pack and the private drafts are unchanged. The owner's local D1 is re-published after this step (a lead action, not a worker task).
3. **Studied marks.** A topic is done when the learner marks it studied. One tiny persisted fact per topic: `meta` key `topicStudied:<topicId>` = `{ at }`, written and read only in `storage/topicStudied.ts` (owning API, subscribe notification, whole-restore validation) and carried in the backup as `topicStudied: [{ topicId, at }]` (an absent field keeps stored rows, `[]` clears them, malformed rejects the whole restore), exactly like the reader progress rules in `.claude/rules/storage.md`. `src/components/settings/BackupControls.tsx` builds the `importData` payload by picking known fields, so it must pass `topicStudied: data.topicStudied` too, and a test restores through that handler (the reader-progress restore bug of R1-12 was exactly this omission). No epoch or token: a mark is idempotent and unmarking deletes the key. Marks of topics not in the current list are kept and ignored.
4. **Topics page.** Chapters in chapter order (by the first topic's `position`), topics numbered by `position` inside the chapter, a quiet "Studied" mark on marked topics, and a "Next" link above the list: the first topic by `position` not marked studied. When every topic is marked, no link. The topic reader gets a "Mark as studied" / "Unmark" outline button below the content (one filled button per view stays) and a "Next topic" link to the next position. The reader needs the list for that: `useGrammarTopics(topicId)` also loads the list (a cache hit when already fetched), and the footer (mark button and Next link) renders below the `topic.learning ? <TopicLearning/> : <article/>` branch so the two checkpoint topics get it too.
5. **Today step.** A fifth step `grammar`, present only when a content service is configured: once the list has loaded it reads "Next topic: {title}" (interface-language title) and links to that topic; done today when a topic was marked studied today (`at` in the local day); omitted when every topic is marked. If the list load fails the step stays in place with the real error (the existing error variant of `TodayStep`) and the other four steps are NOT blocked while the list loads or fails. `useToday` makes no request at all when no service is configured, and subscribes to the topic-studied storage notifications so a mark or a restore updates Today. With no service the step is omitted, never faked; the public build never shows it. A checkpoint attempt does not count for done-today in v1 (91 of 93 topics have none).

## Limits

- The order is the textbook's, not a teaching design for zero-basis learners. A reorder, prerequisites or levels inside chapters need content work and, for the owner, a teacher.
- "Studied" is the learner's own claim; nothing checks it.
- The Today step needs a network or cached list; offline with a cached list works (existing cache).

## Steps (each lands separately)

- G1 data: `position` from the manifest through the publish script (recorded before the id sort and included in the pack version), the D1 column in `0001_init.sql` and the worker seed fixture, the Worker route and sort, the list-entry schema and list schema, every list fixture (unit and e2e), tests (worker route, publish including the reorder case, schema: unique positive positions).
- G2 storage: `storage/topicStudied.ts` (mark, unmark, list, subscribe), backup export and restore including the Settings `BackupControls` payload, tests (idempotent mark, unmark, restore validation, absent/empty/malformed, subscribe after commit, restore through the Settings handler).
- G3 Topics page and reader: ordered chapters, numbers, studied marks, "Next" links, mark button, copy, tests, changelog, architecture. Copy goes to the copy author (agy Gemini) as its own task.
- G4 Today step: `grammar` in `TodayInput`/`TodayStep`, `useToday` reads the topic list only when a service is configured, `topicStudied` marks for done-today, copy, tests, changelog.

## Owner checks (never done by an agent)

Re-publish local D1 and look at the Topics page in book order; decide whether the textbook order is acceptable for beginners or a teacher should reorder; visual acceptance in three themes and at 360 px.
