---
description: Switch claude-code-statusline icon mode or show current mode
argument-hint: [unicode|nerd]
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/claude-code-statusline.js":*)
---

Run this command exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/claude-code-statusline.js" icons $ARGUMENTS
```

Show the CLI output verbatim. With no argument, the CLI prints the current mode and the config path. With `unicode` or `nerd`, it writes the new mode to `~/.claude/claude-code-statusline.json`.
