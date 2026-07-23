"use strict";

const os = require("os");

const { readConfig, writeConfig, configPath } = require("./config.js");

const VALID_CLI_VALUES = { on: true, off: false };

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

module.exports = { isEnabled, currentLiveUsage, setLiveUsage, run };
