---
description: Switch claude-code-statusline update checks on/off per target or show current states
argument-hint: [target] [on|off]
allowed-tools: Bash(claude-code-statusline:*)
disable-model-invocation: true
---

Run this command exactly:

```bash
claude-code-statusline update-check $ARGUMENTS
```

Show the CLI output verbatim. With no argument, the CLI prints the current state of every target and the config path. Targets currently supported: `claude` (Claude Code update check). Pass `<target> on`, `<target> off`, `all on`, or `all off` to toggle. State is written to `~/.claude/claude-code-statusline.json`. If you see "command not found", run `/claude-code-statusline:setup` first to install the CLI.
