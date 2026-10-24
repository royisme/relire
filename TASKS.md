# TASKS

The work queue in small steps, one at a time. `docs/roadmap.md` is the direction (done, next, later, deferred); GitHub issues track deferred problems and owner decisions; this file is what to do **next**, in order, with what makes each step done. Update it when a step starts, lands or is replaced; finished steps move to `PROGRESS.md`.

**A step is done when:** its acceptance line holds, `typecheck`, `lint`, `format:check`, `shape:check`, `i18n:check` and `test` all exit 0 (read the exit codes), the diff has been read by the lead, and the change is merged into the working branch. Visual acceptance, real devices and real keys are the owner's and are listed under "Owner" until done.

## Current epic: graded readers for zero-basis learners

Plan and decisions: `docs/graded-readers-plan.md` (epic #65; phases #62, #63, #64). Platform first; reader content is versioned data that is revised later.

### Now (R1: five readers in the app, no key needed)

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| R1-1 | Bundled starter export, lazy loader, `useGradedReaders` hook | loader rejects hash/schema errors; `publish.ts --check` in CI; starter becomes a precached lazy chunk within budget | landed |
| R1-2b | Local publish of non-bundled readers into D1 and app service catalogue | exact read-back before markers/catalogue/pointer; bundle precedence, network-only cache fallback and committed Keep offline | done; checks pass, uncommitted, lead review pending |
| R1-3 | Reader progress, opened-edition snapshot, backup/restore | snapshot survives service loss; restore rejects malformed input whole | landed |
| R1-4b | `#/read/graded` list page | starter-only states of design §6.3; real progress; no fake rows | landed |
| R1-5 | Reader accepts a third source kind (`graded`) | no Article or unit is created; Back goes to the list | landed |
| R1-6 | Authored word and sentence sheets (no AI key) | meaning appears at once; no dummy analysis; translation reveal in a fixed slot | landed; optional Ask AI deferred |
| R1-7 | Checkpoints and Mark read | strict-accent grading; verdict committed before shown; no automatic Next | landed |
| R1-10 | Recording ownership, shadowing log and backup for reader editions | takes keyed by reader id + body version | landed |
| R1-9b | Pass `playbackEngine: 'device'` from the graded route | nothing synthesized or fetched; real error without a French voice | landed; owner device check pending |
| R1-11 | Onboarding step 3 opens reader 1; key-banner wording; copy in both locales; docs | a learner with no key reaches a reader | landed |
| R1-12 | Build evidence and the cross-feature test pass | chunk sizes and precache recorded | last |

Landed in R1: R1-1, R1-2a (Worker routes), R1-3, R1-4a (routes and navigation), R1-6a (authored word and sentence components), R1-7 (checkpoints component), R1-8 (authored saved-word definitions), R1-9 (device-voice plumbing), R1-10 (recording ownership), R1-11. Integrated pages have landed (visual and device checks are the owner's). R1-2b wires the optional service catalogue and local-only staged publisher; uncommitted, awaiting lead review. No service configured still means bundle only.

### Content (paused by the owner's priority)

Stages 1 to 3 have private drafts with AI review records (not human review). Stages 4 to 12 are not written; stage 4 has an unreviewed draft. Resume after the platform: R0-7 for stages 4 to 5, R2 for 6 to 12, a human language review before any real beginner uses the readers.

Speaking IA (French sounds and Sound pairs moved from Progress to Speaking) has landed; owner-manual visual acceptance is pending.

## Owner

- Answer the open decisions in `docs/graded-readers-plan.md` (public bundle of stages 1 to 5, who reviews the language, word budgets).
- Try by hand: the pronunciation features (practice-card marks, strip, Details), Sound pairs, the published local grammar topics; accept or change the open copy items (#16, #17, #24).
- Human language review of the 91 locally published grammar topics (Chinese wording, kinship terms and a handful of Low items; their notes are in the local working notes).
- Deploy the content service (#31) before any real learner depends on topics, the wordbook or later readers.

## Not started

#14 (blocked by language-reviewer items), #21 (needs a real key), #29 (on hold), accounts and a paid tier (deferred in `docs/roadmap.md`).
