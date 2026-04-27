"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const DEFAULT_COMMAND = "claude-code-statusline";
const STATUS_LINE_TYPE = "command";

function isOnPath(binary) {
  const PATH = process.env.PATH || "";
  const sep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of PATH.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        fs.accessSync(path.join(dir, binary + ext), fs.constants.F_OK);
        return true;
      } catch {}
    }
  }
  return false;
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function writeSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  const tmp = `${SETTINGS_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, SETTINGS_PATH);
}

function parseCommand(args) {
  const idx = args.indexOf("--command");
  if (idx === -1) return DEFAULT_COMMAND;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--command requires a value");
  }
  return value;
}

function isConfiguredAs(settings, command) {
  const sl = settings.statusLine;
  return sl && sl.type === STATUS_LINE_TYPE && sl.command === command;
}

function setup(command) {
  const settings = readSettings();

  if (isConfiguredAs(settings, command)) {
    console.log("Already configured. No changes needed.");
    return;
  }

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
      applySetup(settings, command);
    });
    return;
  }

  applySetup(settings, command);
}

function applySetup(settings, command) {
  console.log("Before:");
  console.log("  " + JSON.stringify(settings.statusLine ?? null));
  settings.statusLine = { type: STATUS_LINE_TYPE, command };
  writeSettings(settings);
  console.log("After:");
  console.log("  " + JSON.stringify(settings.statusLine));
  console.log();
  console.log("Wrote " + SETTINGS_PATH);
  if (command === DEFAULT_COMMAND) {
    console.log();
    console.log("Default icons are Unicode. To use Nerd Font icons:");
    console.log("  claude-code-statusline icons nerd");

    if (!isOnPath(DEFAULT_COMMAND)) {
      console.log();
      console.log("Warning: '" + DEFAULT_COMMAND + "' is not on your PATH.");
      console.log(
        "The status line will not render until npm's global bin directory",
      );
      console.log(
        "is added to PATH. Run `npm prefix -g` to find it, then prepend",
      );
      console.log("<prefix>/bin to PATH in your shell rc.");
    }
  }
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
    const hasCommand = args.includes("--command");
    const hasUninstall = args.includes("--uninstall");
    if (hasCommand && hasUninstall) {
      throw new Error("--command and --uninstall cannot be combined");
    }
    if (hasUninstall) {
      uninstall();
    } else {
      setup(parseCommand(args));
    }
  } catch (err) {
    console.error("Error: " + err.message);
    process.exit(1);
  }
}

module.exports = { run };
