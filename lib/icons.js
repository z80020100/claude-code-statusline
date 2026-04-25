"use strict";

const os = require("os");

const { readConfig, writeConfig, configPath } = require("./config.js");

const VALID_ICON_MODES = ["unicode", "nerd"];

function currentIcons({ home = os.homedir() } = {}) {
  const icons = readConfig({ home }).icons;
  return VALID_ICON_MODES.includes(icons) ? icons : "unicode";
}

function setIcons(mode, { home = os.homedir() } = {}) {
  if (!VALID_ICON_MODES.includes(mode)) {
    throw new Error(
      `Invalid icon mode "${mode}". Expected "unicode" or "nerd".`,
    );
  }
  return writeConfig({ icons: mode }, { home });
}

function run(args, { home = os.homedir() } = {}) {
  try {
    const mode = args[0];
    if (mode === undefined) {
      console.log(`Current icons: ${currentIcons({ home })}`);
      console.log(`Config: ${configPath(home)}`);
      return;
    }
    setIcons(mode, { home });
    console.log(`Set icons to ${mode}`);
    console.log(`Wrote ${configPath(home)}`);
  } catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
  }
}

module.exports = { run, currentIcons, setIcons };
