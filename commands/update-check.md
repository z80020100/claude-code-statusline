---
description: Switch claude-code-statusline update checks on/off or show current states
argument-hint: [claude|statusline] [on|off]
allowed-tools: Bash(claude-code-statusline:*)
disable-model-invocation: true
---

Run this command exactly:

```bash
claude-code-statusline update-check $ARGUMENTS
```

Show the CLI output verbatim. With no argument, the CLI prints both update check states and the config path. There are two checks: `claude` (Claude Code update check) and `statusline` (claude-code-statusline self-update check). Pass `on` or `off` to toggle both at once, or `<name> on` / `<name> off` to toggle one. State is written to `~/.claude/claude-code-statusline.json`. If you see "command not found", run `/claude-code-statusline:setup` first to install the CLI.
