# Relire launch checklist

This document is for the first public launch of Relire. Keep product development and distribution work separate: ship a small, stable release, then deliberately create discovery.

## Repository metadata

Recommended description:

> Open-source French reading & pronunciation trainer for TCF Canada — close reading, IPA, shadowing, AI pronunciation feedback and spaced repetition. Browser-only PWA.

Recommended topics:

`french`, `french-learning`, `language-learning`, `tcf-canada`, `pronunciation`, `french-pronunciation`, `shadowing`, `ipa`, `spaced-repetition`, `cefr`, `pwa`, `gemini`

Recommended website:

> https://royisme.github.io/relire/

Recommended social preview: use a clean crop of `docs/media/reader.jpg` or a purpose-built 1280×640 image showing the reader and word-analysis panel.

## v0.1 launch

Before posting publicly:

- Merge the discovery/Pages PR and verify the live demo.
- Create a GitHub release named `v0.1.0`.
- Add the website URL, description and topics in repository settings.
- Set a social preview image.
- Make sure the README's first screen contains the value proposition, live demo and one strong screenshot.
- Open 2–4 concrete issues for roadmap items so the repository looks maintained and has obvious contribution entry points.

Suggested release title:

> Relire v0.1 — French close reading and pronunciation practice

Suggested release summary:

> First public release of Relire, an open-source, browser-only French reading and pronunciation trainer for TCF Canada learners. Read real articles, inspect words and sentence grammar in context, practise shadowing, get AI pronunciation feedback, and review saved vocabulary with spaced repetition. Your learning data stays in the browser and you bring your own Gemini API key.

## Launch copy

### Reddit / language-learning communities

**Title**

> I built an open-source French close-reading + pronunciation trainer for TCF Canada

**Body**

> I’m preparing French for TCF Canada and wanted something between a dictionary and a full course: a tool where I can read real articles, tap unfamiliar words, break down difficult sentences, shadow them, and get pronunciation feedback without moving between several apps.
>
> I built Relire for that workflow and released it as an open-source browser PWA. It includes context-aware word explanations and IPA, sentence grammar breakdown, shadowing guidance, pronunciation feedback, and spaced-repetition vocabulary review.
>
> It runs locally in the browser, has no account or app server, and uses your own Gemini API key for AI features.
>
> Live demo: https://royisme.github.io/relire/
>
> GitHub: https://github.com/royisme/relire
>
> I’d especially value feedback from French learners on whether the close-reading and shadowing workflow is actually useful.

### Hacker News / developer communities

**Title**

> Show HN: Relire – local-first French reading and pronunciation trainer

**Body**

> Relire is an open-source, browser-only PWA for French close reading and pronunciation practice. It lets learners inspect words and sentences in context, generate grammar explanations, practise shadowing, receive pronunciation feedback, and review vocabulary with SM-2.
>
> There is no application backend or account. Data is stored in IndexedDB/local storage, AI calls go directly from the browser to Gemini with the user’s own key, and generated explanations/audio are cached locally.
>
> Demo: https://royisme.github.io/relire/
>
> Source: https://github.com/royisme/relire
>
> The project came from my own TCF Canada study workflow. I’m interested in feedback on both the learning UX and the local-first/BYOK architecture.

### 中文社区 / 小红书 / V2EX

**标题**

> 我把自己的 TCF Canada 法语精读流程做成了一个开源工具：Relire

**正文**

> 我学法语时一直有一个问题：读文章要查词、查语法，练跟读又要切到别的工具，最后很难形成连续的学习流程。
>
> 所以我做了 Relire：读真实法语文章时，可以直接点单词看语境释义、IPA 和动词变位；点句子看翻译和语法拆解；然后直接做影子跟读并获得发音反馈。生词可以保存下来，用间隔重复复习。
>
> 它完全在浏览器运行，不需要注册账号，学习数据存在本机，AI 功能使用自己的 Gemini API Key。
>
> 在线体验：https://royisme.github.io/relire/
>
> GitHub：https://github.com/royisme/relire
>
> 目前主要针对 TCF Canada 的阅读和发音训练。如果你也在学法语，我更想听到真实使用后的反馈，而不是单纯功能建议。

## After launch

For the first two weeks, prefer visible product improvements over silent refactors. Turn useful feedback into small issues and releases, reply to every substantive discussion, and post meaningful release updates rather than repeatedly reposting the same launch link.

Good distribution targets after the first launch include language-learning communities, TCF/TEF communities, Chinese-speaking Canadian immigration/French-learning communities, Show HN/V2EX, and relevant awesome-language-learning lists.
