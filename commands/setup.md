---
description: Configure or remove claude-code-statusline in ~/.claude/settings.json
argument-hint: [--uninstall]
---

If `$ARGUMENTS` is empty, run this command exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/claude-code-statusline.js" setup --command "node \"${CLAUDE_PLUGIN_ROOT}/bin/claude-code-statusline.js\""
```

If `$ARGUMENTS` is `--uninstall`, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/claude-code-statusline.js" setup --uninstall
```

Show the CLI output verbatim. The CLI handles writing the `statusLine` entry, idempotency, and the overwrite prompt for any existing different `statusLine`.
