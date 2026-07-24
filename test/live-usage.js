#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  isEnabled,
  currentLiveUsage,
  setLiveUsage,
  readToken,
  extractUsage,
  runBackgroundCheck,
  peekLiveUsage,
  writeCache,
} = require("../lib/live-usage.js");

delete process.env.CLAUDE_STATUSLINE_LIVE_USAGE;

let failed = 0;

function report(name, err) {
  if (!err) {
    console.log(`\x1b[38;5;114m✓\x1b[0m ${name}`);
    return;
  }
  failed++;
  console.log(`\x1b[38;5;167m✗\x1b[0m ${name}`);
  console.log(`  ${err.message}`);
}

function test(name, fn) {
  try {
    fn();
    report(name);
  } catch (err) {
    report(name, err);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    report(name);
  } catch (err) {
    report(name, err);
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

async function withTmpHomeAsync(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "live-usage-test-"));
  try {
    await fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = prev;
    }
  }
}

function cacheFilePath(home) {
  return path.join(home, ".claude", ".cache", "live-usage.json");
}

function readCacheJson(home) {
  return JSON.parse(fs.readFileSync(cacheFilePath(home), "utf8"));
}

const FIXTURE = {
  limits: [
    { kind: "session", percent: 12, resets_at: "2099-01-01T00:00:00Z" },
    { kind: "weekly_all", percent: 34, resets_at: "2099-01-02T00:00:00Z" },
    {
      kind: "weekly_scoped",
      percent: 0,
      resets_at: "2099-01-03T00:00:00Z",
      scope: { model: { id: null, display_name: "Fable" } },
    },
  ],
  spend: {
    used: { amount_minor: 0, currency: "USD", exponent: 2 },
    limit: { amount_minor: 5000, currency: "USD", exponent: 2 },
    percent: 0,
    enabled: true,
  },
  extra_usage: {
    is_enabled: true,
    used_credits: 0,
    monthly_limit: 5000,
    utilization: 0,
    currency: "USD",
    decimal_places: 2,
  },
};

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
    withEnv("CLAUDE_STATUSLINE_LIVE_USAGE", "1", () => {
      assert(
        isEnabled({ home: tmp, configReader: off }) === true,
        "expected true for 1",
      );
    });
    withEnv("CLAUDE_STATUSLINE_LIVE_USAGE", "true", () => {
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
    withEnv("CLAUDE_STATUSLINE_LIVE_USAGE", "0", () => {
      assert(
        isEnabled({ home: tmp, configReader: on }) === false,
        "expected false for 0",
      );
    });
    withEnv("CLAUDE_STATUSLINE_LIVE_USAGE", "false", () => {
      assert(
        isEnabled({ home: tmp, configReader: on }) === false,
        "expected false for false",
      );
    });
  });
});

test("empty env falls through to config", () => {
  withTmpHome((tmp) => {
    withEnv("CLAUDE_STATUSLINE_LIVE_USAGE", "", () => {
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

// ── extractUsage ─────────────────────────────────────

test("extractUsage reads scoped window and spend", () => {
  const { scoped, spend } = extractUsage(FIXTURE);
  assert(scoped !== null, "expected scoped");
  assert(scoped.label === "Fable", "expected Fable label");
  assert(scoped.percent === 0, "expected percent 0");
  assert(
    scoped.resetsAt === Math.floor(Date.parse("2099-01-03T00:00:00Z") / 1000),
    "expected epoch seconds resetsAt",
  );
  assert(spend !== null, "expected spend");
  assert(spend.usedMinor === 0, "expected usedMinor 0");
  assert(spend.limitMinor === 5000, "expected limitMinor 5000");
  assert(spend.percent === 0, "expected percent 0");
  assert(spend.exponent === 2, "expected exponent 2");
  assert(spend.currency === "USD", "expected USD");
});

test("extractUsage falls back to extra_usage when spend is absent", () => {
  const data = { ...FIXTURE, spend: undefined };
  const { spend } = extractUsage(data);
  assert(spend !== null, "expected spend from extra_usage");
  assert(spend.usedMinor === 0, "expected usedMinor 0");
  assert(spend.percent === 0, "expected utilization percent");
});

test("extractUsage returns null spend when disabled", () => {
  const data = {
    spend: { ...FIXTURE.spend, enabled: false },
    extra_usage: { ...FIXTURE.extra_usage, is_enabled: false },
  };
  const { spend } = extractUsage(data);
  assert(spend === null, "expected null spend");
});

test("extractUsage ignores scoped entries without display_name", () => {
  const data = {
    limits: [{ kind: "weekly_scoped", percent: 10, scope: { model: {} } }],
  };
  const { scoped } = extractUsage(data);
  assert(scoped === null, "expected null scoped");
});

test("extractUsage handles empty response", () => {
  const { scoped, spend } = extractUsage({});
  assert(scoped === null, "expected null scoped");
  assert(spend === null, "expected null spend");
});

// ── readToken ────────────────────────────────────────

const CREDS = JSON.stringify({ claudeAiOauth: { accessToken: "tok-abc" } });

test("readToken prefers the keychain reader", () => {
  withTmpHome((tmp) => {
    const token = readToken({ home: tmp, keychainReader: () => CREDS });
    assert(token === "tok-abc", "expected keychain token");
  });
});

test("readToken falls back to the credentials file", () => {
  withTmpHome((tmp) => {
    withEnv("CLAUDE_CONFIG_DIR", undefined, () => {
      const dir = path.join(tmp, ".claude");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, ".credentials.json"), CREDS);
      const token = readToken({ home: tmp, keychainReader: () => null });
      assert(token === "tok-abc", "expected file token");
    });
  });
});

test("readToken honors CLAUDE_CONFIG_DIR", () => {
  withTmpHome((tmp) => {
    const dir = path.join(tmp, "custom-config");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".credentials.json"), CREDS);
    withEnv("CLAUDE_CONFIG_DIR", dir, () => {
      const token = readToken({
        home: path.join(tmp, "elsewhere"),
        keychainReader: () => null,
      });
      assert(token === "tok-abc", "expected CLAUDE_CONFIG_DIR token");
    });
  });
});

test("readToken returns null when no source is available", () => {
  withTmpHome((tmp) => {
    withEnv("CLAUDE_CONFIG_DIR", undefined, () => {
      const token = readToken({ home: tmp, keychainReader: () => null });
      assert(token === null, "expected null");
    });
  });
});

test("readToken returns null on malformed credentials", () => {
  withTmpHome((tmp) => {
    assert(
      readToken({ home: tmp, keychainReader: () => "not json" }) === null,
      "expected null for bad JSON",
    );
    assert(
      readToken({ home: tmp, keychainReader: () => "{}" }) === null,
      "expected null for missing token",
    );
  });
});

// ── peekLiveUsage ────────────────────────────────────

test("peekLiveUsage returns null and skips spawn when disabled", () => {
  withTmpHome((tmp) => {
    let spawnCount = 0;
    const result = peekLiveUsage({
      home: tmp,
      configReader: () => ({ liveUsage: false }),
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(result === null, "expected null");
    assert(spawnCount === 0, "expected no spawn");
  });
});

test("peekLiveUsage spawns once when enabled with no cache", () => {
  withTmpHome((tmp) => {
    let spawnCount = 0;
    const result = peekLiveUsage({
      home: tmp,
      configReader: () => ({ liveUsage: true }),
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(spawnCount === 1, `expected one spawn got ${spawnCount}`);
    assert(result === null, "expected null before first fetch");
  });
});

test("peekLiveUsage returns cached data without spawning when fresh", () => {
  withTmpHome((tmp) => {
    writeCache(
      {
        checkedAt: Date.now(),
        ok: true,
        scoped: { label: "Fable", percent: 0, resetsAt: 1 },
        spend: null,
      },
      tmp,
    );
    let spawnCount = 0;
    const result = peekLiveUsage({
      home: tmp,
      configReader: () => ({ liveUsage: true }),
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(spawnCount === 0, "expected no spawn");
    assert(result?.scoped?.percent === 0, "expected cached scoped data");
  });
});

test("peekLiveUsage suppresses spawn during cooldown", () => {
  withTmpHome((tmp) => {
    writeCache(
      {
        checkedAt: 1,
        ok: false,
        scoped: { label: "Fable", percent: 0, resetsAt: 1 },
        spend: null,
        cooldownUntil: Date.now() + 60000,
      },
      tmp,
    );
    let spawnCount = 0;
    const result = peekLiveUsage({
      home: tmp,
      configReader: () => ({ liveUsage: true }),
      spawnFn: () => {
        spawnCount++;
      },
    });
    assert(spawnCount === 0, "expected no spawn during cooldown");
    assert(result?.scoped?.percent === 0, "expected stale data returned");
  });
});

// ── runBackgroundCheck (async) ───────────────────────

(async () => {
  await testAsync("runBackgroundCheck caches extracted usage", async () => {
    await withTmpHomeAsync(async (tmp) => {
      await runBackgroundCheck({
        home: tmp,
        tokenReader: () => "tok-secret-123",
        fetchFn: async () => FIXTURE,
      });
      const raw = fs.readFileSync(cacheFilePath(tmp), "utf8");
      const cache = JSON.parse(raw);
      assert(cache.ok === true, "expected ok true");
      assert(cache.scoped.label === "Fable", "expected scoped label");
      assert(cache.spend.usedMinor === 0, "expected spend cached");
      assert(!raw.includes("tok-secret-123"), "token must never be cached");
    });
  });

  await testAsync(
    "runBackgroundCheck keeps data when token is missing",
    async () => {
      await withTmpHomeAsync(async (tmp) => {
        writeCache(
          {
            checkedAt: 1,
            ok: true,
            scoped: { label: "Fable", percent: 10, resetsAt: 1 },
            spend: null,
          },
          tmp,
        );
        const result = await runBackgroundCheck({
          home: tmp,
          tokenReader: () => null,
          fetchFn: async () => {
            throw new Error("must not fetch without token");
          },
        });
        assert(result === null, "expected null result");
        const cache = readCacheJson(tmp);
        assert(cache.ok === false, "expected ok false");
        assert(cache.scoped.percent === 10, "expected previous data kept");
      });
    },
  );

  await testAsync("runBackgroundCheck sets cooldown on HTTP 429", async () => {
    await withTmpHomeAsync(async (tmp) => {
      await runBackgroundCheck({
        home: tmp,
        tokenReader: () => "tok",
        fetchFn: async () => {
          const err = new Error("HTTP 429");
          err.statusCode = 429;
          throw err;
        },
      });
      const cache = readCacheJson(tmp);
      assert(cache.ok === false, "expected ok false");
      assert(cache.cooldownUntil > Date.now(), "expected future cooldown");
    });
  });

  await testAsync(
    "runBackgroundCheck omits cooldown on other errors",
    async () => {
      await withTmpHomeAsync(async (tmp) => {
        await runBackgroundCheck({
          home: tmp,
          tokenReader: () => "tok",
          fetchFn: async () => {
            throw new Error("timeout");
          },
        });
        const cache = readCacheJson(tmp);
        assert(cache.ok === false, "expected ok false");
        assert(!("cooldownUntil" in cache), "expected no cooldown");
      });
    },
  );

  // ── summary ────────────────────────────────────────

  console.log();
  if (failed > 0) {
    console.log(`\x1b[38;5;167m${failed} test(s) failed\x1b[0m`);
    process.exit(1);
  } else {
    console.log("\x1b[38;5;114mall tests passed\x1b[0m");
  }
})();
