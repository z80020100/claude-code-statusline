---
description: Configure or remove claude-code-statusline in ~/.claude/settings.json
argument-hint: [--uninstall]
allowed-tools: Bash(command -v claude-code-statusline:*), Bash(npm install -g @z80020100/claude-code-statusline:*), Bash(claude-code-statusline:*)
disable-model-invocation: true
---

If `$ARGUMENTS` is `--uninstall`, run this command exactly:

```bash
claude-code-statusline setup --uninstall
```

Otherwise, run this command exactly (auto-installs the CLI from npm if missing):

```bash
command -v claude-code-statusline >/dev/null 2>&1 || npm install -g @z80020100/claude-code-statusline && claude-code-statusline setup
```

Show the CLI output verbatim. The CLI handles writing the `statusLine` entry, idempotency, and the overwrite prompt for any existing different `statusLine`.
