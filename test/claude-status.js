#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  COMPONENT_NAME,
  CLI_PATH,
  componentStatusFromResponse,
  peekStatus,
  reserveCheck,
  writeCache,
} = require("../lib/claude-status.js");

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-status-test-"));
  try {
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

function blockCacheDir(tmp) {
  const claudeDir = path.join(tmp, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, ".cache"), "blocker");
}

test("componentStatusFromResponse reads Claude Code status", () => {
  const status = componentStatusFromResponse({
    components: [
      { name: "Claude API (api.anthropic.com)", status: "operational" },
      { name: COMPONENT_NAME, status: "partial_outage" },
    ],
  });
  assert(status === "partial_outage", `expected partial_outage got ${status}`);
});

test("componentStatusFromResponse returns null when component is missing", () => {
  const status = componentStatusFromResponse({
    components: [{ name: "claude.ai", status: "operational" }],
  });
  assert(status === null, `expected null got ${status}`);
});

test("writeCache returns true on success", () => {
  withTmpHome((tmp) => {
    assert(
      writeCache({ checkedAt: 1, status: "operational" }, tmp) === true,
      "expected true",
    );
  });
});

test("reserveCheck returns false when cache directory is blocked", () => {
  withTmpHome((tmp) => {
    blockCacheDir(tmp);
    assert(reserveCheck({ home: tmp }) === false, "expected false");
  });
});

test("peekStatus spawns once when cache is stale", () => {
  withTmpHome((tmp) => {
    const calls = [];
    const result = peekStatus({
      home: tmp,
      spawnFn: (...args) => calls.push(args),
    });
    assert(calls.length === 1, `expected one spawn got ${calls.length}`);
    assert(calls[0][0] === tmp, `expected home arg ${tmp}`);
    assert(result.status === null, "expected no cached status");
  });
});

test("peekStatus returns cached status without spawning when cache is fresh", () => {
  withTmpHome((tmp) => {
    writeCache(
      {
        checkedAt: Date.now(),
        component: COMPONENT_NAME,
        status: "operational",
        ok: true,
      },
      tmp,
    );
    let spawnCount = 0;
    const result = peekStatus({
      home: tmp,
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(spawnCount === 0, `expected no spawn got ${spawnCount}`);
    assert(
      result.status === "operational",
      `expected operational got ${result.status}`,
    );
    assert(result.ok === true, "expected ok true");
  });
});

test("CLI_PATH resolves to the package bin", () => {
  const expected = path.resolve(
    __dirname,
    "..",
    "bin",
    "claude-code-statusline.js",
  );
  assert(CLI_PATH === expected, `expected ${expected}, got ${CLI_PATH}`);
  assert(fs.existsSync(CLI_PATH), `CLI_PATH does not exist: ${CLI_PATH}`);
});

console.log();
if (failed > 0) {
  console.log(`\x1b[38;5;167m${failed} test(s) failed\x1b[0m`);
  process.exit(1);
} else {
  console.log("\x1b[38;5;114mall tests passed\x1b[0m");
}
