# Delegating work to pi, agy and Claude subagents

How a lead Claude Code session hands work to other agents and takes it back. Read this before dispatching anything. The dispatch script is `scripts/pi-dispatch.sh`.

## 1. Roles

| Role | Who | Does | Does not |
| --- | --- | --- | --- |
| Lead | This Claude Code session | Writes the plan and the acceptance criteria, writes the worker prompt, dispatches, re-runs required static/unit checks and any justified focused browser check, reviews the diff, merges a reviewed worker branch into the current designated feature branch, locally and without asking (owner decision 2026-10-18) | Write the implementation itself |
| Implementer | `pi` with `openai-codex/gpt-6.1-sol` via `scripts/pi-dispatch.sh` (default since 2026-10-18, owner decision to spare Claude tokens), or the `implementer` subagent (Sonnet) only as a fallback | Executes an agreed plan inside a stated scope, in its own worktree, and reports | Change the plan, widen the scope, merge, push |
| Reviewer | The `reviewer` subagent (Opus, read-only), or a read-only `pi` run on another model family (Gemini 4 Argon, quota-gated: section 2) | Accepts or rejects against the plan, with `file:line` findings | Edit anything. A reviewer that fixes what it finds destroys the evidence and reviews its own work next round |
| Research / copy / mechanical | `agy` (`antigravity/gemini-3.8-flash`, always through `pi`) | Web search and cited research, gathering reference material, copy and corpus drafts (en, zh, fr), marketing and README copy, simple tasks whose result a machine can check | Multi-file code implementation; anything that needs a design decision |

By owner decision 2026-10-18, the lead may merge a reviewed worker branch into the current designated feature branch locally without asking. Merging into `main`, pushing and opening PRs still happen only when the user asks, each time (CLAUDE.md: "Do not open PRs, merge or force-push unless asked"). Keep the gradient: the reviewer is never weaker than the implementer.

### Claude subagents and model cost

The built-in `Explore` and `general-purpose` agents inherit the lead's model (Opus) unless a model is set, which spends Opus on small jobs. Forks always inherit the lead's model. Relire has project agents in `.claude/agents/`:

| Agent | Model | For |
| --- | --- | --- |
| `scout` | `haiku` | Read-only lookups: files, symbols, usages, config values, doc passages |
| `implementer` | `sonnet` | Edits plus checks, inside an agreed scope |
| `reviewer` | `opus` | Read-only review gate |

Always pick one of these or pass an explicit `model` on the `Agent` call. Use Opus only for review and architecture. On this machine `~/.claude/settings.json` maps the aliases: `haiku` to `zai/glm5.3` (via `ANTHROPIC_DEFAULT_HAIKU_MODEL`), `sonnet` to `claude-sonnet-5-5`, `opus` to `claude-opus-5-5`. So `scout` and any `model: haiku` task actually run on GLM 5.3.

The three agent definitions (`scout`, `implementer`, `reviewer`) live in `.claude/agents/`, which is local-only on the owner's machine: it is excluded via `.git/info/exclude` and never committed (owner decision 2026-10-18). A fresh clone must recreate them or pass an explicit `model` on every `Agent` call.

The owner's global `~/.claude/settings.json` also sets `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` (2026-10-18). Per the Claude Code docs (https://code.claude.com/docs/en/sub-agents, "Choose a model"), the model resolution order on v2.1.251+ is: the per-invocation `model` parameter, then the agent's `model` frontmatter, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main conversation's model. So the variable only catches subagents with no model of their own (for example `general-purpose`) and does not override `scout` or `reviewer`. It does NOT change the built-in `Explore` and `Plan`: they follow the main model unless `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` is set, which would also flatten the custom agents, so do not set it. The rule stands: prefer the project agents or an explicit model, and do not use the built-in `Explore` or `Plan`.

Use this loop only when a mistake would surface late: work that spans several files, touches a data shape, or sits near a red line (AI layer, keys, storage, grading). A one-file copy change is faster to do than to delegate.

## 2. Which agent for which task

1. **Hard or complex work goes to `pi` (GPT) or a Sonnet subagent.** Concurrency, state machines, design trade-offs, multi-file changes without an existing machine check (anything like the audio player).
2. **`agy` `gemini-3.8-flash` through `pi` is the default for three kinds of work, and it should be used heavily (owner decision 2026-10-18: its quota is large).** (a) Web search and online research. (b) Gathering reference material. (c) Copy and corpus work in Chinese, English and French: app i18n (en + zh), French learning content (sample reading texts, example sentences, exercise corpora), marketing and README copy. It also takes simple machine-checkable work: mechanical replacements, doc lines, edits from given source text, moving i18n keys, where a byte comparison, `i18n:check`, a test or a build decides right or wrong. Before dispatching, write down what "done right" means: as a script check where one exists, otherwise the output rules below.
3. **Cited research on `agy` runs with `PI_THINKING=high`** (the script's default), with concrete questions. At `medium` it has produced claims without sources.
4. **Never `gemini-3.1-pro`.** Unverified, and hard tasks belong to `pi` or Sonnet anyway.
5. **If `pi` is rate-limited, wait for it or give the task to Sonnet. Never downgrade a hard task to `agy`.** Simple tasks are already on `agy` and are unaffected.
6. **No multi-file code implementation on `agy`.** There is no evidence it does that well.
7. **`agy` is not sandboxed** (section 8). Give it a throwaway directory or a worktree, never the lead's checkout, and never secrets.

Rules for `agy` output:

- **Research** cites a URL for every claim and marks uncertain ones. Treat the report as leads and spot-check claims against the source.
- **Copy and corpus drafts** come back as files in the throwaway directory or `.pi-runs/<task>/`. The lead (or a Sonnet worker) integrates them into the repo; `agy` does not edit the lead's checkout.
- **Locale copy** keeps every key and `{{placeholder}}` intact and passes `bun run i18n:check`.
- **French or any sample text** records its source and its licence or public-domain status. Never invent a source or a passage (CLAUDE.md: never invent data).
- **Tone** follows `PRODUCT.md`: plain, no hype, no claims about exams or scores.

Whoever did it, verification is the same (section 5), and `agy` output gets the stricter review.

### Checking budgets before dispatching (`magpie quota`)

`magpie quota [<provider>]` (read-only, instant) shows what is left of every subscription, plan and key balance; `--json` for scripts, `magpie quota history` for trends, `magpie usage 7d` and `magpie sessions` for what was spent. **The percentages are how much of a window is USED**, with `↻` marking when it resets. Check it before a large dispatch and before any Opus-heavy review round: when the Claude windows are nearly used, route implementation to pi (`openai-codex/gpt-6.1-sol`, the `codex` lines), research and copy to agy (Gemini, checked with `agy -p "/usage"`), and keep the lead's own turns short. Snapshot 2026-10-18: Claude Pro 5h 0% / 7d 100% used (resets Wed 07:59); Codex Plus 5h 0% / 7d 35%; z.ai lite 5h 1%; DeepSeek balance 7.83 CNY. The Claude Team account is the one the lead session runs on. Magpie shows a saved Claude account that is not the one in use from a cache only and does not re-read it on a timer, so the Team line can be a day old (`readDeferred`, `asOf`); the owner refreshes it by naming the account in the Magpie app, after which `magpie quota claude` shows the fresh reading (2026-10-18 16:39: Team 5h 23% used, resets 21:10; 7d 21% used, resets Oct 25 00:00). Check the `as of` time before trusting a Claude line, and cross-check spend with `magpie usage today` (today: this lead session made 934 calls, about 40 USD at list price, with cache reads of 166M tokens dominating; Sonnet 623 calls, Opus 79 calls from subagents). The lead's own long context is the biggest Claude cost: keep turns short, hand off with `docs/HANDOFF.md` and start a fresh session per phase instead of letting one session grow. A zero here means the subscription is exhausted for that window, not that the tool is broken.

### External reviewer: Gemini 4 Argon

Owner decision 2026-10-18.

- **Role.** Second-opinion reviewer and advisor next to the in-house Opus `reviewer`, for design, plan and diff review where a different model family is wanted. Read-only: it never edits. Its verdict is advice; the lead spot-checks each finding against the code before acting. Model id through pi: `antigravity/gemini-4-argon` (agy itself exposes `gemini-4-argon-low|medium|high`).
- **The quota is tight. Check it before every use** with `cd /tmp && agy -p "/usage"` (read-only, instant, no model call). The output is tab-separated lines, for example:

  ```text
  Gemini Models	Weekly Limit Remaining	100%	<reset time>
  Gemini Models	Five Hour Limit Remaining	...
  Claude and GPT models	Weekly Limit Remaining	1%	...
  Gemini 4 Argon	Gemini 4 Argon Weekly Limit	96%	2026-10-24T00:47:35Z
  ```

- **Budget.** Measured 2026-10-18: one trivial smoke call (reply two words, thinking high) cost about 1% of the Argon weekly limit, so the budget is roughly tens of real reviews per week, not hundreds.
- **When to use it.** Only at real review gates (a plan before big work, a diff before merge), never for routine lookups. If the Argon weekly limit is below 20%, use it only for the most important gate and use the Opus `reviewer` otherwise. If it is at 0 or the call fails, fall back to the `reviewer` and say so in the report; never silently skip a review.
- **Other quotas.** The Gemini family (3.8 flash and so on) has its own, larger limit (the `Gemini Models` weekly and five-hour lines); research and copy go there. The `Claude and GPT models` line is the quota for Claude and GPT models reached through agy and was at 1% weekly: do not route work to `antigravity/claude-*` or `antigravity/gpt-oss-*`.
- **How to run a review.** Give it the artifacts, not a summary: the spec, the full `git diff` and the raw check output. Put the diff and every file it needs into a throwaway directory or worktree, and run `scripts/pi-dispatch.sh <throwaway dir or worktree> antigravity/gemini-4-argon <prompt-file> <log>`. The prompt asks for the in-house reviewer's format (end of section 6): `Verdict` PASS or FAIL, then per finding `file:line`, the rule broken and the consequence, with no rewrites. agy is not sandboxed (section 8): never run it in the lead's checkout, never pass secrets.

## 3. Models

The owner's rules, reconciled with `pi --list-models` on 2026-10-18 (pi 1.3.0, agy 1.4.2). "Listed" means the catalog shows the ID. It does not mean the credentials work; smoke-test before relying on one (section 8).

| Use | Model ID | Listed | Notes |
| --- | --- | --- | --- |
| First choice for implementation (owner decision 2026-10-18, to spare Claude tokens) | `openai-codex/gpt-6.1-sol` | yes | Smoke-tested 2026-10-18 through `scripts/pi-dispatch.sh`: answered "smoke ok" in about 6 s, exit 0. Default for every implementation worker; the Claude `implementer` subagent (Sonnet) is the fallback when pi is rate-limited or for tiny doc edits |
| Previous recorded choice | `openai-codex/gpt-5.6-sol` | yes | Still listed; use it if gpt-6.1-sol is unavailable |
| Second choice | `zai/glm-5.3` | yes | |
| Usable, not preferred | `minimax-cn/MiniMax-M3`, `minimax-cn/MiniMax-M2.7` | yes | |
| Simple, well-specified implementation (owner decision 2026-10-24, to spare Claude, GPT and GLM quota) | `magpie/deepseek/deepseek-flash` | yes | The provider is `magpie` and the id is `deepseek/deepseek-flash` (two slashes); pi routes it through the magpie gateway. Smoke-tested 2026-10-24 through `scripts/pi-dispatch.sh`: answered "smoke ok" in about 3 s. **Not** `deepseek/deepseek-flash`, which is the direct `deepseek` provider named in the Never row below. Check `magpie quota deepseek` (prepaid balance) before a run |
| Simple / research work | `antigravity/gemini-3.8-flash` | yes | Only through `scripts/pi-dispatch.sh` (it loads the agy-lean extension) |
| Never | anything `deepseek/*` as a *provider* (the direct `deepseek` API; the magpie route above is the allowed one); `commandcode/*` | deepseek yes, commandcode no | commandcode had no balance and is no longer listed |
| Never | `gemini-3.1-pro` | only as `google/gemini-3.1-pro-preview` | |
| Review gate, quota-gated | `antigravity/gemini-4-argon` | yes | Read-only second opinion; check `agy -p "/usage"` first (section 2) |
| Never route | `antigravity/claude-*`, `antigravity/gpt-oss-*` | yes | Their shared agy quota was at 1% weekly (section 2) |
| Ask before using | `magpie/*`, `huggingface/*` | yes | Listed, but no owner rule covers them |

Always pass `--model <provider>/<id>`. pi's own default is `antigravity/gemini-3.8-flash`, so a call without `--model` silently runs Gemini.

## 4. Commands

### Read-only review (non-agy models)

```bash
pi -p -ne --no-session --model openai-codex/gpt-6.1-sol --tools read,grep,find,ls "<review task>"
```

Run from the checkout to be reviewed. `--tools read,grep,find,ls` restricts pi's own tools. It does **not** make an `agy` run read-only: agy executes its native tools (including `run_command`) itself, outside pi's tool layer. Also, under `-ne` the antigravity provider is not loaded at all. So agy research goes through the script below, in a throwaway worktree.

### Implementation, and every agy task: an isolated worktree plus the script

```bash
task=<short-name>
mkdir -p .pi-runs/$task
git worktree add -b $task ../relire-wt/$task HEAD   # branch = the task name: at most three hyphenated words, no slash or prefix
git -C ../relire-wt/$task log -1   # must be the commit you expect
ln -s "$PWD/node_modules" ../relire-wt/$task/node_modules
# write the prompt to .pi-runs/$task/prompt.md (template in section 6)
nohup scripts/pi-dispatch.sh ../relire-wt/$task openai-codex/gpt-6.1-sol \
  "$PWD/.pi-runs/$task/prompt.md" "$PWD/.pi-runs/$task/log" 5400 >/dev/null 2>&1 &
# agy: same, with antigravity/gemini-3.8-flash; another effort: PI_THINKING=medium scripts/pi-dispatch.sh ...
```

What the script does: runs `pi -p -ne --no-session --model <id> --thinking ${PI_THINKING:-high}` inside the worktree under `timeout` (default 5400 s). If no process in pi's tree holds an established TCP connection within 48 s it kills and retries, at most 5 times (exit 124 when it gives up). It refuses an empty prompt file and a model without `<provider>/`. For `antigravity/*` it adds `-e ~/.pi/agent/extensions/agy-lean.ts`. `PI_EXT=1` allows extensions; only use it on a task you can afford to see hijacked.

Clean up after merging or discarding: `git worktree remove ../relire-wt/$task && git branch -D $task` (older worker branches are still named `pi/<task>`).

## 5. How results come back, and the merge gate

- **pi's own output appears only at the end** (`-p` prints the final answer when it finishes). The script writes `[watchdog] attempt N` lines before pi starts and exit/kill lines after, so a log with only watchdog lines is normal while it runs. Judge liveness by sockets in the process tree, CPU time and worktree file changes (section 8).
- **The truth is the worktree, not the log:** `git -C ../relire-wt/$task log main..HEAD`, `git -C ../relire-wt/$task status`, and the uncommitted report file the prompt asked for. A run that ended early (rate limit, timeout) may still have valid commits and uncommitted edits. Look before assuming nothing was done.
- **Prompts, logs and reports live in the lead's checkout under `.pi-runs/<task>/`** (gitignored), passed as absolute paths. Do not put them inside the worktree: a new worktree checks out the committed `.gitignore`, and anything there can be committed by a worker.
- **The lead never merges worker output without re-running the checks itself**, in the worktree, from the lead's own shell:

```bash
bun run typecheck && bun run lint && bun run test && bun run i18n:check && bun run format:check && bun run build
~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html   # must print []
```

Browser automation is exceptional for necessary critical frontend/backend, browser-persistence or backup/restore risks not covered by unit tests. Prefer an existing focused spec; add coverage only for a necessary uncovered risk, not for UI changes alone. Owner-manual visual acceptance is separate, without automated theme/viewport/focus/animation/screenshot matrices. Full E2E requires an explicit owner request or a separately justified broad integration need, never a default merge/batch gate. Any authorized run follows section 7.

  Then read the full diff against the plan: does it match the plan, did docs and `CHANGELOG.md` change with the behaviour, is a rule met in letter but broken in spirit, did the scope grow, is claimed evidence real evidence. For a behavioral regression, prefer a focused unit test that demonstrates the broken behavior; do not stash user work or require browser red proof for UI-only changes.
- **Code and tests come from different models (owner rule, 2026-10-25).** One model that writes both can bend the tests to pass. The implementer leaves existing assertions alone except what keeps `typecheck` green; new or changed unit tests and all e2e are written by a second worker on another model (e2e: `openai-codex/gpt-6.1-sol`) from the plan's acceptance lines, not from the implementer's reasoning. A pure refactor writes no test and edits none: the lead rejects a test diff in it. The lead reads every test diff for weakened or fitted assertions.
- **Two review rounds, then escalate.** If implementer and reviewer have not converged after two rounds, stop and give the user both sides verbatim plus your own judgment. A dispute that does not converge usually means the plan is ambiguous, and changing the plan is the user's decision.
- `agy` reports are leads, not findings. Verify every claim against the source before using it.

## 6. Worker prompt template

pi loads relire's `AGENTS.md` (context-file discovery covers `AGENTS.md` and `CLAUDE.md`; `CLAUDE.md` only imports `AGENTS.md`), but **not** `.claude/rules/*.md`, which only Claude Code auto-loads. agy-lean is told to read repo rules, but does not inherit them. Name the rule files in the prompt. In the template, `<worktree>` is the absolute path of the task's worktree and `<lead-checkout>` the absolute path of the lead's own checkout; fill both in before dispatching.

```markdown
You are the implementer for one task in Relire, working in the git worktree <worktree> on branch <task>.

## Read first
- CLAUDE.md, then docs/conventions.md ("Code style" and "Git names"), then: <docs/merge-plan.md §N, docs/architecture.md section, ...>
- Area rules for the files you touch: .claude/rules/<ui|ai-layer|storage|speech|i18n|typescript>.md
- The plan: <path>. Do exactly these steps: <steps>. Scope: only <files/dirs>.

## Red lines
- Every user-visible string goes through t(), with the key in both src/locales/en.json and zh.json.
- Never write, print or commit an API key, token or credential. Do not read .env files or ~/.pi, ~/.gemini, ~/.config credentials.
- Never invent data: no sample stats, fake scores or fallback AI answers. Empty means empty; failures show the real error.
- Nothing has shipped: write no backward-compatibility, legacy-fallback or migration code for unreleased states, and no defensive code for cases that cannot happen. Add an abstraction only when a second real caller exists. When unsure, take the smaller change and report the question instead of building options.
- No complexity for a speculative or very unlikely race or security edge case (extra locks, guards, capture-phase listeners, retries, sanitising of trusted data): if you think one is needed, do not add it; stop and report the concrete failure, how likely it is and what the code would cost, and let the owner decide (docs/conventions.md, Code style). Do not widen scope for theoretical robustness.
- AI calls go through src/services/ai; prompt wording lives in template files, never in TypeScript.
- Comments and commit messages in English; commit messages are `type(scope): summary` (feat, fix, docs, chore, refactor, test). Chinese only in zh.json and *.zh.txt prompts.
- A change a user could notice gets one line in CHANGELOG.md (Unreleased) in the same commit.
- Bun only. Do not run bun install / bun add; node_modules is a symlink to the main checkout. A new dependency needs the user: stop and report.
- Commit on this branch only, staging files by name (never git add -A or git add .). Do not push, open a PR or merge. This overrides the ship-change skill's push step.
- Do not run browsers/Playwright or start servers unless explicitly authorized below. Preserve owner servers on 5173/8787. Stop only servers you started.
- UI visual acceptance belongs only to the owner, manually; no automatic UI/E2E/full-suite gate or theme/viewport/focus/animation/screenshot matrix. Unit tests cover logic. Browser automation is exceptional for necessary critical frontend/backend, persistence or backup/restore risk not covered by units; prefer an existing focused spec and add coverage only for a necessary uncovered risk. Full E2E needs an explicit owner request or separately justified broad integration need.
- [Include only if the task explicitly allows one risk-justified focused E2E run:] Risk and existing spec: <why units are insufficient; spec/name>. Playwright starts its own dev server on 5174 (playwright.config.ts webServer), and port 5174 may belong to another checkout. This run is permitted only after `lsof -iTCP:5174 -sTCP:LISTEN` prints nothing; run it as `CI=1 bunx playwright test e2e/<spec>.spec.ts -g "<name>"` so it never reuses a foreign server. One run at a time across checkouts, no second server; if the port is busy, stop and report.
- If the plan is ambiguous or wrong, stop and report. Out-of-scope problems: write them down, do not fix them.

## Checks to run
bun run typecheck, bun run lint, bun run test, bun run i18n:check, bun run format:check.

## Report
Write <lead-checkout>/.pi-runs/<task>/report.md (never inside <worktree>; do not commit it):
1. Steps done and not done, with commit hashes.
2. Files changed.
3. Raw output of each check, not a summary. Failures shown as failures.
4. What you did not run or could not verify. Say it plainly; never imply a check ran.
5. Anything you noticed and left alone.
```

For a reviewer, replace the task with: the plan path, the diff (or the branch to diff), the raw check output, and "Answer `Verdict: pass` or `Verdict: fail`. For each failure give `file:line`, the rule or plan step it breaks, and what it will cause. Do not propose fixes and do not edit files. A pass with zero findings is a valid outcome."

## 7. Worktree rules for Relire

- Worktrees go **outside** the repo (`../relire-wt/<task>`). `bun test` and `oxlint .` scan recursively, so a nested worktree gets swept into the lead's checks. `.works/` belongs to the user; do not reuse it without asking.
- **Create worktrees by hand from the current HEAD** (`git worktree add -b <branch> ../relire-wt/<task> HEAD`), check `git log -1` there, and give the worker the absolute path. Do not rely on the Agent tool's `isolation: "worktree"` (section 8).
- No `.env` or secret file is needed in a worktree; Relire's keys live in the user's browser. Symlink `node_modules` from the main checkout. Because it is shared, nothing may install into it from a worktree.
- **Never two executors on the same file at the same time.** Split tasks by file before dispatching.
- **Static/unit checks are the normal gate; E2E is exceptional (owner decision 2026-10-20).** Run `bun run test` plus typecheck, lint, format, i18n and build. Browser automation is reserved for necessary critical frontend/backend, browser persistence or backup/restore risk that units do not cover; prefer existing focused specs and grow coverage only for a necessary uncovered risk. UI changes alone do not trigger E2E; visual acceptance is owner-manual only, not an assertion matrix or screenshot gate. Full E2E only on explicit owner request or separately justified broad integration need, never by default at batch/phase assembly. Preserve unrelated legacy coverage; isolate an observed failure rather than restarting a full run.
- **Workers run no browsers or servers unless explicitly authorized; any authorized E2E uses the free-port guard and `CI=1`. One run at a time across all checkouts.** `playwright.config.ts` serves on port 5174 with `reuseExistingServer: !process.env.CI`, so a dev server left on 5174 by another checkout gets tested silently instead of yours. Before e2e: `lsof -iTCP:5174 -sTCP:LISTEN` must print nothing. Workers do not run Playwright unless their task explicitly allows it, and then with the port check and `CI=1` (template, section 6).
- Untracked user files in the main checkout (such as `.impeccable/critique/` or `.pi/`) do not exist in a worktree; do not copy them in unless the task needs them.

## 8. Pitfalls

- **Extensions hijack tasks. Always use `-ne`** (the script does). Installed delegation extensions have taken over a real implementation task, launched a child agent that failed, and implemented nothing. A small smoke task never triggers the delegation, so "a small task worked" proves nothing about a large one.
- **`pi auth check` can lie.** It only checks that a local credential exists; the server can still reject it, and a rejection can also be temporary. Smoke-test before concluding either way: `pi -p -ne --no-session --model <id> --tools read "Reply with one word: ready"`. A run that exits 1 within seconds with no changes is the symptom.
- **The agy route through `pi` works here (smoke test 2026-10-18, pi 1.3.0, agy 1.4.2).** `scripts/pi-dispatch.sh /tmp/agy-smoke antigravity/gemini-3.8-flash <prompt> <log> 120` answered "smoke ok" in about 7 s, exit 0. The log shows `[watchdog] attempt 1 ...`, the answer, then `[watchdog] exit 0 ...`. Same on 2026-10-18 for `antigravity/gemini-4-argon`: `scripts/pi-dispatch.sh /tmp/agy-smoke antigravity/gemini-4-argon <prompt> <log> 120` answered "smoke ok" in about 15 s, exit 0.
- **`isolation: "worktree"` on the Agent tool can branch from an old base.** On 2026-10-18 it created a worktree 83 commits behind HEAD, so the worker's tests, docs and file paths did not match and its commit could not be applied. Create worktrees by hand from HEAD (section 7).
- **Never print API keys or tokens.** Do not run `pi auth print-api-key` or `pi auth print-bearer-token`. Error output can contain partly masked credentials; delete such logs after reading them.
- **Two kinds of stall:**
  - *Startup hang:* process alive, CPU time barely moving, no network connection, no file changes in the worktree. The script's 48 s watchdog catches this; for anything outside the script, wrap it in `timeout`.
  - *Usage limit:* a message such as "You have hit your usage limit… try again in N min", exit 1, possibly before the report was written. Committed work stands; uncommitted edits stay in the worktree.
- **A long agy turn dies with `agy stream stalled: no events for 120s` (exit 1, no output).** The limit is in the `@tian.zuo/pi-antigravity` provider (`lib/agy-client.ts`), not in `agy-lean` or the repo, and a thinking-heavy task (a long generation at `PI_THINKING=high`) is silent for more than that. Do not lower the thinking effort to get around it (that costs quality): raise the budget with environment variables, which `pi-dispatch.sh` passes through: `AGY_STALL_TIMEOUT_MS` (default 120000, `0` disables) and `AGY_TURN_TIMEOUT_MS` (default 600000, the whole turn); the script's own `timeout` argument must be larger still. Measured 2026-10-19: a 3 KB topic at `high` with the defaults stalled twice in a row (and once at `medium`); a tiny read-and-write task took about 70 s even at `medium`, so this model's thinking latency is high. With `PI_THINKING=high AGY_STALL_TIMEOUT_MS=840000 AGY_TURN_TIMEOUT_MS=1500000` the same three topics all succeeded, 7 to 8 minutes each.
- **Judge liveness by evidence, not by the process existing or the log.** Under the script the log holds only `[watchdog]` lines until pi exits, so it says nothing about progress. Look at established TCP sockets anywhere in the process tree (`lsof -a -i TCP -p <pid>` for each descendant; agy opens its sockets in a grandchild with its own process group, so `lsof -g` misses them), CPU time rising (`ps -o time= -p <pid>`), and files changing in the worktree (`git status`, mtimes).
- **Prompt paths must be absolute** (the script resolves them; a hand-written command may not). An empty prompt can make pi exit 0 having done nothing; the script refuses an empty file.
- **Nothing is sandboxed.** agy's headless mode runs with `--dangerously-skip-permissions`; its four-tool allowlist trims features, it is not a sandbox, and `run_command` can run any shell command as the user. pi's `bash` is unrestricted too. A worktree isolates file edits, not reads: either agent can reach any absolute path. Do not hand them tasks near credentials. Official `agy --sandbox` is untested here.
- **Launch background runs with `nohup` from the top-level session, not from a subagent.** A subagent's background process can die when the subagent ends.
- **Model aliases can mislead.** `~/.claude/settings.json` env such as `ANTHROPIC_DEFAULT_HAIKU_MODEL` remaps what a Claude subagent's `model: haiku` actually runs (today: GLM 5.3, section 1). Check the env before trusting a subagent's model name or the name in its commit trailer.
