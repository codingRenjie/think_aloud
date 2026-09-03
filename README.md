# Think Aloud · 嘎嘎作文

帮孩子把作文题**聊开**，再整理成一份自己认得出的大纲。不代写正文。

A chat-first writing scaffold for kids: talk through a prompt, then arrange your own outline. It will not write the essay for you.

在线试用：[thinkaloud.top](https://thinkaloud.top)

---

## 它解决什么

面对空白稿纸，最难的往往不是遣词造句，而是「不知道从哪说起」。Think Aloud 用轻松对话把零碎念头外化，再收敛成大纲，降低从 0 到 1 的恐惧。

它是脚手架，不是范文机器：只提问、提炼孩子说过的话、卡住时给一点启发。大纲由孩子自己拖拽胶囊排出来。

## 怎么用

1. **输入作文题**，点「开始构思」。
2. **聊一聊**：Agent 每次只说几句，跟着孩子的生活和感受往更具体处问。
3. **整理大纲**：把对话里提炼出的关键词「胶囊」拖成段落顺序，不需要的可以删掉。

对话和大纲保存在本机浏览器，可从首页历史继续。

## 本地运行

需要 Node.js 20+，以及 OpenAI 兼容的 API Key（例如 Moonshot / Kimi）。

```bash
git clone https://github.com/codingRenjie/think_aloud.git
cd think_aloud
cp .env.example server/.env   # 填入 OPENAI_API_KEY 等
npm install
npm run dev
```

浏览器打开开发服务器提示的地址即可（默认前端 Vite + 后端 `http://localhost:8787`）。

## 技术栈

| | |
|---|---|
| 前端 | React、Vite、Tailwind |
| 后端 | Node、Express，流式对话 |
| 数据 | 浏览器本地存储，不上传作文正文 |

---

面向中小学生的网页应用，手机和电脑浏览器都可以用。
