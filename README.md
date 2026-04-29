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

Two equivalent paths — pick one. Both write a `statusLine` entry to `~/.claude/settings.json`.

### npm

```sh
npm install -g @z80020100/claude-code-statusline
claude-code-statusline setup
```

This writes `command: "claude-code-statusline"` (relies on PATH):

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

### Claude Code plugin

```sh
claude plugin marketplace add z80020100/claude-code-statusline
claude plugin install claude-code-statusline@claude-code-statusline
```

The slash command installs the latest `@z80020100/claude-code-statusline` from npm and writes the same `command: "claude-code-statusline"` entry. If npm's global bin directory is not on your PATH, the CLI prints a warning with instructions. Run it inside Claude Code:

```
/claude-code-statusline:setup
```

To remove the `statusLine` entry:

```
/claude-code-statusline:setup --uninstall
```

To fully uninstall the plugin and marketplace:

```sh
claude plugin uninstall claude-code-statusline@claude-code-statusline
claude plugin marketplace remove claude-code-statusline
```

## Icon Mode

Icons default to plain Unicode symbols for broad terminal compatibility.

CLI:

```sh
claude-code-statusline icons          # show current mode
claude-code-statusline icons nerd     # use Nerd Font icons
claude-code-statusline icons unicode  # use Unicode icons
```

Plugin slash command (equivalent):

```
/claude-code-statusline:icons
/claude-code-statusline:icons nerd
/claude-code-statusline:icons unicode
```

Both write `~/.claude/claude-code-statusline.json`. `CLAUDE_STATUSLINE_ICONS` still takes precedence when set.

## Update Check

The banner always shows both Claude Code and Statusline current versions. The update check toggles only control whether `→ vX.Y.Z` appears next to a version when the npm `latest` tag is newer. Both checks are off by default; each runs in a detached background process at most once per hour and caches the result under `~/.claude/.cache/`.

- **Claude Code update check** — watches `@anthropic-ai/claude-code`.
- **Statusline self-update check** — watches `@z80020100/claude-code-statusline`.

CLI:

```sh
claude-code-statusline update-check                  # show both states
claude-code-statusline update-check on               # enable both
claude-code-statusline update-check off              # disable both
claude-code-statusline update-check claude on        # enable Claude Code check
claude-code-statusline update-check claude off       # disable Claude Code check
claude-code-statusline update-check statusline on    # enable statusline self-check
claude-code-statusline update-check statusline off   # disable statusline self-check
```

Plugin slash command (equivalent):

```
/claude-code-statusline:update-check
/claude-code-statusline:update-check on
/claude-code-statusline:update-check off
/claude-code-statusline:update-check claude on
/claude-code-statusline:update-check claude off
/claude-code-statusline:update-check statusline on
/claude-code-statusline:update-check statusline off
```

Both write `~/.claude/claude-code-statusline.json` under the `updateCheck` key. `CLAUDE_STATUSLINE_UPDATE_CHECK` (`1` or `true` to enable both checks, otherwise disable) still takes precedence when set.

## Display Layout

All fields at maximum width:

![All fields](https://raw.githubusercontent.com/z80020100/claude-code-statusline/main/assets/claude-code-statusline-simulation.png)

The status line renders up to 7 lines — each constrained to 80 visible columns:

| Line | Content                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | Version banner: Claude Code and Statusline versions, plus `→ vX.Y.Z` per target when check is on  |
| 2    | Sandbox mode, session name and ID                                                                 |
| 3    | Model name, effort level, context usage bar with percentage, last updated time                    |
| 4    | Token counts (in/out), cache hit %, cost, session/API duration, lines added/removed, 200K warning |
| 5    | Project directory, git branch, dirty flag, worktree indicator, diff vs main                       |
| 6    | Current working directory (only when different from project root)                                 |
| 7    | Rate limit usage — current (5h) and weekly (7d) with reset times                                  |

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

Dev tooling (ESLint 10, lint-staged 16) requires Node >= 20.19. See `.nvmrc`.

```sh
git clone https://github.com/z80020100/claude-code-statusline.git
cd claude-code-statusline
npm install                 # also enables pre-commit hooks via prepare

npm run check               # lint + format check + width check + CLI tests
npm run fix                 # auto-fix lint and format issues
npm test                    # width check + CLI tests only
npm run lint                # ESLint + shellcheck + actionlint
npm run simulate            # render worst-case status line with width report
CLAUDE_STATUSLINE_ICONS=nerd npm run simulate  # render with Nerd Font glyphs
npm run ci:local            # run CI workflow locally via act (requires Docker)
```

## License

[MIT](LICENSE)
