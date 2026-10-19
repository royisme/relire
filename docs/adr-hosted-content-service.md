# ADR: a hosted content service for grammar topics and the lexicon

Status: **Accepted** by the owner's instruction on 2026-10-19 ("no authorization issue, just do it", after answering the three design questions in section 1). It answers issue #27. The "no server" statements in `CLAUDE.md`, `PRODUCT.md`, `docs/architecture.md` and `docs/merge-plan.md` (decision 1) were amended in the same change (H0). Q1 to Q6 in section 8 stay open; the stated defaults apply until the owner says otherwise: Q2 yes, Q3 build-time URL only, Q4 existing packs stay static, Q6 yes. The legal read in Q5 is dropped by the owner's instruction (no licence concern), but the Morphalou notices and a rebuild recipe are still built in H3 because the licence requires them.

## 1. Context

- Owner direction (2026-10-19): the grammar topic text has no copyright risk, but it must be **private data** in case it becomes a paid service. It must never be committed to the public repository or shipped as static JSON inside the front-end bundle (anyone can download a bundle). Putting it into a backend database first is the problem to solve.
- Owner answers to the three design questions (2026-10-19): scope is **topics and the lexicon together**; phase 1 access is **public read-only**; the free GitHub Pages build **hides grammar topics when no service is configured**.
- Earlier direction (2026-10-18, memory `relire-grammar-hosted-addon`): the free static build stays; the owner's own Cloudflare deployment carries a hosted add-on; one codebase, two deployments; AI keys and AI calls stay in the browser and the server never sees a key.
- Today: TP1, TP3 and TP4 of the topics work load `src/data/grammar/topics.json` and `tag-index.json` as lazy static chunks (both empty). Generated drafts go only to the gitignored `.local/grammar-topics/`; every manifest entry is `include: false`.

## 2. Decision (proposed)

A Cloudflare **Worker with a D1 database** serves read-only content. Two kinds of content, one service:

1. **Grammar topics** (Part 2): reviewed topic text (en, zh, French examples), the tag index, chapter metadata.
2. **Lexicon** (issue #27): attested forms, gender and conjugation of a lemma, so an unknown verb is answered by the dictionary before the model.

**Local first (owner, 2026-10-19):** the target is Cloudflare D1, but every phase is built and proven against a local Worker and a local D1 (`wrangler dev --local`, data under the gitignored `worker/.wrangler/`), so the whole product works end to end on the owner's machine. Deploying to Cloudflare is a later step the owner does, once the functionality is complete; no phase here includes a deploy, a login or a remote database.

The free static build is unchanged and keeps working with no service: it needs no key and no network beyond what it uses today.

## 3. What lives where

| Kind | Where | Public? |
| --- | --- | --- |
| Code: Worker, schemas, scripts, the app | the public repository | yes |
| Topic ids, reference ids, tags, `related`, review hashes (`data/grammar-topics/manifest.json`, `reviews.json`) | the repository | yes; no prose |
| Topic drafts and text, lexicon rows | `.local/` on the owner's machine, then D1 | **no**: only through the Worker |
| Conjugation pack (4 reviewed verbs), noun-gender data | stay static in the bundle for now | yes; not part of this decision |

The publish gate does not move: only the owner marks `reviewed`, and a publish refuses anything below it. The gate moves from "write `topics.json`" to "load into D1". Writes happen only from the owner's machine (wrangler or the D1 API with the owner's credentials); **the Worker exposes no write endpoint**.

## 4. Service shape

Read-only JSON, versioned under `/v1`:

- `GET /v1/topics` ids, titles, chapter, level, tags (no body text), `GET /v1/topics/:id` one topic, `GET /v1/tag-index`, `GET /v1/lexicon/:lemma`.
- No endpoint returns all text at once. This raises the cost of bulk scraping; it does not prevent it (section 6).
- `ETag` from the pack version, short cache headers, CORS limited to the deployments' origins, a per-IP rate limit.
- The app validates every response with its Zod schema (whole-response parse, the real error shown on failure), as the static loaders do today, and caches fetched content in IndexedDB for offline use.

## 5. App changes (when this is accepted)

- A service URL (build-time or a Settings field: open question Q3). With none configured: the Topics tab says the service is not configured, tag labels stay plain text, the word sheet skips the lexicon and works as today.
- The TP1 loaders become fetch loaders; `src/data/grammar/topics.json`, `tag-index.json`, the `topics` build target's published output and the `grammar-tag-index-artifact` Vite plugin go away. The TP3 reader, the TP4 labels and their tests change only at the loader boundary.
- Word sheet: for a lemma not in the static pack, ask the lexicon first, then the model; an answer from the lexicon is marked as attested and never needs a key.

## 6. Consequences and risks

- **Public read-only does not make the content private from users.** It keeps it out of the repository and the bundle. Anyone who learns the URL can read topics one by one. Acceptable while the content is small and free; **before anything is sold, access control is needed** (accounts, Better Auth was the earlier idea). Phase 1 deliberately has none.
- A service now exists: cost, abuse, uptime and privacy statements are the owner's to run. The server never receives a key, an answer, an article or a recording; a request carries only a topic id or a word (a lemma, or the form the learner tapped, which does reveal which words they look up) and the caller's IP address. The About page says so when a service is configured.
- The free build gets less (no topics) than the hosted one. That is the intended funnel, but the About page must say so.
- Lexicon scope (owner, 2026-10-19: learners below C1 do not need 600,000 form rows): H3 serves a learner-sized selection, about 5,000 lemmas chosen offline by frequency plus the lemmas the app itself uses (`data/lexicon/lemmas.txt`, words only), measured at 49,238 rows, verbs with only the six simple tenses and the participles. The frequency table is used only to choose the words and is never stored or served.
- Licence: Morphalou 3.1 is LGPL-LR; serving it needs its notices and replaceable data (a documented way to rebuild the D1 rows from the source). Other lexicons evaluated earlier carry share-alike or non-commercial terms and **must not be served** without a licence check. Serving data that may later be sold needs a licence review **before** any lexicon row is loaded (Q5).
- Reshaping TP1, TP3 and TP4 is cheap (nothing has shipped, no compatibility code), but it is real work; the topics UI cannot show real content until the service exists.

## 7. Phases

| Phase | Scope | Gate |
| --- | --- | --- |
| H0 | Owner accepts or amends this ADR; the "no server" statements are rewritten explicitly (`CLAUDE.md`, `PRODUCT.md`, `docs/architecture.md`, `docs/merge-plan.md` decision 1) | owner |
| H1 | Worker in `worker/`: `wrangler` config, D1 schema and migration for topics, the three topic read endpoints (list, one topic, tag index), CORS, rate limit, tests; no real content; the lexicon table and endpoint come with H3 | unit tests, a local miniflare run |
| H2 | Local publish script (reviewed topics to D1), the app's fetch loaders and offline cache, the "not configured" states; TP1 static outputs removed | e2e with a mocked service; main chunk not larger |
| H3 | Lexicon import pipeline from the local Morphalou data, with notices and a rebuild recipe; word-sheet lookup | licence review done first; oracle diff against the engine |
| H4 | Accounts and paid access | before any charge |

## 8. Questions for the owner

- **Q1 Cloudflare.** Which account and domain host it, and are the free-tier limits acceptable for phase 1 (check Cloudflare's current limits for Workers and D1)?
- **Q2 Bulk reading.** Is "public read-only, no bulk endpoint, rate limited" acceptable until accounts exist, knowing a determined reader can still collect every topic?
- **Q3 Service URL.** Build-time only (one URL per deployment, simplest), or a Settings field so the free build can point at the owner's service?
- **Q4 Existing static packs.** Do the conjugation pack and the noun-gender data stay in the bundle (default) or move to the service later?
- **Q5 Licence.** Is a legal read of Morphalou 3.1's terms for a possibly paid service wanted before H3? (The author cannot give legal advice.)
- **Q6 Part 2 meanwhile.** Keep generating and reviewing topics locally (default), so the content is ready when H2 lands?
