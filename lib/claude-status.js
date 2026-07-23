"use strict";

const os = require("os");

const bg = require("./bg-cache.js");

const COMPONENT_NAME = "Claude Code";
const STATUS_URL = "https://status.claude.com/api/v2/components.json";
const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const UA = `@z80020100/claude-code-statusline/claude-status`;
const CLI_PATH = bg.CLI_PATH;
const CACHE_NAME = "claude-status";

function readCache(home) {
  return bg.readCache(home, CACHE_NAME);
}

function writeCache(data, home) {
  return bg.writeCache(data, home, CACHE_NAME);
}

function componentStatusFromResponse(data) {
  const components = data?.components;
  if (!Array.isArray(components)) return null;
  const component = components.find((c) => c?.name === COMPONENT_NAME);
  return typeof component?.status === "string" ? component.status : null;
}

async function fetchComponentStatus() {
  const data = await bg.fetchJson(STATUS_URL, {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { "user-agent": UA },
  });
  const status = componentStatusFromResponse(data);
  if (!status) {
    throw new Error("missing Claude Code component");
  }
  return status;
}

async function runBackgroundCheck({ home = os.homedir() } = {}) {
  let status = null;
  let ok = false;
  try {
    status = await fetchComponentStatus();
    ok = true;
  } catch {
    status = readCache(home)?.status ?? null;
  }
  writeCache(
    { checkedAt: Date.now(), component: COMPONENT_NAME, status, ok },
    home,
  );
  return status;
}

function reserveCheck({ home = os.homedir(), prev } = {}) {
  const previous = prev !== undefined ? prev : readCache(home);
  return writeCache(
    {
      checkedAt: Date.now(),
      component: COMPONENT_NAME,
      status: previous?.status ?? null,
      ok: previous?.ok ?? false,
    },
    home,
  );
}

function spawnBackgroundCheck(home) {
  bg.spawnDetached(["__claude-status", home ?? ""]);
}

function peekStatus({
  home = os.homedir(),
  spawnFn = spawnBackgroundCheck,
} = {}) {
  const cache = readCache(home);
  if (bg.isStale(cache, TTL_MS) && reserveCheck({ home, prev: cache })) {
    spawnFn(home);
  }
  return {
    status: cache?.status ?? null,
    ok: cache?.ok === true,
    checkedAt: cache?.checkedAt ?? null,
  };
}

module.exports = {
  CLI_PATH,
  COMPONENT_NAME,
  STATUS_URL,
  componentStatusFromResponse,
  fetchComponentStatus,
  peekStatus,
  reserveCheck,
  runBackgroundCheck,
  writeCache,
};
