---
description: Switch claude-code-statusline icon mode or show current mode
argument-hint: [unicode|nerd]
allowed-tools: Bash(claude-code-statusline:*)
---

Run this command exactly:

```bash
claude-code-statusline icons $ARGUMENTS
```

Show the CLI output verbatim. With no argument, the CLI prints the current mode and the config path. With `unicode` or `nerd`, it writes the new mode to `~/.claude/claude-code-statusline.json`. If you see "command not found", run `/claude-code-statusline:setup` first to install the CLI.
