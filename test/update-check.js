#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  writeCache,
  reserveCheck,
  peekUpdate,
  compareSemver,
  CLI_PATH,
} = require("../lib/update-check.js");

delete process.env.CLAUDE_STATUSLINE_UPDATE_CHECK;

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "update-check-test-"));
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

// ── writeCache / reserveCheck return value ───────────

test("writeCache returns true on success", () => {
  withTmpHome((tmp) => {
    assert(
      writeCache({ checkedAt: 1 }, tmp, "claude") === true,
      "expected true",
    );
  });
});

test("writeCache returns false when cache directory is blocked", () => {
  withTmpHome((tmp) => {
    blockCacheDir(tmp);
    assert(
      writeCache({ checkedAt: 1 }, tmp, "claude") === false,
      "expected false",
    );
  });
});

test("reserveCheck returns false when cache directory is blocked", () => {
  withTmpHome((tmp) => {
    blockCacheDir(tmp);
    assert(
      reserveCheck({ target: "claude", current: "2.0.0", home: tmp }) === false,
      "expected false",
    );
  });
});

// ── peekUpdate spawn gating ──────────────────────────

test("peekUpdate does not spawn when reservation fails", () => {
  withTmpHome((tmp) => {
    blockCacheDir(tmp);
    let spawnCount = 0;
    const result = peekUpdate({
      home: tmp,
      target: "claude",
      currentVersion: "2.0.0",
      configReader: () => ({ updateCheck: { claude: true } }),
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(spawnCount === 0, `expected no spawn got ${spawnCount}`);
    assert(result.available === false, "expected available false");
  });
});

test("peekUpdate spawns once with home propagated when reservation succeeds", () => {
  withTmpHome((tmp) => {
    const calls = [];
    peekUpdate({
      home: tmp,
      target: "claude",
      currentVersion: "2.0.0",
      configReader: () => ({ updateCheck: { claude: true } }),
      spawnFn: (...args) => calls.push(args),
    });
    assert(calls.length === 1, `expected one spawn got ${calls.length}`);
    assert(calls[0][0] === "claude", "expected target arg");
    assert(calls[0][1] === "2.0.0", "expected currentVersion arg");
    assert(calls[0][2] === tmp, `expected home arg ${tmp}, got ${calls[0][2]}`);
  });
});

test("peekUpdate skips spawn when cache is fresh", () => {
  withTmpHome((tmp) => {
    const cacheDir = path.join(tmp, ".claude", ".cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, "update-check-claude.json"),
      JSON.stringify({
        checkedAt: Date.now(),
        current: "2.0.0",
        latest: "2.0.0",
        ok: true,
      }),
    );
    let spawnCount = 0;
    peekUpdate({
      home: tmp,
      target: "claude",
      currentVersion: "2.0.0",
      configReader: () => ({ updateCheck: { claude: true } }),
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(spawnCount === 0, `expected no spawn got ${spawnCount}`);
  });
});

test("peekUpdate returns available=false for unknown target", () => {
  withTmpHome((tmp) => {
    let spawnCount = 0;
    const result = peekUpdate({
      home: tmp,
      target: "bogus",
      currentVersion: "2.0.0",
      configReader: () => ({ updateCheck: { bogus: true } }),
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(result.available === false, "unknown target must not be available");
    assert(spawnCount === 0, "unknown target must not spawn");
  });
});

// ── compareSemver ────────────────────────────────────

test("compareSemver orders core versions numerically", () => {
  assert(compareSemver("2.1.95", "2.1.96") === -1, "expected -1");
  assert(compareSemver("2.1.96", "2.1.95") === 1, "expected 1");
  assert(compareSemver("2.1.95", "2.1.95") === 0, "expected 0");
  assert(compareSemver("2.1.9", "2.1.10") === -1, "expected numeric not lex");
});

test("compareSemver pads missing core parts as zero", () => {
  assert(compareSemver("2", "2.0.0") === 0, "expected 0");
  assert(compareSemver("2.1", "2.1.1") === -1, "expected -1");
});

test("compareSemver treats pre-release as lower than release", () => {
  assert(
    compareSemver("2.1.95-beta.1", "2.1.95") === -1,
    "pre-release must be < release",
  );
  assert(
    compareSemver("2.1.95", "2.1.95-beta.1") === 1,
    "release must be > pre-release",
  );
});

test("compareSemver orders pre-release identifiers per semver", () => {
  assert(
    compareSemver("1.0.0-alpha", "1.0.0-alpha.1") === -1,
    "shorter < longer",
  );
  assert(
    compareSemver("1.0.0-alpha.1", "1.0.0-alpha.beta") === -1,
    "numeric < alpha",
  );
  assert(compareSemver("1.0.0-9", "1.0.0-10") === -1, "numeric not lexical");
  assert(compareSemver("1.0.0-rc.1", "1.0.0") === -1, "rc < release");
});

test("compareSemver ignores build metadata", () => {
  assert(compareSemver("2.1.95+build.1", "2.1.95") === 0, "build ignored");
  assert(compareSemver("2.1.95+a", "2.1.95+b") === 0, "build ignored both");
});

test("compareSemver treats numerically equal tokens as equal", () => {
  assert(compareSemver("1.01.0", "1.1.0") === 0, "leading zero core");
  assert(compareSemver("1.0.0-01", "1.0.0-1") === 0, "leading zero pre");
});

// ── spawn target ─────────────────────────────────────

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

// ── summary ──────────────────────────────────────────

console.log();
if (failed > 0) {
  console.log(`\x1b[38;5;167m${failed} test(s) failed\x1b[0m`);
  process.exit(1);
} else {
  console.log("\x1b[38;5;114mall tests passed\x1b[0m");
}
