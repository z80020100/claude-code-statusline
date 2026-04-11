"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const STATUS_LINE_VALUE = {
  type: "command",
  command: "claude-code-statusline",
};

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function writeSettings(data) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2) + "\n");
}

function setup() {
  const settings = readSettings();

  // Already configured
  if (
    settings.statusLine &&
    settings.statusLine.command === "claude-code-statusline"
  ) {
    console.log("Already configured. No changes needed.");
    return;
  }

  // Existing different value — ask to overwrite
  if (settings.statusLine) {
    console.log("Current statusLine setting:");
    console.log("  " + JSON.stringify(settings.statusLine));
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Overwrite? (y/N) ", (answer) => {
      rl.close();
      if (answer.toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
      }
      applySetup(settings);
    });
    return;
  }

  applySetup(settings);
}

function applySetup(settings) {
  console.log("Before:");
  console.log("  " + JSON.stringify(settings.statusLine ?? null));
  settings.statusLine = STATUS_LINE_VALUE;
  writeSettings(settings);
  console.log("After:");
  console.log("  " + JSON.stringify(settings.statusLine));
  console.log();
  console.log("Wrote " + SETTINGS_PATH);
}

function uninstall() {
  const settings = readSettings();
  if (!settings.statusLine) {
    console.log("No statusLine setting found. No changes needed.");
    return;
  }
  console.log("Removing statusLine:");
  console.log("  " + JSON.stringify(settings.statusLine));
  delete settings.statusLine;
  writeSettings(settings);
  console.log();
  console.log("Wrote " + SETTINGS_PATH);
}

function run(args) {
  try {
    if (args.includes("--uninstall")) {
      uninstall();
    } else {
      setup();
    }
  } catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
  }
}

module.exports = { run };
