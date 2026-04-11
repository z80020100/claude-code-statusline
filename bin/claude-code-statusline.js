#!/usr/bin/env node

"use strict";

const arg = process.argv[2];

if (arg === "setup") {
  require("../lib/setup.js").run(process.argv.slice(3));
} else if (arg === "--version" || arg === "-v") {
  console.log(require("../package.json").version);
} else if (arg === "--help" || arg === "-h" || process.stdin.isTTY) {
  const pkg = require("../package.json");
  const repo = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  console.log(`${pkg.name} v${pkg.version}
${pkg.description}

Usage:
  claude-code-statusline                    Read JSON from stdin and render status line
  claude-code-statusline setup              Configure Claude Code to use this status line
  claude-code-statusline setup --uninstall  Remove status line configuration
  claude-code-statusline --help             Show this help message
  claude-code-statusline --version          Show version

Author:  ${pkg.author}
License: ${pkg.license}
Repository: ${repo}`);
} else {
  const fs = require("fs");
  const { render } = require("../lib/statusline.js");
  try {
    const data = JSON.parse(fs.readFileSync(0, "utf8"));
    const lines = render(data);
    for (const line of lines) {
      console.log(line);
    }
  } catch {
    // Silent fail — Claude Code expects no output on error
  }
}
