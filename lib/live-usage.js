"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { readConfig, writeConfig, configPath } = require("./config.js");
const bg = require("./bg-cache.js");

const VALID_CLI_VALUES = { on: true, off: false };
const CACHE_NAME = "live-usage";
const TTL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
// The endpoint is gated on a Claude Code user agent and this beta header.
const UA = "claude-code/2.1.0";
const OAUTH_BETA = "oauth-2025-04-20";
const KEYCHAIN_SERVICE = "Claude Code-credentials";

function readCache(home) {
  return bg.readCache(home, CACHE_NAME);
}

function writeCache(data, home) {
  return bg.writeCache(data, home, CACHE_NAME);
}

function readKeychainCredentials() {
  if (process.platform !== "darwin") return null;
  try {
    return execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return null;
  }
}

function readFileCredentials(home) {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  try {
    return fs.readFileSync(path.join(dir, ".credentials.json"), "utf8");
  } catch {
    return null;
  }
}

// The token stays in memory for the single request below and is never
// written to the cache or logged.
function readToken({
  home = os.homedir(),
  keychainReader = readKeychainCredentials,
} = {}) {
  const raw = keychainReader() || readFileCredentials(home);
  if (!raw) return null;
  try {
    const token = JSON.parse(raw).claudeAiOauth?.accessToken;
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    return null;
  }
}

function fetchUsage(token) {
  return bg.fetchJson(USAGE_URL, {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "anthropic-beta": OAUTH_BETA,
      "User-Agent": UA,
    },
  });
}

function epochSec(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

// Reduce the response to the fields the render needs. spend prefers the
// canonical spend{} block and falls back to the older extra_usage{}.
function extractUsage(data) {
  const scopedRaw = (data?.limits ?? []).find(
    (l) => l?.kind === "weekly_scoped" && l?.scope?.model?.display_name,
  );
  const scoped = scopedRaw
    ? {
        label: scopedRaw.scope.model.display_name,
        percent: Number.isFinite(scopedRaw.percent)
          ? Math.round(scopedRaw.percent)
          : null,
        resetsAt: epochSec(scopedRaw.resets_at),
      }
    : null;

  const toSpend = (used, limit, exponent, currency, percent) => ({
    usedMinor: used,
    limitMinor: limit,
    exponent: Number.isFinite(exponent) ? exponent : 2,
    currency: currency ?? "USD",
    percent: Number.isFinite(percent) ? Math.round(percent) : null,
  });
  const s = data?.spend;
  const x = data?.extra_usage;
  let spend = null;
  if (
    s?.enabled === true &&
    Number.isFinite(s.used?.amount_minor) &&
    Number.isFinite(s.limit?.amount_minor)
  ) {
    spend = toSpend(
      s.used.amount_minor,
      s.limit.amount_minor,
      s.used.exponent,
      s.used.currency,
      s.percent,
    );
  } else if (
    x?.is_enabled === true &&
    Number.isFinite(x.used_credits) &&
    Number.isFinite(x.monthly_limit)
  ) {
    spend = toSpend(
      x.used_credits,
      x.monthly_limit,
      x.decimal_places,
      x.currency,
      x.utilization,
    );
  }
  if (spend && spend.percent === null && spend.limitMinor > 0) {
    spend.percent = Math.round((spend.usedMinor / spend.limitMinor) * 100);
  }
  return { scoped, spend };
}

// Fields carried forward when a check fails or is only being reserved.
function carryForward(prev) {
  return { scoped: prev?.scoped ?? null, spend: prev?.spend ?? null };
}

async function runBackgroundCheck({
  home = os.homedir(),
  tokenReader = readToken,
  fetchFn = fetchUsage,
} = {}) {
  const token = tokenReader({ home });
  if (!token) {
    writeCache(
      { checkedAt: Date.now(), ok: false, ...carryForward(readCache(home)) },
      home,
    );
    return null;
  }
  try {
    const { scoped, spend } = extractUsage(await fetchFn(token));
    writeCache({ checkedAt: Date.now(), ok: true, scoped, spend }, home);
    return { scoped, spend };
  } catch (err) {
    // JSON.stringify drops undefined so cooldownUntil only lands on 429.
    writeCache(
      {
        checkedAt: Date.now(),
        ok: false,
        ...carryForward(readCache(home)),
        cooldownUntil:
          err?.statusCode === 429 ? Date.now() + COOLDOWN_MS : undefined,
      },
      home,
    );
    return null;
  }
}

function reserveCheck({ home = os.homedir(), prev } = {}) {
  const previous = prev !== undefined ? prev : readCache(home);
  return writeCache(
    {
      checkedAt: Date.now(),
      ok: previous?.ok ?? false,
      ...carryForward(previous),
      cooldownUntil: previous?.cooldownUntil,
    },
    home,
  );
}

function spawnBackgroundCheck(home) {
  bg.spawnDetached(["__live-usage", home ?? ""]);
}

function isEnabled({ home = os.homedir(), configReader = readConfig } = {}) {
  const env = process.env.CLAUDE_STATUSLINE_LIVE_USAGE;
  if (env !== undefined && env !== "") {
    return env === "1" || env === "true";
  }
  try {
    return configReader({ home }).liveUsage === true;
  } catch {
    return false;
  }
}

function peekLiveUsage({
  home = os.homedir(),
  configReader = readConfig,
  spawnFn = spawnBackgroundCheck,
} = {}) {
  if (!isEnabled({ home, configReader })) return null;
  const cache = readCache(home);
  if (
    bg.isStale(cache, TTL_MS) &&
    !(cache?.cooldownUntil > Date.now()) &&
    reserveCheck({ home, prev: cache })
  ) {
    spawnFn(home);
  }
  const scoped = cache?.scoped ?? null;
  const spend = cache?.spend ?? null;
  if (!scoped && !spend) return null;
  return { scoped, spend };
}

function currentLiveUsage({ home = os.homedir() } = {}) {
  return readConfig({ home }).liveUsage === true;
}

function setLiveUsage(value, { home = os.homedir() } = {}) {
  if (!Object.hasOwn(VALID_CLI_VALUES, value)) {
    throw new Error(`Invalid value "${value}". Expected "on" or "off".`);
  }
  return writeConfig({ liveUsage: VALID_CLI_VALUES[value] }, { home });
}

function run(args, { home = os.homedir() } = {}) {
  try {
    const value = args[0];
    if (value === undefined) {
      const state = currentLiveUsage({ home }) ? "on" : "off";
      console.log(`Current live usage: ${state}`);
      console.log(`Config: ${configPath(home)}`);
      return;
    }
    setLiveUsage(value, { home });
    console.log(`Set live usage to ${value}`);
    console.log(`Wrote ${configPath(home)}`);
  } catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
  }
}

module.exports = {
  isEnabled,
  currentLiveUsage,
  setLiveUsage,
  run,
  readToken,
  extractUsage,
  runBackgroundCheck,
  reserveCheck,
  peekLiveUsage,
  writeCache,
};
