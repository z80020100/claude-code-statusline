#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { readConfig, writeConfig, configPath } = require("../lib/config.js");

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`\x1b[38;5;114m\u2713\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    console.log(`\x1b[38;5;167m\u2717\x1b[0m ${name}`);
    console.log(`  ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withTmpHome(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
  try {
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

// ── configPath ───────────────────────────────────────

test("configPath defaults to ~/.claude/claude-code-statusline.json", () => {
  assert(
    configPath() ===
      path.join(os.homedir(), ".claude", "claude-code-statusline.json"),
    "default path mismatch",
  );
});

test("configPath honors home override", () => {
  assert(
    configPath("/tmp/x") === "/tmp/x/.claude/claude-code-statusline.json",
    "home override ignored",
  );
});

// ── readConfig ───────────────────────────────────────

test("readConfig returns empty object when file is missing", () => {
  withTmpHome((tmp) => {
    const cfg = readConfig({ home: tmp });
    assert(
      typeof cfg === "object" && Object.keys(cfg).length === 0,
      "expected {}",
    );
  });
});

test("readConfig returns empty object on invalid JSON", () => {
  withTmpHome((tmp) => {
    fs.mkdirSync(path.join(tmp, ".claude"));
    fs.writeFileSync(configPath(tmp), "not json");
    assert(Object.keys(readConfig({ home: tmp })).length === 0, "expected {}");
  });
});

test("readConfig returns empty object when JSON is not a plain object", () => {
  withTmpHome((tmp) => {
    fs.mkdirSync(path.join(tmp, ".claude"));
    fs.writeFileSync(configPath(tmp), "[1, 2, 3]");
    assert(Object.keys(readConfig({ home: tmp })).length === 0, "expected {}");
  });
});

test("readConfig parses valid JSON", () => {
  withTmpHome((tmp) => {
    fs.mkdirSync(path.join(tmp, ".claude"));
    fs.writeFileSync(configPath(tmp), '{"icons":"nerd"}');
    assert(readConfig({ home: tmp }).icons === "nerd", "icons not parsed");
  });
});

// ── writeConfig ──────────────────────────────────────

test("writeConfig creates file with given values", () => {
  withTmpHome((tmp) => {
    writeConfig({ icons: "nerd" }, { home: tmp });
    assert(readConfig({ home: tmp }).icons === "nerd", "icons not persisted");
  });
});

test("writeConfig creates ~/.claude when missing", () => {
  withTmpHome((tmp) => {
    writeConfig({ icons: "nerd" }, { home: tmp });
    assert(fs.existsSync(path.join(tmp, ".claude")), ".claude not created");
  });
});

test("writeConfig merges with existing config", () => {
  withTmpHome((tmp) => {
    writeConfig({ icons: "nerd" }, { home: tmp });
    writeConfig({ futureKey: 1 }, { home: tmp });
    const cfg = readConfig({ home: tmp });
    assert(cfg.icons === "nerd", "existing key lost");
    assert(cfg.futureKey === 1, "new key not added");
  });
});

test("writeConfig with null value deletes the key", () => {
  withTmpHome((tmp) => {
    writeConfig({ icons: "nerd" }, { home: tmp });
    writeConfig({ icons: null }, { home: tmp });
    assert(!("icons" in readConfig({ home: tmp })), "key not deleted");
  });
});

test("writeConfig writes pretty-printed JSON with trailing newline", () => {
  withTmpHome((tmp) => {
    writeConfig({ icons: "nerd" }, { home: tmp });
    const raw = fs.readFileSync(configPath(tmp), "utf8");
    assert(raw.includes("\n"), "expected pretty-printed output");
    assert(raw.endsWith("\n"), "expected trailing newline");
  });
});

test("writeConfig leaves no leftover tmp files", () => {
  withTmpHome((tmp) => {
    writeConfig({ icons: "nerd" }, { home: tmp });
    const leftovers = fs
      .readdirSync(path.join(tmp, ".claude"))
      .filter((f) => f.includes(".tmp"));
    assert(leftovers.length === 0, `leftover: ${leftovers.join(",")}`);
  });
});

test("writeConfig returns the merged config", () => {
  withTmpHome((tmp) => {
    const result = writeConfig({ icons: "nerd" }, { home: tmp });
    assert(result.icons === "nerd", "return value missing icons");
  });
});

// ── summary ──────────────────────────────────────────

console.log();
if (failed) {
  console.log(`\x1b[38;5;167m${failed} test(s) failed.\x1b[0m`);
} else {
  console.log(`\x1b[38;5;114mAll tests passed.\x1b[0m`);
}

process.exit(failed ? 1 : 0);
