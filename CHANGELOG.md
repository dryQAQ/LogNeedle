# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. Planned work lives in the [Roadmap](README.md#roadmap).

## [1.0.0] - 2026-10-10

First public release. The product is `logneedle.html`: one self-contained HTML
file (~68 KB), no dependencies, no build step, no network access.

### Added

- **Directory sources** — File System Access API picker (Chromium), the system
  folder picker (every browser, via `webkitdirectory`), and drag & drop of a
  folder or individual files onto the page. All three skip the same list of
  non-log directories (`.git`, `node_modules`, `$RECYCLE.BIN`, …).
- **Keyword extraction** across every text file in the chosen folder, rendered
  as one collapsible card per file with line numbers, highlighted matches, the
  per-file hit count and the encoding that was detected for that file.
- **Matching options** — literal search (case-insensitive by default) or
  regular expressions, a case-sensitivity toggle, multi-keyword OR separated by
  spaces or `|`, and 0–10 lines of context around each hit.
- **Filtering** — sub-path filter, file globs (`*.log;*.txt`), and per-file
  binary detection (a NUL byte in the first 8 KB marks the file as binary, so
  dumps are skipped instead of producing garbage hits).
- **Result caps** — per-file and total line limits (defaults: 200 and 5000)
  with an explicit truncation marker, plus a stop button for long scans.
- **Per-file encoding detection** — UTF-8 with and without BOM, UTF-16LE/BE
  with BOM and by byte-distribution sniffing when the BOM is missing,
  GBK/GB18030, and Big5, with a manual override for those and for Shift_JIS,
  EUC-KR, UTF-16LE/BE and Windows-1252 when the browser exposes the label.
- **Large-file handling** — files above 8 MB are decoded as a stream in 1 MB
  chunks (multi-byte characters split across chunk boundaries are handled),
  keeping memory bounded; files up to 8 MB go into an LRU text cache with a
  192 MB budget, so searching the same folder with a new keyword skips disk I/O.
- **Three wrap modes** — auto / always / never. Auto measures each card's real
  overflow, so lines only wrap when they have to; it re-measures on window
  resize and on expand/collapse. Line numbers stay pinned while scrolling
  horizontally in "never" mode.
- **Output** — copy one file, copy all results, export TXT (UTF-8 with BOM, so
  Windows Notepad and Excel open it correctly) or JSON.
- **In-page self-test** (自检 button) covering 29 assertions, including GBK byte
  fixtures and streaming-decode edge cases.
- **Repository tooling** — `tools/check.mjs` (static + core-logic checks, 71
  assertions, no dependencies, used by CI) and `tools/screenshot.ps1` /
  `tools/screenshot.mjs` (headless Edge/Chrome end-to-end runs over CDP that
  also regenerate the README screenshots).
- **Example data** — `examples/sample-logs/` with a UTF-8 service log, a
  GBK-encoded Chinese log, a JSONL file with very long lines, a nested
  subdirectory, a binary file and a no-match text file.

### Known limitations

- The interface is Chinese only. English and other languages are the first
  roadmap item.
- No live following (`tail -f`): the folder is read once and searched in place.
- Compressed logs (`.gz`, `.zip`) are not supported — decompress first.
- A single multi-gigabyte file is out of scope; the browser tab becomes the
  bottleneck long before the tool does.
- No absolute-path input. A web page cannot read arbitrary paths from disk, so
  the folder is always picked or dropped, and only relative paths are shown.
- Firefox and Safari fall back to the system folder picker, which enumerates
  the whole tree up front, so very large folders feel slower to open there.
- Search history (last 10 searches) and the wrap preference are kept in
  `localStorage`; clearing site data clears them.
- The end-to-end script needs a local Edge or Chrome. On the machine used for
  this release it reports 19 of its 19 checks passing; see
  [Development and testing](README.md#development-and-testing).

[Unreleased]: https://github.com/dryQAQ/LogNeedle/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/dryQAQ/LogNeedle/releases/tag/v1.0.0
