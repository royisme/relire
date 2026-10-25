# Learning games: a design study

Status: proposal, written 2026-10-24. Nothing here is built or scheduled. It is a study of the installed gamedev skills against Relire's rules and bundled data, with five concepts, one recommended first prototype and the forks the owner decides. Every repo fact below comes from a file read for this study. Where I only saw a signature and did not read the body, I say so.

## 1. What the gamedev skills offer us

Read (through the Skill tool): `router`, `game-feel`, `game-ui-ux`, `puzzle`, `card-game`, `level-design`, `audio-design`, `input-systems`, `save-systems`, `prototype-fast`, `dialogue-systems`.

Skipped: every engine skill (Godot, Unity, Unreal, Phaser, PixiJS, three.js, Bevy, pygame, LÖVE, Roblox), because Relire is React DOM with no engine and the router confirms there is no engine fingerprint. Also skipped: `visual-novel` and `rpg` (both are built from dialogue, save and UI, which I read), `roguelike`, `platformer`, `fps-shooter`, `tower-defense`, `survival-crafting` (real-time or spatial genres with no French-learning loop), `game-ai`, `ai-behavior-trees-utility-ai`, `procedural-gen`, `camera-systems`, `physics-tuning`, `shader-programming`, `performance-optimization`, `create-game-assets`, `game-jam`, and the publishing skills. I did not read `procedural-gen`, so nothing below cites it. The seeded-RNG idea comes from `puzzle` and `card-game`.

| Skill | Principles that transfer | What does not transfer |
| --- | --- | --- |
| game-feel | Every action gets feedback within about 100 ms. Scale the response to how much the event matters (a right answer is small; finishing a round is medium). Feedback returns to rest. Feedback never blocks input. | Screen shake, hit-stop, particles, number pops, squash and stretch. `DESIGN.md` bans confetti and keeps motion to 160–200 ms with reduced-motion support, so what remains is a mark on the control itself (check, cross, reference answer) and nothing else. |
| game-ui-ux | Every screen opens with one control focused, and focus moves in a defined order. UI reacts to events rather than polling. Layouts are fluid and text sits in containers that fit translated strings. Mouse and keyboard work side by side. | Reference-resolution scaling, TV overscan, gamepad glyphs. The app already has 360 px checks and `t()`. |
| puzzle | The board model is the only source of truth, and the view renders it. Resolution is deterministic. Input is locked while a move resolves (in our case, while a check is being saved). Teach one mechanic at a time. A seeded RNG makes a daily puzzle reproducible. | Cascades, gravity, refill, scoring curves, deadlock shuffles. |
| card-game | A card is in exactly one zone. A missed card goes to the discard pile and comes back through the reshuffle, which gives repetition inside a session without a scheduler. Cards are data read by one interpreter, which is how `prepare*` producers already work. A play is atomic: validate first, then commit. | Mana, costs, opponents, rarity, power budgets. |
| level-design | Difficulty rises in a sawtooth: teach, practise, test, then rest. Introduce a mechanic safely before testing it. Every path has to reach its goal, so no round can contain an unanswerable item. | Spatial metrics, sightlines, gating by keys. |
| audio-design | Two thin points: each item needs distinct audio (the spelling drill already samples distinct words because a shared `audioText` shares a Listen button's state), and a failed voice shows its real reason. | Buses, ducking, adaptive music, beat sync, SFX variation. The app plays only French speech, never sound effects or music. |
| input-systems | Name actions, not keys. Use edge-triggered presses for discrete answers. Ignore held, repeated and IME events. The Words review already does this with 1/2/3, so the pattern exists in the repo. Make no action need two keys at once. | Deadzones, coyote time, rebinding UI (one fixed, labelled mapping is enough). |
| save-systems | Save plain data, not UI objects. Writes are atomic and loads are validated. The repo already has both: `saveUnits` validates every unit and writes the batch in one transaction, and backups are validated as a whole on restore. | The versioned migration chain. It contradicts `AGENTS.md`: nothing has shipped, so no migrations. Also slots, autosave and tamper concerns. |
| prototype-fast | Ask one question per prototype. Write kill criteria before coding. Greybox the core verb. A "keep" decision means rewriting, not promoting the spike. | Hand the prototype to an uncoached stranger. Here the only tester is the owner (no analytics), so section 5 adapts this. |
| dialogue-systems | A graph with line IDs, not literal strings, maps directly onto `t()` keys. Validate that every branch ends. | Ink, Yarn, custom runners. No concept below needs branching narrative, and Relire has no authored dialogue content. |

We also do not take: streaks, streak guilt, lives, timers that punish, XP, levels, badges, loot or random rewards, leaderboards, notifications or reminders, mascots, sound effects, any engine or canvas renderer, and any new dependency.

## 2. Constraints that decide the designs

Every game obeys these rules, all taken from `AGENTS.md`, `RULES.md`, `PRODUCT.md` and `DESIGN.md`:

1. **No invented data or official claims.** A game shows what was answered and how many were right, and nothing else. No points, no level, no "TCF score", no predicted band. It is not a mock exam.
2. **Real errors.** A voice that cannot play, a pack that fails to load or a save that fails shows its real reason on the control or in a bounded status slot.
3. **i18n.** Every interface string goes through `t()` with keys in `en.json` and `zh.json`. French items are data from packs, never inside a Chinese string.
4. **Offline and keyless core.** Games run on bundled packs and the device voice. No AI call, no content service and no network for the core loop. The AI key may only ever add an optional extra (an Explain sheet), and no concept below uses it.
5. **No server, accounts or leaderboards.** The content service is optional and read-only, and receives nothing from a game.
6. **Results feed the existing records, and only the records that fit.**
   - **Mistakes: yes.** A game round is saved as an ordinary `ExerciseUnit` through `saveUnits`, each check goes through `checkItem`, and the attempts appear in Mistakes, Practice and backups unchanged. This is the only persistence path I verified. `checkItem` requires the item to exist in the stored unit, and it returns the existing state instead of writing again for an item already checked. A "standing unit" whose items change from round to round therefore does not work. `ensureTopicUnit` accepts only units with `topicOrigin`.
   - **Only the first answer per card is recorded, and that already happens.** Because `checkItem` does not write again for an item already checked, a missed card that returns later in the round writes nothing, unless the game calls Redo. So the rule is: **never call Redo inside a round.** If it did, Mistakes would mark the item resolved seconds after the learner saw the answer, and the notebook would lose the error.
   - **FSRS: no direct writes.** `PRODUCT.md` defines review outcomes as self-reported recall, not correctness, and says Easy is never inferred and flipping or skipping never counts. `rateVocabularyCard` and `introduceVocabularyCard` also take the card's current stored state (`expected`). **A game never rates or introduces a card.** It can link to Review, and a word in feedback can open the usual word sheet, whose Save bookmark is the existing way into the deck. This rule conflicts with the brief's "feed FSRS" and is open question 1.
7. **Accessibility.** Every action works from the keyboard with a single key, and the keys are listed on screen. Focus starts on the first answer control. Results are announced through one `aria-live` line. Right and wrong are never shown by colour alone (marker icon plus label, as on the exercise sheet). Reduced motion means no motion. Targets are at least 40 px.
8. **Calm visuals under `DESIGN.md`.** One `surface` card with hairline rules and one filled button. No edge bars, stripes or rails, no tinted structure boxes, no hero rings or metric tiles, no icons beside titles, no progress ring. A round counter is plain `.tnum` text ("5 of 12").
9. **Components.** Use shadcn/Base UI first, plus the existing `Button`, `SpeakButton` and exercise controls. DOM and CSS only. No canvas, engine or new dependency without owner approval.
10. **Controls never move the page.** The feedback slot is reserved from the start at a fixed height, the same way the topic workbench reserves its `h-32` result slot. The next card replaces the current one in place.
11. **Content honesty.** A game says what checked its data. Owner-reviewed packs: noun gender (337 nouns, 17 rules), grammar pack (19 verbs, 11 tenses, each verb `reviewedBy: "Roy Zhu"` in `pack.json`; the framework copy around them, meaning the tense use and form lines and the rule captions, still awaits the owner's review per `docs/roadmap.md`), minimal pairs (32 pairs). AI-review-only: spelling sounds (16 patterns), graded readers. Unbuilt: the bundled lexicon (`docs/lexicon-bundle-plan.md` says "Nothing here is built"; `data/lexicon/` holds only `lemmas.txt`, and its data will be labelled "From the Morphalou dictionary, not reviewed"). Service-only: the `tcf-7000` wordbook (unreviewed, local D1 only) and grammar topics (2 of 93 have checkpoints). `RULES.md` makes a human language review the release gate for beginner content.

## 3. Concepts

Each concept names the existing drill it overlaps, because a game that only renames a drill is not worth building. What a game adds over a saved sheet: one card at a time, single-key answers, the missed card coming back in the same session, a date-seeded round, and feedback that teaches (the ending, the sound) in the same spot every time.

### 3.1 Le ou la (noun gender sort)

- **Objective.** Guess a noun's gender from its spelling, using the 17 ending tendencies and their exceptions. Skill: noun gender, which drives articles and agreement.
- **Loop.** A bare lemma appears in the reading face (`maison`, never `la maison`). Press `F`/`←` for *le* or `J`/`→` for *la*, or click. The card shows a check or a cross, the right article with the noun, and the longest matching ending with its real measured figure from the pack (`-tion`: feminine, 3,780 of 3,794 dictionary nouns, 9 of 9 A1 nouns), or the exception note. A missed card goes to the bottom of the deck. The round ends when every card has been answered right once. The end shows "12 nouns, 9 right on the first try" and a link to the Gender reference.
- **Data.** `src/data/noun-gender/pack.json` (337 owner-reviewed A1 nouns, 17 rules), `matchNounGender` in `src/services/nounGender/match.ts`, and the sampling and item shape of `prepareGenderDrills` in `src/services/exercises/fromGender.ts` (it already stores `rules` with `percent` and `n`, plus `exception`, in item meta). No new content. The lexicon's 5,022 lemmas, once LB1 and LB2 land, would add more nouns, but unreviewed. If they are used, they belong in a separate, labelled mode and are never mixed into the reviewed round (open question 4).
- **Correctness.** Deterministic: `expectedAnswer` `M`/`F` from the pack.
- **Feedback and progress.** First-try right/total for this round only. Nothing carries over except the attempts.
- **Session.** 12 cards by default, about 2 minutes.
- **Records.** One `GENDER_CHECK` unit saved through `saveUnits` (learning area grammar, tag `gender-number`), first answers through `checkItem` (a returning card is not re-checked, and there is no Redo inside a round), misses in Mistakes. No FSRS write.
- **Accessibility.** Two single-key actions, each with a visible key hint. The ending and the article are announced. Exceptions are marked by a label, not a colour.
- **Overlap.** `prepareGenderDrills` plus the sheet already do the same thing on a page of eight rows. The game adds single-key speed, the miss coming back, and the ending shown in the same place every time.
- **Risks.** The learner may learn the 17 endings and nothing else. That is mostly the point, but exceptions must be sampled; the producer already includes them because it shuffles the whole pack. With a binary choice, guessing gets half right, so first-try counts flatter the learner, and the end screen must not present them as mastery. Each round saves a new set in Grammar → Exercises (open question 2).
- **Effort: S.** A card view, the deck logic (an array and an index), the key handler copied from the Words review pattern, the end summary, `t()` keys, tests for the deck and first-answer-only recording.

### 3.2 J'entends (hear and choose)

- **Objective.** Tell French sounds apart by ear and connect a sound to its spelling. Skill: listening discrimination, as groundwork for pronunciation.
- **Loop.** The card plays a word with the device voice (`SpeakButton`, `engine="device"`). The learner picks one of two words (a minimal pair: *rue* or *roue*) or one of three spellings (*ou*, *u*, *eu*) with `1`/`2`/`3`. After the answer, both words in the pair can be replayed side by side. A missed card comes back. Rounds stay inside one contrast group at first (teach), then mix (test), following the sawtooth from level-design.
- **Data.** `src/data/minimal-pairs/pairs.json` (32 owner-reviewed pairs, contrasts y-u, ɑ̃-ɔ̃, e-ɛ, ɔ̃-o, ɛ̃-ɛ, b-p, ʁ-l) through `fromPairs.ts`, and `src/data/spelling-sounds/patterns.json` (16 patterns, AI review only) through `fromSpelling.ts`. No new content.
- **Correctness.** Deterministic: the played word is the answer.
- **Feedback and progress.** Right/total per contrast in this round. The Speaking page already shows real per-contrast counts (`countsBySoundContrast`).
- **Session.** 10 cards, about 3 minutes.
- **Records.** A `CHOICE_SELECT` Listening unit (or the pairs unit type `fromPairs` already makes; I did not read that file's body), saved and checked as above.
- **Accessibility.** Audio is the whole task, so this game is not usable without hearing, and it says so. Replay is unlimited and on a key (`Space`). Nothing plays automatically on load. Playback starts from the learner's key press, which also suits browser autoplay rules.
- **Overlap.** The Sound pairs drills and "Practise these sounds" already exist as saved sheets. The game adds one card at a time, side-by-side replay after the answer, and the miss coming back.
- **Risks.** The device voice may nasalize or stress oddly (`docs/spelling-sounds-plan.md` lists this as an owner check). Then the game teaches the voice, not French, and that cannot be checked without a real device. Spelling patterns are AI-reviewed only, so that mode carries the same "checked by an AI, not yet by a teacher" notice as the Letter sounds section. A learner may also recognise which words appear without hearing the difference, because the pool is small (32 pairs).
- **Effort: M.** The S pieces plus the device-voice failure state on the card, the side-by-side replay, and contrast grouping.

### 3.3 Paquet de verbes (conjugation deck)

- **Objective.** Produce the right form for a subject, tense and verb. Skill: conjugation of the 19 reviewed verbs.
- **Loop.** A card shows `nous · prendre · présent`. The learner types the form (the character bar is available, and accents count). A miss shows the reference form and the ending with the rule highlight that the Conjugation page already uses, and the card returns to the deck. The highlight and rule captions are framework copy still awaiting the owner's review, so they carry that status. The forms themselves are reviewed. A deck is one verb across one tense at first, then one tense across verbs, then mixed. The learner picks the deck from a short list. There is no unlocking.
- **Data.** `src/data/grammar-pack/pack.json` (19 reviewed verbs, 11 tenses), `prepareConjugationDrills` and `hasGradableCell` in `fromConjugation.ts`, `cellParts` in `src/services/conjugation/cellParts.ts`. No new content. A later, separate mode could ask for the infinitive of a form ("vais → ?"), using the lexicon's `forms` map once LB2 lands, labelled unreviewed.
- **Correctness.** Deterministic: `gradeItem` with strict accents, the same as the existing drills.
- **Feedback and progress.** First-try right/total per tense in this round.
- **Session.** 10 cards, 3 to 4 minutes.
- **Records.** A grammar unit as `prepareConjugationDrills` makes it, saved and checked as above, so attempts count in Progress → grammar accuracy.
- **Accessibility.** A typed answer with Enter to check, the existing IME rule, and a character bar that never takes focus.
- **Overlap.** "Practise all tenses" and the per-tense drills on the Conjugation page are close to this. The game adds the deck order (one tense across verbs) and the miss coming back.
- **Risks.** Low cheating risk, because typing a form is real production. Mixed decks may be too hard for A1, and the order of decks is a teaching choice the owner makes. This concept is the closest to what already exists.
- **Effort: S–M.** It reuses the drill producer. The card view is new, and so is the deck chooser.

### 3.4 Dictée en tuiles (dictation ladder)

- **Objective.** Hear a whole sentence and write it. Skill: listening plus spelling at sentence level.
- **Loop.** Rung 1: hear the sentence and build it from shuffled word tiles. Rung 2: hear it and type it. A sentence moves up a rung after it is built right on rung 1. The reader's translation is shown as the clue, never the French.
- **Data.** `src/data/graded-readers/starter.json`: 3 bundled readers, 11 sentences, AI-reviewed only. Offline, that is the whole pool, and it repeats within a day. More sentences come from served readers (needs the service). Built on `prepareReaderDictation` in `fromReader.ts` (`NUMBER_DICTATION` with the device voice and `ignoreSentencePunctuation`) and the `SENTENCE_BUILD` tile control.
- **Correctness.** Deterministic in both rungs. Tile order is compared with the reference. One limit: the existing sentence-build control sends any arrangement that does not match the reference to the AI grader (`DESIGN.md`, "Pick and order controls"). The game must grade a non-match as wrong instead of calling the AI, or it breaks the keyless rule. That is a real change to the control, or a second control.
- **Session.** 5 sentences, 4 to 6 minutes.
- **Records.** As above. Rung 1 and rung 2 are separate items, so a rung-1 miss and a rung-2 miss are both in Mistakes.
- **Accessibility.** Tiles are buttons in a row with arrow-key focus. Typing has the character bar.
- **Overlap.** Reader dictation already exists. The game adds the tile rung before typing.
- **Risks.** With 11 sentences, the learner memorises them within days, and the game becomes recall of text rather than listening. It is AI-reviewed beginner content, so the human-review gate applies. And the AI-grader change described above.
- **Effort: M.** The ladder state, the sentence-build grading change, and the two rung views.

### 3.5 Trois minutes (a daily round for Today)

- **Objective.** One short mixed retrieval round a day across the bundled reviewed packs. Skill: spaced, interleaved retrieval of gender, conjugation and sounds.
- **Loop.** Six cards: two genders (3.1), two verb forms (3.3), two minimal pairs (3.2), drawn by an RNG seeded from the local date. A reload or another visit the same day gives the same six cards, so the round is the day's puzzle (from the seeded daily puzzle in `puzzle`). Old mistakes are not copied into the round: Mistakes keys an entry by unit id plus item id and resolves it only on a later right attempt of that same item, so a copy in a fresh unit would never clear it. The end links to Today's existing Mistakes step instead. The end shows "6 cards, 4 right" and the next Today step.
- **Data.** Only the three owner-reviewed packs above, so the data itself has no open review gate. The conjugation feedback copy still waits on the owner (see 3.3).
- **Reload.** The same date gives the same cards, but each `saveUnits` call makes a new set with random ids, so a reload would add a second set. Something to check, not a decided design: build the unit id from the date, treat `DuplicateUnitError` as "already exists", then `getUnit`.
- **Correctness.** Deterministic, as in the source games.
- **How it plugs into Today.** Today is already a daily mixed list: `TodayStepId` is the closed union `'words' | 'read' | 'sound' | 'mistakes' | 'grammar'`, the plan is stateless and derived from timestamps, and Today v2 (V1 plan model, V2 view) is being rebuilt now. The reader-dictation plan deliberately did not extend Today. So this round should not be a sixth step. Instead it becomes the content of the existing `sound` step, which today links to Sound pairs: the step links to the day's round, and "done today" comes from today's attempts on the daily round's unit. That part is not verified: I did not read how attempts store item meta, or how `plan.ts` decides the `sound` step is done. That keeps `nextIndex` and the guidance sentence unchanged. Adding a sixth step instead would change both (open question 3). Either way, wait until Today v2's V1 and V2 have landed.
- **Session.** About 2 minutes.
- **Records.** One mixed unit a day. Its learning area is a problem, because a unit has one primary `learningArea` and these cards span grammar and listening. Splitting the round into two units in one set works with `saveUnits` (one `setId`), at the cost of two rows. This needs checking before it is built.
- **Risks.** It becomes a streak in disguise if the UI ever counts days. It must not. One saved set per day in the area tables (open question 2). It overlaps the Words and Mistakes steps.
- **Effort: M.** It depends on 3.1 and 3.3 existing, plus the seeded sampler, the Today step change and the unit-area question.

## 4. What the evidence does and does not say

I am not citing sources, and there are no numbers here. This is my general understanding of the learning-science literature, and the owner should treat it as such.

- **Reasonably established.** Retrieval practice (answering from memory) helps retention more than rereading. Spacing practice over days beats massing it into one session. Interleaving similar categories (le/la, y/u) helps discrimination, even though it feels harder during practice. Making practice somewhat harder ("desirable difficulty") helps, as long as the learner can still succeed often enough. Typing a form (3.3, 3.4 rung 2) is a stronger retrieval test than recognising it (3.1, 3.2), so recognition games are a first step, not the whole thing.
- **Feedback timing is not settled.** Feedback clearly helps, especially after errors. Whether immediate feedback beats delayed feedback is mixed: delayed feedback sometimes helps long-term retention. The concepts use immediate feedback because a calm one-card loop needs it, not because it is proven better.
- **Weak or contested.** Gamification (points, badges, leaderboards, streaks) has mixed results. Effects are often short-lived, can shift attention to the reward, and can undermine interest that was already there. Badges and streaks are exactly what `PRODUCT.md` rules out. The safer reading is that a game helps only if its core action is the retrieval itself, which is why every concept above is a retrieval task in a calmer frame and none adds rewards.

## 5. Recommendation

**Build 3.1 Le ou la first.**

Why:
- It runs on owner-reviewed data only, so no language-review gate is open.
- It works fully offline with no voice, so no device check blocks the owner from judging it.
- Grading is deterministic, the producer, item type and meta already exist, and it is the smallest concept (S).
- It answers the one real question cheaply: does one-card, single-key play with the miss coming back help more than the existing eight-row gender sheet?

**Prototype in one day by one worker:**
- One route under Grammar → Gender, for example a "Play" link beside Make exercises.
- A card view that takes a unit from `prepareGenderDrills` (count 12).
- A deck that is an array with a cursor, where a miss is appended to the end.
- `F`/`J`/arrow keys plus two buttons, with the Words review's guards against held and repeated keys.
- A fixed-height feedback slot showing the article, the noun and the ending tendency from item meta.
- `saveUnits` once at the start, `checkItem` on each first answer, and never Redo inside a round.
- An end line with first-try right/total and links to Mistakes and the Gender reference.
- `t()` keys in both locales, and unit tests for the deck order and for a re-queued card writing no second attempt.

No new dependency, store or route parameter beyond the page.

**What the owner measures by hand (no analytics):**
- Over a week, does the owner choose this over the gender sheet without being reminded?
- Do the misses in Mistakes still look the same a day later?
- Does the ending line get read, or skipped?
- Does a 12-card round feel too long or too short?
- How many sets accumulate in Grammar → Exercises?

Kill it if, after a week, it is no better than the sheet or the table clutter outweighs it. If it is kept, rewrite it properly, following the prototype-fast rule.

**Not now:**
- 3.4, which waits on the human review of the readers and the sentence-build grading change.
- 3.5, which waits on Today v2 and on 3.1 and 3.3 existing.
- Any lexicon-based mode, which waits on LB1 and LB2 and on a labelling decision.
- Any AI feature, sound effect, timer, score, badge or streak.
- A shared "game engine" abstraction. Write one only when a second game exists (`AGENTS.md`: no abstraction before a second caller).

## 6. Open questions for the owner

1. **FSRS.** Games never rate or introduce word cards, because ratings are self-reported recall. *Default:* no FSRS writes. Feedback words open the word sheet, where Save is the way in.
2. **Saved sets.** Each round saves a new set in the area's Exercises table. A round abandoned after one card also leaves a set of mostly unchecked items, as the existing drills already do. *Default:* accept it for the prototype and judge the clutter. The alternative is a game-specific `setTitle` or a filter, which is a shape change.
3. **Today.** Should the daily round replace the `sound` step's target, or be a sixth step? *Default:* replace the target after Today v2 lands. No sixth step.
4. **Lexicon nouns and verbs** (after LB1 and LB2). *Default:* a separate, labelled "dictionary nouns, not reviewed" mode, never mixed into the reviewed round. Or keep games to reviewed data only.
5. **In-round retries.** A missed card returns, but only the first answer is recorded (no Redo inside a round). *Default:* yes, so Mistakes keeps the error. The alternative calls Redo and records every try, and the item is marked resolved seconds later.
6. **Where games live.** *Default:* each game sits beside the drill it extends (Gender, Conjugation, Speaking), with no separate Games section in the sidebar.
