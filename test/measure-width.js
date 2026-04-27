#!/usr/bin/env node

// Measure visible width of each statusline line under worst-case conditions.
// Usage: node test/measure-width.js [--check]
//   --check   Exit with code 1 if any line exceeds 80 columns (for CI/hooks)
//   (default) Display rendered output and width report

"use strict";

const path = require("path");
const { render } = require("../lib/statusline.js");

const MAX_WIDTH = 80;
const checkMode = process.argv.includes("--check");

const worstCase = require(path.join(__dirname, "fixtures", "worst-case.json"));

// Return an epoch (seconds) for Dec 31 23:59 of the current year
// to guarantee cross-day format with 2-digit month and day.
function crossDayEpoch() {
  const d = new Date();
  d.setMonth(11, 31);
  d.setHours(23, 59, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// Inject rate_limits with cross-day reset times
worstCase.rate_limits = {
  five_hour: { used_percentage: 100, resets_at: crossDayEpoch() },
  seven_day: { used_percentage: 100, resets_at: crossDayEpoch() },
};

// Call render() directly with all overrides — no subprocesses or cache files
const lines = render(worstCase, {
  home: "/Users/username",
  effort: "medium",
  effortSource: "lockedAuto",
  sandboxMode: "auto",
  now: new Date(),
  git: {
    branch: "feature-branch",
    dirty: "*",
    isWorktree: true,
    diffAdded: 99999,
    diffRemoved: 99999,
  },
});

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// Display rendered output
if (!checkMode) {
  console.log("── Rendered output ──────────────────────────────────────");
  for (const line of lines) {
    console.log(line);
  }
  console.log("─────────────────────────────────────────────────────────");
  console.log();
}

// Measure and report
let failed = false;
lines.forEach((line, i) => {
  const visible = stripAnsi(line);
  const width = visible.length;
  const over = width - MAX_WIDTH;
  if (over > 0) failed = true;

  if (checkMode) {
    if (over > 0) {
      console.log(`Line ${i + 1}: ${width} cols (OVER by ${over})`);
    }
  } else {
    const mark = over > 0 ? "\x1b[38;5;167m\u2717" : "\x1b[38;5;114m\u2713";
    console.log(
      `${mark} Line ${i + 1}: ${width} cols${over > 0 ? ` (over by ${over})` : ""}\x1b[0m`,
    );
    console.log(`  "${visible}"`);
  }
});

if (!checkMode) {
  console.log();
  if (failed) {
    console.log(`\x1b[38;5;167mSome lines exceed ${MAX_WIDTH} columns.\x1b[0m`);
  } else {
    console.log(`\x1b[38;5;114mAll lines within ${MAX_WIDTH} columns.\x1b[0m`);
  }
}

process.exit(failed ? 1 : 0);
