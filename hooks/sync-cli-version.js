#!/usr/bin/env node

// SessionStart hook: keep the globally installed CLI in lockstep with the
// plugin version. Installs run in a detached worker so SessionStart returns
// instantly.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const PACKAGE_NAME = "@z80020100/claude-code-statusline";
const INSTALL_ARG = "__install";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function runInstallWorker(version, stored) {
  if (!version || !stored) return;

  const result = spawnSync(
    NPM,
    ["install", "-g", `${PACKAGE_NAME}@${version}`],
    { stdio: "ignore", windowsHide: true },
  );
  if (result.status === 0) fs.writeFileSync(stored, version);
}

if (process.argv[2] === INSTALL_ARG) {
  try {
    runInstallWorker(process.argv[3], process.argv[4]);
  } catch {}
  process.exit(0);
}

try {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) process.exit(0);

  const manifest = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  const dataDir =
    process.env.CLAUDE_PLUGIN_DATA ||
    path.join(os.homedir(), ".claude", "plugin-data", "claude-code-statusline");
  const stored = path.join(dataDir, "installed-version");

  const current = JSON.parse(fs.readFileSync(manifest, "utf8")).version;
  if (typeof current !== "string" || !current) process.exit(0);

  let prev = "";
  try {
    prev = fs.readFileSync(stored, "utf8").trim();
  } catch {}

  if (current === prev) process.exit(0);

  fs.mkdirSync(dataDir, { recursive: true });

  const child = spawn(
    process.execPath,
    [__filename, INSTALL_ARG, current, stored],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
} catch {
  // Hook failures must never block session start.
}

process.exit(0);
