#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

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

function readVersion(rel) {
  const file = path.join(__dirname, "..", rel);
  return JSON.parse(fs.readFileSync(file, "utf8")).version;
}

// ── version consistency ──────────────────────────────

test("package.json and .claude-plugin/plugin.json declare the same version", () => {
  const pkg = readVersion("package.json");
  const plugin = readVersion(".claude-plugin/plugin.json");
  assert(pkg, "package.json declares no version");
  assert(
    pkg === plugin,
    `version mismatch: package.json=${pkg} plugin.json=${plugin}`,
  );
});

// ── summary ──────────────────────────────────────────

console.log();
if (failed) {
  console.log(`\x1b[38;5;167m${failed} test(s) failed.\x1b[0m`);
} else {
  console.log(`\x1b[38;5;114mAll tests passed.\x1b[0m`);
}

process.exit(failed ? 1 : 0);
