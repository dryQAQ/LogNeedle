# 贡献指南

[English summary](#english-summary)

感谢你愿意花时间。LogNeedle 的产品形态很窄，所以贡献的门槛也很清楚：**只要不破坏"单个 HTML 文件、零依赖、零外链、不联网"这四条，什么都好谈。**

---

## 你可以贡献什么

| 类型 | 说明 |
|---|---|
| Bug 报告 | 用 [Bug 表单](.github/ISSUE_TEMPLATE/bug_report.yml)。**不要粘贴真实日志内容**，请脱敏或改写成合成样例 |
| 功能建议 | 用 [功能表单](.github/ISSUE_TEMPLATE/feature_request.yml)。先说清楚"你在什么场景下卡住了"，再说方案 |
| **界面翻译（当前最有价值）** | 目前只有中文。文案是自包含的，没有框架挡路，翻译 PR 的工作量确实很小 |
| 文档 | README、本文件、`CHANGELOG.md`；发现描述与真实行为不一致直接改 |
| 代码 | 匹配逻辑、编码识别、性能、结果展示、测试工具 |

## 四条硬约束（不可协商）

1. **不加任何依赖**：不要 npm 包、不要 CDN、不要第二份运行时代码。用户拿到的是一个文件，这点不能破。
2. **不加任何外链**：`http(s)://`、`<link>`、`<script src>`、`@import`、`url(...)`、`<img src>` 一律不行。CI 用 `grep` 拦截。
3. **不用 `<script type="module">`**：`file://` 下模块脚本会被 CORS 拦掉，页面直接白屏。
4. **不用 `new Worker`、`fetch`、`XMLHttpRequest`、`WebSocket`**：Worker 脚本在 `file://` 下同样加载不了；网络 API 则违背"不联网、不上传"的承诺，也破坏了离线可用性。

并发靠主线程异步调度 + 分块让出，这是刻意的取舍，不是待办事项。

## 仓库结构

```
logneedle.html              产品本体：单文件，内联 CSS + 两段 <script>（id="core" / id="app"）
tools/check.mjs             静态 + 核心逻辑校验（CI 跑这个）
tools/screenshot.ps1        headless Edge/Chrome 端到端 + 生成截图（Windows 已验证）
tools/screenshot.mjs        同一套端到端的跨平台版本（本机未验证）
tools/mkdemo.py             重新生成 examples/sample-logs/ 演示数据（Python 3，可选）
examples/sample-logs/       演示日志：UTF-8、GBK、超长行 JSONL、子目录、二进制、无命中文本
docs/screenshot*.png        README 里的两张截图（由 screenshot 脚本生成，请勿手工替换成别的图）
.github/                    CI、Pages 部署、Issue/PR 模板
```

`logneedle.html` 内部：

- `<script id="core">`：**纯函数**，不碰 DOM。编码探测、行切分、匹配、结果收集、流式解码、导出格式化、自检套件都在这里，并挂在 `window.__LOGX__` 上。
- `<script id="app">`：只做 DOM 与事件绑定，所有状态在 `state` 里。

这条边界很重要：因为 core 不碰 DOM，同一套用例可以同时在浏览器里（「自检」按钮）和 Node 里（`tools/check.mjs`）运行。

## 本地跑测试

```bash
# 1) 静态 + 核心逻辑（CI 同款，零依赖，秒级）
node tools/check.mjs logneedle.html

# 2) 浏览器里的真实端到端（会写 docs/screenshot*.png）
pwsh -File tools/screenshot.ps1            # Windows，已验证
node tools/screenshot.mjs                  # 跨平台版本，本机未验证

# 3) 手工看一眼
#    双击 logneedle.html → 点「选择日志目录」→ 选 examples/sample-logs/ → 试 ERROR / timeout / 错误
```

`tools/check.mjs` 会做这些事：抽取两段脚本并做语法检查、跑 29 项核心自检、校验 DOM id 契约、确认没有外链与禁用 API、测匹配吞吐。任何一项失败都会以非零码退出。

## 如何加一个自检用例

自检套件在 core 里（`selfTest()`），一个用例会被两个地方同时跑到：页面内的「自检」按钮和 `node tools/check.mjs`。所以**加用例是给这个项目加测试的首选方式**。

```js
// core 的 selfTest() 内部
add('一句话说明这个用例在防什么', 实际值 === 期望值, '失败时要打印的细节');
```

规则：

- **core 里不能碰 DOM**（`document`、`window` 的浏览器专属成员），否则 Node 侧会挂。要用 DOM 的断言请写进 `tools/screenshot.ps1`。
- **不要引入新的编码编码器**：JS 的 `TextEncoder` 只能编 UTF-8。GBK/Big5 这类编码的测试夹具用十六进制字符串，例如：
  ```bash
  python -c "print('中文日志'.encode('gbk').hex())"
  ```
  然后把 hex 填进用例，用 `new TextDecoder('gb18030')` 解出来断言。
- 用例名用中文没问题（现有 29 项都是中文），但**细节字符串尽量带上实测值**，方便定位。
- 加完跑一次 `node tools/check.mjs logneedle.html`，确认总数上升且全绿。

## 如何改界面

- 结构在 `<body>` 里，样式是同一文件里的 `<style>`。**不要**引入外部字体、图标库或图片；图标用字符或内联 SVG。
- 颜色请用已有的 CSS 变量，并且保证 `prefers-color-scheme: dark` 下依然可读。
- **id 契约是强制的**：`tools/check.mjs` 会检查 `app` 脚本里每个 `$('id')` / `getElementById('id')` 都能在 HTML 里找到同 id 的元素。改了 id 必须两边一起改。
- 文案保持简洁务实的中文；不要用"革命性""极致"这类词。
- 大改动（折行、卡片布局、工具栏）请附**改动前后截图**，并把截图拖进 PR。

## 如何只改文案做 i18n

这是当前 Roadmap 第一项，欢迎认领。建议路径：

1. 用户可见的中文分布在两处：`<body>` 里的标签/说明，以及 `<script id="app">` 里的提示语、状态栏、toast、汇总文案。
2. 在 `app` 脚本里建一个 `STR` 表（例如 `const STR = { zh: {...}, en: {...} }`），把字面量替换成查表；语言选择存 `localStorage`，并同步更新 `<html lang="...">`。
3. **不要**把翻译拆成外部 JSON 或额外的 `.js` 文件——那会同时破坏单文件与离线两条承诺。
4. 纯逻辑的断言（语言切换后取到的串非空、回退到默认语言）可以加进 core 自检；凡是需要读写 DOM 的断言，写进 `tools/screenshot.ps1`。
5. 别忘了改两个 README 顶部的语言切换链接。

## 提交信息与 PR 流程

提交信息用 `type(scope): 祈使句摘要`：

```
feat(i18n): add English UI strings and a language switch
fix(wrap): re-measure cards after expanding a collapsed card
docs(readme): clarify the Firefox folder-picker path
```

常见 `type`：`feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `chore`。
常见 `scope`：`core` / `app` / `i18n` / `match` / `encoding` / `wrap` / `ci` / `docs` / `tools`。

流程：

1. Fork，从 `main` 开分支（如 `feat/english-ui`）。
2. 改代码 + 补测试 + 更新 `CHANGELOG.md` 的 `[Unreleased]`。
3. 本地跑 `node tools/check.mjs logneedle.html`，CI 必须绿。
4. 发 PR，按 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md) 勾选清单；界面改动附前后截图。
5. 维护者 review，一般用 squash merge。

会被**礼貌拒绝**的 PR：引入依赖或构建步骤、往产品文件里加外链、用 ES module / Worker / 网络 API、把 `logneedle.html` 拆成多文件、在 PR 或 issue 里粘贴真实日志内容。

## 重跑截图脚本

README 里的两张图由脚本生成，改了界面就该重跑：

```bash
pwsh -File tools/screenshot.ps1 -Html logneedle.html -Demo examples/sample-logs -Out docs
node tools/screenshot.mjs logneedle.html examples/sample-logs docs   # 等价命令
```

- `tools/screenshot.ps1`：**在 Windows + Edge 上验证过**。它会临时建 `.browser-profile/`（已 gitignore），并覆盖 `docs/screenshot.png` 与 `docs/screenshot-gbk.png`。
- `tools/screenshot.mjs`：跨平台等价版本，用 Node 内置 WebSocket 连 CDP，在本机**未验证**。如果你在 Linux/macOS 上跑通了，请在 PR 里说明环境，好把这个"未验证"标记去掉。

## 许可

本项目以 MIT 发布（见 [LICENSE](LICENSE)）。提交贡献即表示你同意你的贡献同样以 MIT 授权发布。

---

## English summary

LogNeedle is one self-contained `logneedle.html`. Contributions are welcome, but four rules are non-negotiable:

1. **No dependencies** — no npm packages, no CDN, no second runtime file.
2. **No external references** — no `http(s)://`, `<link>`, `<script src>`, `@import`, `url(...)`. CI greps for these.
3. **No `<script type="module">`** — modules are blocked by CORS on `file://` and the page would go blank.
4. **No `new Worker`, `fetch`, `XMLHttpRequest` or `WebSocket`** — workers cannot load from `file://` either, and network APIs would break the offline, nothing-leaves-your-machine promise.

Concurrency is deliberately done with async scheduling on the main thread plus chunked yielding.

**Testing:** run `node tools/check.mjs logneedle.html` (static + the same 29-case core suite the in-page 自检 button runs, no dependencies). For a real browser pass, `pwsh -File tools/screenshot.ps1` (verified on Windows, drives headless Edge/Chrome over CDP and regenerates the README screenshots); `node tools/screenshot.mjs` is the cross-platform equivalent, not yet verified on this machine.

**The best first contribution is the English UI** — the strings are self-contained, there is no framework in the way, and Roadmap item 1 has been waiting for a volunteer.

**Add a self-test case** when you fix a bug: the suite lives in the `core` script and runs both in the browser and in Node. Keep `core` free of DOM access, and use hex fixtures for legacy encodings (`TextEncoder` is UTF-8 only — generate bytes with Python, paste the hex, decode with `new TextDecoder('gb18030')`).

**Commits:** `type(scope): imperative summary` (feat / fix / docs / refactor / perf / test / chore).

**PRs** that add dependencies, build steps, external references, ES modules, Workers or network calls will be closed — those constraints are the product. Never paste real log content into an issue or PR; redact or synthesize it.

MIT licensed. By contributing you agree your contribution is released under the same license.
