#!/usr/bin/env node

// CLI integration tests.
// Usage: node test/cli.js
//   Runs all tests and exits with code 1 on failure.

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI = path.join(__dirname, "..", "bin", "claude-code-statusline.js");
const PKG = require("../package.json");

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

function run(args = [], opts = {}) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf8",
    timeout: 10000,
    ...opts,
  });
}

function withTmpHome(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-test-"));
  try {
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

// ── --version ────────────────────────────────────────

test("--version prints package version", () => {
  assert(run(["--version"]).trim() === PKG.version, "version mismatch");
});

test("-v prints package version", () => {
  assert(run(["-v"]).trim() === PKG.version, "version mismatch");
});

// ── --help ───────────────────────────────────────────

test("--help prints complete help output", () => {
  const out = run(["--help"]);
  assert(out.includes(`${PKG.name} v${PKG.version}`), "missing name/version");
  assert(out.includes(PKG.description), "missing description");
  assert(out.includes("Usage:"), "missing Usage:");
  assert(out.includes(PKG.author), "missing author");
  assert(out.includes(PKG.license), "missing license");
});

test("-h prints help", () => {
  assert(run(["-h"]).includes("Usage:"), "missing Usage:");
});

// ── stdin render ─────────────────────────────────────

test("stdin with valid JSON renders model name", () => {
  const input = JSON.stringify({ model: { display_name: "Test Model" } });
  assert(run([], { input }).includes("Test Model"), "missing model name");
});

test("stdin with invalid JSON exits silently", () => {
  const out = run([], { input: "not json" });
  assert(out === "", `expected empty output but got "${out}"`);
});

// ── setup / uninstall ────────────────────────────────

test("setup creates settings.json with statusLine", () => {
  withTmpHome((tmp) => {
    run(["setup"], { env: { ...process.env, HOME: tmp } });
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(
      settings.statusLine?.command === "claude-code-statusline",
      "statusLine.command not set",
    );
    assert(settings.statusLine?.type === "command", "statusLine.type not set");
  });
});

test("setup reports already configured on second run", () => {
  withTmpHome((tmp) => {
    const env = { ...process.env, HOME: tmp };
    run(["setup"], { env });
    assert(
      run(["setup"], { env }).includes("Already configured"),
      "missing already-configured message",
    );
  });
});

test("setup --uninstall removes statusLine", () => {
  withTmpHome((tmp) => {
    const env = { ...process.env, HOME: tmp };
    run(["setup"], { env });
    run(["setup", "--uninstall"], { env });
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(!settings.statusLine, "statusLine should be removed");
  });
});

test("setup --uninstall on empty settings reports no changes", () => {
  withTmpHome((tmp) => {
    assert(
      run(["setup", "--uninstall"], {
        env: { ...process.env, HOME: tmp },
      }).includes("No statusLine setting found"),
      "missing no-setting message",
    );
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
