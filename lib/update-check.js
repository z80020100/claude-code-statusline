"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const https = require("https");

const { readConfig, writeConfig, configPath } = require("./config.js");

const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const UA = `@z80020100/claude-code-statusline/update-check`;
const VALID_CLI_VALUES = { on: true, off: false };
const TARGETS = {
  claude: { pkg: "@anthropic-ai/claude-code" },
  statusline: { pkg: "@z80020100/claude-code-statusline" },
};
const TARGET_NAMES = Object.keys(TARGETS);
// __dirname-relative so library consumers requiring the package main don't
// spawn their host script by mistake.
const CLI_PATH = path.resolve(
  __dirname,
  "..",
  "bin",
  "claude-code-statusline.js",
);

function cachePath(home, target) {
  return path.join(home, ".claude", ".cache", `update-check-${target}.json`);
}

function readCache(home, target) {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath(home, target), "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function writeCache(data, home, target) {
  const file = cachePath(home, target);
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

function compareSemver(a, b) {
  const parse = (v) => {
    const s = String(v).split("+")[0];
    const i = s.indexOf("-");
    return [
      (i < 0 ? s : s.slice(0, i)).split("."),
      i < 0 ? null : s.slice(i + 1).split("."),
    ];
  };
  const cmp = (xa, xb) => {
    if (xa === xb) return 0;
    const na = /^\d+$/.test(xa) ? Number(xa) : null;
    const nb = /^\d+$/.test(xb) ? Number(xb) : null;
    if (na !== null && nb !== null) {
      if (na === nb) return 0;
      return na < nb ? -1 : 1;
    }
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return xa < xb ? -1 : 1;
  };
  const [ca, preA] = parse(a);
  const [cb, preB] = parse(b);
  const coreLen = Math.max(ca.length, cb.length);
  for (let i = 0; i < coreLen; i++) {
    const c = cmp(ca[i] ?? "0", cb[i] ?? "0");
    if (c !== 0) return c;
  }
  if (preA === null && preB === null) return 0;
  if (preA === null) return 1;
  if (preB === null) return -1;
  const preLen = Math.max(preA.length, preB.length);
  for (let i = 0; i < preLen; i++) {
    if (i >= preA.length) return -1;
    if (i >= preB.length) return 1;
    const c = cmp(preA[i], preB[i]);
    if (c !== 0) return c;
  }
  return 0;
}

function fetchLatestVersion(pkg) {
  const url = `https://registry.npmjs.org/${pkg}/latest`;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
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
            const data = JSON.parse(body);
            if (!data || typeof data.version !== "string") {
              reject(new Error("invalid response"));
              return;
            }
            resolve(data.version);
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

async function runBackgroundCheck({
  target,
  current,
  home = os.homedir(),
} = {}) {
  const meta = TARGETS[target];
  if (!meta) return null;
  let latest = null;
  let ok = false;
  try {
    latest = await fetchLatestVersion(meta.pkg);
    ok = true;
  } catch {
    latest = readCache(home, target)?.latest ?? null;
  }
  writeCache({ checkedAt: Date.now(), current, latest, ok }, home, target);
  return latest;
}

function reserveCheck({ target, current, home = os.homedir(), prev } = {}) {
  const previous = prev !== undefined ? prev : readCache(home, target);
  return writeCache(
    {
      checkedAt: Date.now(),
      current,
      latest: previous?.latest ?? null,
      ok: previous?.ok ?? false,
    },
    home,
    target,
  );
}

function spawnBackgroundCheck(target, currentVersion, home) {
  try {
    const child = spawn(
      process.execPath,
      [CLI_PATH, "__update-check", target, currentVersion ?? "", home ?? ""],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
  } catch {}
}

function isEnabled({
  home = os.homedir(),
  target,
  configReader = readConfig,
} = {}) {
  const env = process.env.CLAUDE_STATUSLINE_UPDATE_CHECK;
  if (env !== undefined && env !== "") {
    return env === "1" || env === "true";
  }
  try {
    return configReader({ home }).updateCheck?.[target] === true;
  } catch {
    return false;
  }
}

function peekUpdate({
  home = os.homedir(),
  target,
  currentVersion,
  configReader = readConfig,
  spawnFn = spawnBackgroundCheck,
} = {}) {
  if (!TARGETS[target] || !isEnabled({ home, target, configReader }))
    return { available: false, latest: null };
  const cache = readCache(home, target);
  if (
    isStale(cache) &&
    reserveCheck({ target, current: currentVersion, home, prev: cache })
  ) {
    spawnFn(target, currentVersion, home);
  }
  const latest = cache?.latest ?? null;
  const available =
    typeof latest === "string" &&
    typeof currentVersion === "string" &&
    compareSemver(latest, currentVersion) > 0;
  return { available, latest };
}

function currentUpdateCheck({ home = os.homedir() } = {}) {
  const cfg = readConfig({ home }).updateCheck;
  const states = {};
  for (const t of TARGET_NAMES) {
    states[t] = cfg?.[t] === true;
  }
  return states;
}

function resolveTargets(target) {
  if (target === undefined || target === null) return TARGET_NAMES;
  if (TARGET_NAMES.includes(target)) return [target];
  throw new Error(
    `Invalid target "${target}". Expected one of: ${TARGET_NAMES.join(", ")}.`,
  );
}

function setUpdateCheck(target, value, { home = os.homedir() } = {}) {
  if (!Object.hasOwn(VALID_CLI_VALUES, value)) {
    throw new Error(`Invalid value "${value}". Expected "on" or "off".`);
  }
  const targets = resolveTargets(target);
  const next = { ...(readConfig({ home }).updateCheck || {}) };
  for (const t of targets) {
    next[t] = VALID_CLI_VALUES[value];
  }
  return writeConfig({ updateCheck: next }, { home });
}

function run(args, { home = os.homedir() } = {}) {
  try {
    const [first, value] = args;
    const states = currentUpdateCheck({ home });
    if (first === undefined) {
      console.log("Current update check:");
      for (const t of TARGET_NAMES) {
        console.log(`  ${t}: ${states[t] ? "on" : "off"}`);
      }
      console.log(`Config: ${configPath(home)}`);
      return;
    }
    if ((first === "on" || first === "off") && args.length === 1) {
      setUpdateCheck(null, first, { home });
      console.log(`Set both update checks to ${first}`);
      console.log(`Wrote ${configPath(home)}`);
      return;
    }
    if (value === undefined) {
      const targets = resolveTargets(first);
      for (const t of targets) {
        console.log(`${t}: ${states[t] ? "on" : "off"}`);
      }
      console.log(`Config: ${configPath(home)}`);
      return;
    }
    setUpdateCheck(first, value, { home });
    console.log(`Set ${first} update check to ${value}`);
    console.log(`Wrote ${configPath(home)}`);
  } catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
  }
}

module.exports = {
  CLI_PATH,
  TARGET_NAMES,
  writeCache,
  compareSemver,
  runBackgroundCheck,
  reserveCheck,
  peekUpdate,
  run,
};
