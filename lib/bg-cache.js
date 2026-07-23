"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const https = require("https");

// __dirname-relative so library consumers requiring the package main don't
// spawn their host script by mistake.
const CLI_PATH = path.resolve(
  __dirname,
  "..",
  "bin",
  "claude-code-statusline.js",
);

function cacheFile(home, name) {
  return path.join(home, ".claude", ".cache", `${name}.json`);
}

function readCache(home, name) {
  try {
    const data = JSON.parse(fs.readFileSync(cacheFile(home, name), "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function writeCache(data, home, name) {
  const file = cacheFile(home, name);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), "utf8");
    return true;
  } catch {
    return false;
  }
}

function isStale(cache, ttlMs) {
  return !cache || !cache.checkedAt || Date.now() - cache.checkedAt > ttlMs;
}

function spawnDetached(args) {
  try {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {}
}

function fetchJson(url, { timeoutMs, headers } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        const err = new Error(`HTTP ${res.statusCode}`);
        err.statusCode = res.statusCode;
        reject(err);
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

module.exports = {
  CLI_PATH,
  readCache,
  writeCache,
  isStale,
  spawnDetached,
  fetchJson,
};
