#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  isEnabled,
  currentLiveUsage,
  setLiveUsage,
} = require("../lib/live-usage.js");

delete process.env.CLAUDE_STATUSLINE_LIVE_USAGE;

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withTmpHome(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "live-usage-test-"));
  try {
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

function withEnv(value, fn) {
  const prev = process.env.CLAUDE_STATUSLINE_LIVE_USAGE;
  process.env.CLAUDE_STATUSLINE_LIVE_USAGE = value;
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env.CLAUDE_STATUSLINE_LIVE_USAGE;
    } else {
      process.env.CLAUDE_STATUSLINE_LIVE_USAGE = prev;
    }
  }
}

// ── isEnabled ────────────────────────────────────────

test("isEnabled defaults to false with no config", () => {
  withTmpHome((tmp) => {
    assert(isEnabled({ home: tmp }) === false, "expected false");
  });
});

test("isEnabled reads liveUsage true from config", () => {
  withTmpHome((tmp) => {
    assert(
      isEnabled({ home: tmp, configReader: () => ({ liveUsage: true }) }) ===
        true,
      "expected true",
    );
  });
});

test("isEnabled requires strict boolean true", () => {
  withTmpHome((tmp) => {
    assert(
      isEnabled({ home: tmp, configReader: () => ({ liveUsage: "true" }) }) ===
        false,
      "expected false for non-boolean",
    );
  });
});

test("isEnabled returns false when config reader throws", () => {
  withTmpHome((tmp) => {
    assert(
      isEnabled({
        home: tmp,
        configReader: () => {
          throw new Error("boom");
        },
      }) === false,
      "expected false",
    );
  });
});

test("env override 1/true enables regardless of config", () => {
  withTmpHome((tmp) => {
    const off = () => ({ liveUsage: false });
    withEnv("1", () => {
      assert(
        isEnabled({ home: tmp, configReader: off }) === true,
        "expected true for 1",
      );
    });
    withEnv("true", () => {
      assert(
        isEnabled({ home: tmp, configReader: off }) === true,
        "expected true for true",
      );
    });
  });
});

test("env override 0/false disables regardless of config", () => {
  withTmpHome((tmp) => {
    const on = () => ({ liveUsage: true });
    withEnv("0", () => {
      assert(
        isEnabled({ home: tmp, configReader: on }) === false,
        "expected false for 0",
      );
    });
    withEnv("false", () => {
      assert(
        isEnabled({ home: tmp, configReader: on }) === false,
        "expected false for false",
      );
    });
  });
});

test("empty env falls through to config", () => {
  withTmpHome((tmp) => {
    withEnv("", () => {
      assert(
        isEnabled({ home: tmp, configReader: () => ({ liveUsage: true }) }) ===
          true,
        "expected config fallthrough",
      );
    });
  });
});

// ── currentLiveUsage / setLiveUsage ──────────────────

test("currentLiveUsage defaults to off", () => {
  withTmpHome((tmp) => {
    assert(currentLiveUsage({ home: tmp }) === false, "expected off");
  });
});

test("setLiveUsage persists and currentLiveUsage reads it", () => {
  withTmpHome((tmp) => {
    setLiveUsage("on", { home: tmp });
    assert(currentLiveUsage({ home: tmp }) === true, "expected on");
    setLiveUsage("off", { home: tmp });
    assert(currentLiveUsage({ home: tmp }) === false, "expected off");
  });
});

test("setLiveUsage rejects invalid value", () => {
  withTmpHome((tmp) => {
    let threw = false;
    try {
      setLiveUsage("yes", { home: tmp });
    } catch {
      threw = true;
    }
    assert(threw, "expected throw");
  });
});

// ── summary ──────────────────────────────────────────

console.log();
if (failed > 0) {
  console.log(`\x1b[38;5;167m${failed} test(s) failed\x1b[0m`);
  process.exit(1);
} else {
  console.log("\x1b[38;5;114mall tests passed\x1b[0m");
}
