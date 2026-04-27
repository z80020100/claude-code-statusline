---
description: Configure or remove claude-code-statusline in ~/.claude/settings.json
argument-hint: [--uninstall]
allowed-tools: Bash(npm install -g @z80020100/claude-code-statusline:*), Bash(npm root -g:*), Bash(node:*)
disable-model-invocation: true
---

If `$ARGUMENTS` is `--uninstall`, run this command exactly:

```bash
node "$(npm root -g)/@z80020100/claude-code-statusline/bin/claude-code-statusline.js" setup --uninstall
```

Otherwise, run these commands exactly (installs the latest CLI from npm and runs setup via its resolved path, independent of PATH):

```bash
npm install -g @z80020100/claude-code-statusline
node "$(npm root -g)/@z80020100/claude-code-statusline/bin/claude-code-statusline.js" setup
```

Show the CLI output verbatim. The CLI handles writing the `statusLine` entry, idempotency, the overwrite prompt for any existing different `statusLine`, and a PATH warning when the resulting `command` would not be resolvable at status line render time.
