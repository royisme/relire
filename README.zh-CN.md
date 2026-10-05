# Éclair Français

[English](README.md) · **简体中文**

像考试里遇到的那样读法语，读不懂的地方点一下就能查，而且不会丢掉上下文；读完还能开口练。Éclair Français 是一个自己部署的网页应用，面向备考 **TCF Canada** 的学习者，专注两项技能：**阅读**和**发音**。

> **它不是什么。** 它不覆盖听力和写作，没有 TCF 模考题，打分是 AI 的估计而不是官方成绩。它与 France Éducation international、IRCC 没有任何关联，也未获其认可。请把它和真题、老师配合使用。

## 能做什么

- **读 B1、B2、C1 的文章。** 内置三篇示例，也可以粘贴或导入自己的文章。字号和主题可调，朗读速度最低可到 0.5 倍。
- **点任何一个单词。** 查看词元、语境中的释义、IPA、动词时态、变位表和例句，一键加入生词本。
- **拆解难句。** 译文、句法成分、语法点、常见搭配，以及影子跟读指南（节奏群、联诵、语调）。
- **跟读并获得反馈。** 录下自己读句子的声音，得到总分，以及单个音素、联诵和语调的反馈。
- **用间隔重复复习生词。** 按 SM-2 算法安排今天该复习的词。
- **从当前文章生成练习。** 句子重组、口语跟读、语法填空。
- **中英文界面。** 界面和讲解可以在中文和英文之间切换。

你保存的所有内容（文章、生词、统计）都留在浏览器的本地存储里，可以在设置中导出和恢复备份。

## 快速开始

需要 Node 20.19 及以上（或 22.12 及以上），以及一个 [Gemini API key](https://aistudio.google.com/apikey)。

```bash
git clone https://github.com/royisme/relire.git
cd relire
npm install --legacy-peer-deps   # 或：bun install
cp .env.example .env             # 然后填写 GEMINI_API_KEY
npm run dev                      # http://localhost:3000
```

生产构建：

```bash
npm run build
npm start
```

也可以不设置 `GEMINI_API_KEY`，直接在应用的**设置**里填入 key，之后每次请求会由浏览器带上它。应用可以从浏览器菜单安装为 PWA。

### 隐私

单词、句子和你的录音会经由应用自己的服务器发送到 Gemini API，用来生成讲解、语音和评分。除此之外没有数据离开你的浏览器。如果你把它部署给别人用，他们的用量会计在你服务器上的 key 名下。

## 技术栈

React 19、Vite、Tailwind CSS 4、代理 Gemini 的 Express 服务器、i18next。`PRODUCT.md` 说明产品面向谁以及设计原则，`DESIGN.md` 是视觉规范，`CLAUDE.md` 是给贡献者的代码地图。

```
server.ts          Express 服务器，所有 Gemini 调用都在这里
src/App.tsx        应用状态和 localStorage 持久化
src/components/    每个页面或浮层一个文件
src/utils/srs.ts   SM-2 调度
```

`npm run lint` 运行 TypeScript 检查。目前还没有自动化测试。

## 参与贡献

欢迎提 issue 和 PR。修改界面前请先阅读 `PRODUCT.md` 和 `DESIGN.md`，所有面向用户的文案都要同时写进 `src/i18n/locales/en.json` 和 `zh.json`。

## 许可证

[MIT](LICENSE)
