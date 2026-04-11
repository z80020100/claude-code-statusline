#!/usr/bin/env node

"use strict";

if (process.argv[2] === "setup") {
  require("../lib/setup.js").run(process.argv.slice(3));
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
