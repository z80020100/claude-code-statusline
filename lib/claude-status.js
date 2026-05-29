"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const https = require("https");

const COMPONENT_NAME = "Claude Code";
const STATUS_URL = "https://status.claude.com/api/v2/components.json";
const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const UA = `@z80020100/claude-code-statusline/claude-status`;
const CLI_PATH = path.resolve(
  __dirname,
  "..",
  "bin",
  "claude-code-statusline.js",
);

function cachePath(home) {
  return path.join(home, ".claude", ".cache", "claude-status.json");
}

function readCache(home) {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath(home), "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function writeCache(data, home) {
  const file = cachePath(home);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), "utf8");
    return true;
  } catch {
    return false;
  }
}

function isStale(cache) {
  return !cache || !cache.checkedAt || Date.now() - cache.checkedAt > TTL_MS;
}

function componentStatusFromResponse(data) {
  const components = data?.components;
  if (!Array.isArray(components)) return null;
  const component = components.find((c) => c?.name === COMPONENT_NAME);
  return typeof component?.status === "string" ? component.status : null;
}

function fetchComponentStatus() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      STATUS_URL,
      { timeout: FETCH_TIMEOUT_MS, headers: { "user-agent": UA } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const status = componentStatusFromResponse(JSON.parse(body));
            if (!status) {
              reject(new Error("missing Claude Code component"));
              return;
            }
            resolve(status);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
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
  try {
    const child = spawn(
      process.execPath,
      [CLI_PATH, "__claude-status", home ?? ""],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
  } catch {}
}

function peekStatus({
  home = os.homedir(),
  spawnFn = spawnBackgroundCheck,
} = {}) {
  const cache = readCache(home);
  if (isStale(cache) && reserveCheck({ home, prev: cache })) {
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
