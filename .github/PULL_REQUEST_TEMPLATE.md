## What does this change?

<!-- One or two sentences. Link the issue if there is one: Fixes #123 -->

## How was it tested?

<!-- The exact commands you ran and what they printed. -->

## Checklist

- [ ] `node tools/check.mjs logneedle.html` passes locally.
- [ ] No new dependency, build step, or tooling requirement for users.
- [ ] `logneedle.html` gained no external reference: no `http(s)://`, no `<link>`, no `<script src>`, no `@import`, no `url(...)`.
- [ ] No `<script type="module">`, no `new Worker`, no `fetch`/`XMLHttpRequest`/`WebSocket` — they break `file://` and the offline promise.
- [ ] Still a single self-contained file: nothing new sits next to `logneedle.html` at the repo root.
- [ ] UI changes come with before/after screenshots (drag them into this PR).
- [ ] `CHANGELOG.md` updated under `[Unreleased]` for anything user-visible.
- [ ] No real log content pasted anywhere in this PR — replaced with redacted or synthetic lines.
