#!/usr/bin/env node

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.join(__dirname, "..", "hooks", "sync-cli-version.js");
const PACKAGE_NAME = "@z80020100/claude-code-statusline";

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`\x1b[38;5;114m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    console.log(`\x1b[38;5;167m✗\x1b[0m ${name}`);
    console.log(`  ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeTree(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hook-test-"));
  fs.mkdirSync(path.join(root, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "claude-code-statusline", version }),
  );
  const dataDir = path.join(root, "data");
  const npmLog = path.join(root, "npm-call.txt");
  const fakeNpmDir = path.join(root, "bin");
  fs.mkdirSync(fakeNpmDir, { recursive: true });
  const tree = { root, dataDir, npmLog, fakeNpmDir };
  writeFakeNpm(tree);
  return tree;
}

function writeFakeNpm(tree, body) {
  const script = body ?? `printf '%s\\n' "$*" > "${tree.npmLog}"`;
  fs.writeFileSync(
    path.join(tree.fakeNpmDir, "npm"),
    `#!/usr/bin/env bash\n${script}\n`,
  );
  fs.chmodSync(path.join(tree.fakeNpmDir, "npm"), 0o755);
}

function runHook({ root, dataDir, fakeNpmDir }, extraEnv = {}) {
  const env = {
    ...process.env,
    PATH: `${fakeNpmDir}:${process.env.PATH || ""}`,
    CLAUDE_PLUGIN_ROOT: root,
    CLAUDE_PLUGIN_DATA: dataDir,
    ...extraEnv,
  };
  execFileSync(process.execPath, [HOOK], { env, timeout: 5000 });
}

// Wait long enough for the detached background worker to finish writing the
// log file. The fake npm exits instantly so one second is generous.
function waitForBackground() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function assertNpmInstalled(tree, version) {
  assert(fs.existsSync(tree.npmLog), "npm should have been invoked");
  const args = fs.readFileSync(tree.npmLog, "utf8").trim();
  const expected = `install -g ${PACKAGE_NAME}@${version}`;
  assert(args === expected, `unexpected npm args: ${args}`);
}

test("bootstrap: first run installs CLI via npm and records version", () => {
  const tree = makeTree("1.2.3");
  try {
    runHook(tree);
    waitForBackground();
    const stored = fs.readFileSync(
      path.join(tree.dataDir, "installed-version"),
      "utf8",
    );
    assert(stored === "1.2.3", `expected stored 1.2.3, got ${stored}`);
    assertNpmInstalled(tree, "1.2.3");
  } finally {
    cleanup(tree.root);
  }
});

test("no-op: matching stored version does not invoke npm", () => {
  const tree = makeTree("1.2.3");
  try {
    fs.mkdirSync(tree.dataDir, { recursive: true });
    fs.writeFileSync(path.join(tree.dataDir, "installed-version"), "1.2.3");
    runHook(tree);
    waitForBackground();
    assert(
      !fs.existsSync(tree.npmLog),
      "npm should not run when version matches",
    );
  } finally {
    cleanup(tree.root);
  }
});

test("mismatch: stored version differs triggers npm install of matching version", () => {
  const tree = makeTree("1.2.3");
  try {
    fs.mkdirSync(tree.dataDir, { recursive: true });
    fs.writeFileSync(path.join(tree.dataDir, "installed-version"), "1.0.0");
    runHook(tree);
    waitForBackground();
    const stored = fs.readFileSync(
      path.join(tree.dataDir, "installed-version"),
      "utf8",
    );
    assert(stored === "1.2.3", `expected stored 1.2.3, got ${stored}`);
    assertNpmInstalled(tree, "1.2.3");
  } finally {
    cleanup(tree.root);
  }
});

test("mismatch: failed npm install keeps previous version for retry", () => {
  const tree = makeTree("1.2.3");
  try {
    writeFakeNpm(tree, `printf '%s\\n' "$*" > "${tree.npmLog}"\nexit 1`);
    fs.mkdirSync(tree.dataDir, { recursive: true });
    fs.writeFileSync(path.join(tree.dataDir, "installed-version"), "1.0.0");
    runHook(tree);
    waitForBackground();
    const stored = fs.readFileSync(
      path.join(tree.dataDir, "installed-version"),
      "utf8",
    );
    assert(stored === "1.0.0", `expected stored 1.0.0, got ${stored}`);
    assert(fs.existsSync(tree.npmLog), "npm should have been invoked");
  } finally {
    cleanup(tree.root);
  }
});

test("missing CLAUDE_PLUGIN_ROOT exits silently", () => {
  const tree = makeTree("1.2.3");
  try {
    const env = {
      ...process.env,
      PATH: `${tree.fakeNpmDir}:${process.env.PATH || ""}`,
      CLAUDE_PLUGIN_DATA: tree.dataDir,
    };
    delete env.CLAUDE_PLUGIN_ROOT;
    execFileSync(process.execPath, [HOOK], { env, timeout: 5000 });
    waitForBackground();
    assert(
      !fs.existsSync(tree.npmLog),
      "npm should not run without plugin root",
    );
    assert(
      !fs.existsSync(path.join(tree.dataDir, "installed-version")),
      "no version should be stored without plugin root",
    );
  } finally {
    cleanup(tree.root);
  }
});

console.log();
if (failed) {
  console.log(`\x1b[38;5;167m${failed} test(s) failed.\x1b[0m`);
} else {
  console.log(`\x1b[38;5;114mAll tests passed.\x1b[0m`);
}

process.exit(failed ? 1 : 0);
