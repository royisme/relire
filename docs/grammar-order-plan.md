# Learning order for the 93 grammar topics, and a grammar step in Today

Status: proposed (2026-10-24), not built. Queue item 3 of the standing goal. Platform only: no topic text is written or changed.

## Why

The Grammar tab lists 93 topics with no sequence. The Worker sorts them `ORDER BY chapter, id`, which is alphabetical, so `chapter-eight` appears before `chapter-one` and the topics inside a chapter are in id order. A beginner cannot tell where to start or what comes next, and Today has nothing to say about grammar.

## Facts (code, 2026-10-24)

- No order, position or prerequisite exists anywhere: not in the manifest entry (`id, level, chapter, tags, related, reference, include`), the pack, the D1 table (`id, chapter, level, title_en, title_zh, tags, body, content_hash`) or `/v1/topics`.
- The committed `data/grammar-topics/manifest.json` array is already in the source textbook's order: ten chapters one to ten, consecutive, 93 unique ids. `related` is cross-reference only (48 of 96 links point forward), not a prerequisite.
- Topics reach the app only from the content service (`/v1/topics` list, `/v1/topics/:id` body). With no service configured there are no topics, the Grammar tab shows conjugation and gender only, and `grammarTopic` does not parse.
- 91 of the 93 topics are reading-only: only two have checkpoint exercises, and opening a topic writes nothing. "Done" therefore cannot come from checkpoints.

## Design

1. **Order is the manifest position.** `position` = the 1-based index of the topic in `manifest.json` (included topics only, in array order). Reordering later is a content decision the owner or a teacher makes by moving entries; v1 does not claim it is the best order for beginners, only that it is the textbook's own. The UI says "in book order", never "recommended".
2. **Publish it.** `scripts/grammar-topics/publish.ts` writes `position` into a new D1 column; `worker/migrations/0001_init.sql` gets the column directly (unreleased: no new migration file); `/v1/topics` returns `position` and sorts `ORDER BY position`; `GrammarTopicSummarySchema` gains `position` (positive integer, unique within the list). The list response is the only place the app learns the order; the full topic and the pack are unchanged. The owner's local D1 is re-published after this step (a lead action, not a worker task).
3. **Studied marks.** A topic is done when the learner marks it studied. One tiny persisted fact per topic: `meta` key `topicStudied:<topicId>` = `{ at }`, written and read only in `storage/topicStudied.ts` (owning API, subscribe notification, whole-restore validation) and carried in the backup as `topicStudied: [{ topicId, at }]` (an absent field keeps stored rows, `[]` clears them, malformed rejects the whole restore), exactly like the reader progress rules in `.claude/rules/storage.md`. No epoch or token: a mark is idempotent and unmarking deletes the key. Marks of topics not in the current list are kept and ignored.
4. **Topics page.** Chapters in chapter order (by the first topic's `position`), topics numbered by `position` inside the chapter, a quiet "Studied" mark on marked topics, and a "Next" link above the list: the first topic by `position` not marked studied. When every topic is marked, no link. The topic reader gets a "Mark as studied" / "Unmark" outline button below the content (one filled button per view stays) and a "Next topic" link to the next position.
5. **Today step.** A fifth step `grammar`, shown only when a content service is configured and the topic list loaded: status "Next topic: {title}" (interface-language title), link to that topic, done today when a topic was marked studied today (`at` in the local day, or a topic checkpoint attempt today), omitted when every topic is marked. A failing list load shows the real error on that step only. With no service configured the step is omitted, never faked; the public build never shows it.

## Limits

- The order is the textbook's, not a teaching design for zero-basis learners. A reorder, prerequisites or levels inside chapters need content work and, for the owner, a teacher.
- "Studied" is the learner's own claim; nothing checks it.
- The Today step needs a network or cached list; offline with a cached list works (existing cache).

## Steps (each lands separately)

- G1 data: `position` through manifest check, publish script, D1 column in `0001_init.sql`, Worker route and sort, summary schema, tests (worker route test, publish test, schema test: unique positive positions).
- G2 storage: `storage/topicStudied.ts` (mark, unmark, list, subscribe), backup export and restore, tests (idempotent mark, unmark, restore validation, absent/empty/malformed, subscribe after commit).
- G3 Topics page and reader: ordered chapters, numbers, studied marks, "Next" links, mark button, copy, tests, changelog, architecture. Copy goes to the copy author (agy Gemini) as its own task.
- G4 Today step: `grammar` in `TodayInput`/`TodayStep`, `useToday` reads the topic list only when a service is configured, `topicStudied` marks for done-today, copy, tests, changelog.

## Owner checks (never done by an agent)

Re-publish local D1 and look at the Topics page in book order; decide whether the textbook order is acceptable for beginners or a teacher should reorder; visual acceptance in three themes and at 360 px.
