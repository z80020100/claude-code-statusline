"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_FILENAME = "claude-code-statusline.json";

function configPath(home = os.homedir()) {
  return path.join(home, ".claude", CONFIG_FILENAME);
}

function readConfig({ home = os.homedir() } = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(home), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeConfig(patch, { home = os.homedir() } = {}) {
  const target = configPath(home);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const next = { ...readConfig({ home }) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete next[k];
    } else {
      next[k] = v;
    }
  }
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(tmp, target);
  return next;
}

module.exports = { readConfig, writeConfig, configPath };
