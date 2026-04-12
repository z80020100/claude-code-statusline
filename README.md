# claude-code-statusline

[![Node.js](https://img.shields.io/badge/Node.js-≥20-green)](https://nodejs.org/) [![npm](https://img.shields.io/npm/v/@z80020100/claude-code-statusline)](https://www.npmjs.com/package/@z80020100/claude-code-statusline)

[English](https://github.com/z80020100/claude-code-statusline/blob/main/README.md) | [繁體中文](https://github.com/z80020100/claude-code-statusline/blob/main/README.zh-TW.md) | [日本語](https://github.com/z80020100/claude-code-statusline/blob/main/README.ja.md)

Custom status line for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — model info, context usage gradient bar, token stats, cost, git status, and rate limits.

![Demo](https://raw.githubusercontent.com/z80020100/claude-code-statusline/main/assets/claude-code-statusline-demo.png)

## Features

- **Context usage gradient bar** — 4-zone color spectrum from green to red
- **Token and cost tracking** — input/output tokens, cache hit ratio, session cost
- **Session timing** — wall-clock and API duration side by side
- **Git integration** — branch, dirty flag, worktree indicator, diff stats vs main
- **Rate limit monitoring** — current (5h) and weekly (7d) usage with reset times
- **Sandbox indicator** — shows whether sandbox mode is off, on, or auto
- **Path compression** — long paths auto-shorten to fit within 80 columns
- **Zero runtime dependencies** — Node.js built-ins only

## Installation

```sh
npm install -g @z80020100/claude-code-statusline
```

## Setup

```sh
claude-code-statusline setup
```

This writes the `statusLine` entry to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "claude-code-statusline"
  }
}
```

To remove:

```sh
claude-code-statusline setup --uninstall
```

## Display Layout

All fields at maximum width:

![All fields](https://raw.githubusercontent.com/z80020100/claude-code-statusline/main/assets/claude-code-statusline-simulation.png)

The status line renders up to 6 lines — each constrained to 80 visible columns:

| Line | Content                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | Version, sandbox mode, session name and ID                                                        |
| 2    | Model name, effort level, context usage bar with percentage, last updated time                    |
| 3    | Token counts (in/out), cache hit %, cost, session/API duration, lines added/removed, 200K warning |
| 4    | Project directory, git branch, dirty flag, worktree indicator, diff vs main                       |
| 5    | Current working directory (only when different from project root)                                 |
| 6    | Rate limit usage — current (5h) and weekly (7d) with reset times                                  |

### Color Zones

Context and rate limit bars use a 4-zone gradient:

| Range   | Color | Meaning  |
| ------- | ----- | -------- |
| 0–49%   | Green | Normal   |
| 50–69%  | Gold  | Moderate |
| 70–89%  | Coral | Elevated |
| 90–100% | Red   | Critical |

## How It Works

Claude Code pipes a JSON object to the `statusLine` command via stdin on each render cycle. The JSON contains the current session state (model, tokens, cost, workspace, rate limits, etc.). This tool parses it and returns ANSI-colored lines to stdout.

Design decisions:

- **Zero dependencies** — only Node.js built-ins (`fs`, `path`, `os`, `child_process`)
- **Git caching** — branch and diff stats are cached for 5 seconds to avoid repeated subprocess calls
- **Settings caching** — effort level and sandbox mode use mtime-based caching to skip redundant file reads
- **80-column constraint** — enforced by automated tests; long paths are compressed automatically
- **256-color ANSI** — consistent rendering across terminals; Claude brand orange uses 24-bit true color

## Requirements

| Dependency  | Tier 1 (CI-tested)                  | Tier 2 (best-effort) |
| ----------- | ----------------------------------- | -------------------- |
| Node.js     | >= 20                               | 18                   |
| Claude Code | >= 2.1.80 (for `rate_limits` field) |                      |

## Development

```sh
git clone https://github.com/z80020100/claude-code-statusline.git
cd claude-code-statusline
npm install                 # also enables pre-commit hooks via prepare

npm run check               # lint + format check + width check + CLI tests
npm run fix                 # auto-fix lint and format issues
npm test                    # width check + CLI tests only
npm run lint                # ESLint + shellcheck + actionlint
npm run simulate            # render worst-case status line with width report
npm run ci:local            # run CI workflow locally via act (requires Docker)
```

## License

[MIT](LICENSE)
