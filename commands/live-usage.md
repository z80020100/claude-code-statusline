---
description: Switch claude-code-statusline live usage display on/off or show current state
argument-hint: [on|off]
allowed-tools: Bash(claude-code-statusline:*)
disable-model-invocation: true
---

Run this command exactly:

```bash
claude-code-statusline live-usage $ARGUMENTS
```

Show the CLI output verbatim. With no argument the CLI prints the live usage display state and the config path. Pass `on` or `off` to toggle. When enabled the status line adds a dedicated line with the per-model weekly window (e.g. Fable) and extra usage credit spend. State is written to `~/.claude/claude-code-statusline.json`. If you see "command not found" then run `/claude-code-statusline:setup` first to install the CLI.
