"use strict";

const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const os = require("os");

/**
 * Render Claude Code status line.
 * @param {object} data - JSON data from Claude Code stdin
 * @param {object} [options] - Overrides for testability and cross-platform
 * @param {object} [options.git] - { branch, dirty, isWorktree, diffAdded, diffRemoved }
 * @param {string} [options.effort] - Effort level override
 * @param {string} [options.sandboxMode] - Sandbox mode override ("", "auto", "on")
 * @param {string} [options.home] - Home directory override
 * @param {Date}   [options.now] - Current time override
 * @returns {string[]} Array of ANSI-colored lines
 */
function render(data, options = {}) {
  const model = data.model?.display_name || "?";
  const usedPct = data.context_window?.used_percentage ?? 0;
  const cost = data.cost?.total_cost_usd ?? 0;
  const linesAdded = data.cost?.total_lines_added ?? 0;
  const linesRemoved = data.cost?.total_lines_removed ?? 0;
  const exceeds200k = data.exceeds_200k_tokens ?? false;
  const totalInput = data.context_window?.total_input_tokens ?? 0;
  const totalOutput = data.context_window?.total_output_tokens ?? 0;
  const uncachedInput = data.context_window?.current_usage?.input_tokens ?? 0;
  const cacheRead =
    data.context_window?.current_usage?.cache_read_input_tokens ?? 0;
  const cacheCreate =
    data.context_window?.current_usage?.cache_creation_input_tokens ?? 0;
  const ctxSize = data.context_window?.context_window_size ?? 0;
  const durationMs = data.cost?.total_duration_ms ?? 0;
  const apiDurationMs = data.cost?.total_api_duration_ms ?? 0;
  const projectDir = data.workspace?.project_dir || "";
  const cwd = data.workspace?.current_dir || "";
  const version = data.version || "";
  const sessionName = data.session_name || "";
  const sessionId = data.session_id || "";

  // ANSI styles — 256-color for cross-terminal consistency
  // Palette: Developer Tool / Modern Dark (desaturated, semantic)
  // Exception: claudeOrange uses 24-bit true color for brand accuracy (#da7756)
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const dim = "\x1b[2m";
  // Foreground hierarchy
  const white = "\x1b[38;5;255m"; // headlines, key values
  const softWhite = "\x1b[38;5;252m"; // secondary values
  const gray = "\x1b[38;5;247m"; // muted labels, token counts
  const darkGray = "\x1b[38;5;239m"; // separators, empty bar segments
  // Semantic accent
  const violet = "\x1b[38;5;141m"; // primary accent: effort, branch
  const blue = "\x1b[38;5;75m"; // info: cwd path, agent
  const dimBlue = "\x1b[38;5;68m"; // subdued: project path
  const teal = "\x1b[38;5;116m"; // secondary: cost, worktree
  // Status spectrum (progress bars, +/- lines)
  const green = "\x1b[38;5;114m"; // good / positive
  const gold = "\x1b[38;5;179m"; // moderate
  const coral = "\x1b[38;5;209m"; // elevated
  const red = "\x1b[38;5;167m"; // critical
  // Identity
  const claudeOrange = "\x1b[38;2;218;119;86m"; // #da7756, 24-bit true color

  // ── Helpers ──────────────────────────────────────────

  // Shared thresholds: single source of truth for color zones
  const pctZones = [
    { at: 90, color: red },
    { at: 70, color: coral },
    { at: 50, color: gold },
    { at: 0, color: green },
  ];

  function colorForPct(pct) {
    for (const z of pctZones) {
      if (pct >= z.at) return z.color;
    }
    return green;
  }

  // Gradient bar — each filled segment colored by its zone position
  function buildBar(pct, width) {
    const clamped = Math.max(0, Math.min(100, pct));
    const filled = Math.round((clamped / 100) * width);
    let s = "";
    for (let i = 0; i < width; i++) {
      if (i < filled) {
        s += colorForPct((i / width) * 100) + "\u2501";
      } else {
        s += darkGray + "\u2501";
      }
    }
    return s + reset;
  }

  function fmt(n) {
    if (n >= 999950) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  }

  function fmtDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
    if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }

  const now = options.now ?? new Date();

  function fmtResetTime(epochSec) {
    if (!epochSec) return "";
    const d = new Date(epochSec * 1000);
    if (isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    // Same day → time only; different day → date + time
    if (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    ) {
      return `${hh}:${mm}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }

  const ansiRe = /\x1b\[[0-9;]*m/g;
  function visibleLen(s) {
    return s.replace(ansiRe, "").length;
  }

  function compressPath(p, maxLen) {
    if (p.length <= maxLen) return p;
    const parts = p.split("/");
    // Abbreviate from left (skip ~ at index 0 and last component)
    for (let i = 1; i < parts.length - 1; i++) {
      if (parts[i].length > 1) {
        parts[i] = parts[i][0];
        const result = parts.join("/");
        if (result.length <= maxLen) return result;
      }
    }
    return parts.join("/");
  }

  const maxCols = 80;
  const sep = ` ${darkGray}\u2502${reset} `;
  const barWidth = 10;

  // ── Directory paths ──────────────────────────────────
  const home = options.home ?? os.homedir();
  function tildify(p) {
    return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
  }
  const dirPath = projectDir ? tildify(projectDir) : "";
  const cwdPath = cwd && cwd !== projectDir ? tildify(cwd) : "";

  // ── Git branch + dirty + worktree + diff vs main (cached) ──
  let branch = "";
  let dirty = "";
  let isWorktree = false;
  let diffAdded = 0;
  let diffRemoved = 0;
  if (options.git) {
    ({
      branch = "",
      dirty = "",
      isWorktree = false,
      diffAdded = 0,
      diffRemoved = 0,
    } = options.git);
  } else if (cwd) {
    const cacheFile = path.join(os.tmpdir(), ".claude-statusline-git.json");
    const cacheMaxAge = 5000;
    let useCache = false;
    try {
      const stat = fs.statSync(cacheFile);
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (cached.cwd === cwd && Date.now() - stat.mtimeMs < cacheMaxAge) {
        branch = cached.branch;
        dirty = cached.dirty;
        isWorktree = cached.isWorktree ?? false;
        diffAdded = cached.diffAdded ?? 0;
        diffRemoved = cached.diffRemoved ?? 0;
        useCache = true;
      }
    } catch {}
    if (!useCache) {
      try {
        const statusOut = execSync("git status --short --branch", {
          cwd,
          timeout: 2000,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        }).trim();
        const lines = statusOut.split("\n");
        // First line: "## branch...tracking" or "## HEAD (no branch)"
        const branchMatch = lines[0].match(/^## (\S+?)(?:\.\.\.|$)/);
        branch = branchMatch ? branchMatch[1] : "";
        // Remaining lines = changed files
        dirty = lines.length > 1 ? "*" : "";
        // Detect git worktree: git-dir differs from git-common-dir
        try {
          const revOut = execSync(
            "git rev-parse --path-format=absolute --git-dir --git-common-dir",
            {
              cwd,
              timeout: 1000,
              encoding: "utf8",
              stdio: ["pipe", "pipe", "ignore"],
            },
          ).trim();
          const [gitDir, commonDir] = revOut.split("\n");
          isWorktree = gitDir !== commonDir;
        } catch {}
        // Diff stats relative to main (or master) branch
        for (const base of ["main", "master"]) {
          try {
            const diffOut = execSync(`git diff ${base} --shortstat`, {
              cwd,
              timeout: 2000,
              encoding: "utf8",
              stdio: ["pipe", "pipe", "ignore"],
            }).trim();
            const insMatch = diffOut.match(/(\d+) insertion/);
            const delMatch = diffOut.match(/(\d+) deletion/);
            if (insMatch) diffAdded = Number(insMatch[1]);
            if (delMatch) diffRemoved = Number(delMatch[1]);
            break;
          } catch {}
        }
        fs.writeFileSync(
          cacheFile,
          JSON.stringify({
            cwd,
            branch,
            dirty,
            isWorktree,
            diffAdded,
            diffRemoved,
          }),
          "utf8",
        );
      } catch {}
    }
  }

  // ── Effort level (cached by mtime) ─────────────────
  // Priority: env CLAUDE_CODE_EFFORT_LEVEL → settings.effortLevel → "default"
  let effort = "default";
  if (options.effort !== undefined) {
    effort = options.effort;
  } else {
    const settingsPath = path.join(home, ".claude", "settings.json");
    const settingsCacheFile = path.join(
      os.tmpdir(),
      ".claude-statusline-settings.json",
    );
    try {
      const mtime = fs.statSync(settingsPath).mtimeMs;
      let useSettingsCache = false;
      try {
        const cached = JSON.parse(fs.readFileSync(settingsCacheFile, "utf8"));
        if (cached.mtime === mtime) {
          effort = cached.effort;
          useSettingsCache = true;
        }
      } catch {}
      if (!useSettingsCache) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        const envEffort =
          process.env.CLAUDE_CODE_EFFORT_LEVEL ||
          settings.env?.CLAUDE_CODE_EFFORT_LEVEL;
        effort = envEffort || settings.effortLevel || "default";
        fs.writeFileSync(
          settingsCacheFile,
          JSON.stringify({ mtime, effort }),
          "utf8",
        );
      }
    } catch {}
  }

  // ── Sandbox state (cached by mtime) ─────────────────
  // mtime = 0 when file absent so the cache still works (measure script seeds mtime: 0)
  let sandboxMode = ""; // "", "auto", "on"
  if (options.sandboxMode !== undefined) {
    sandboxMode = options.sandboxMode;
  } else if (projectDir) {
    const localSettingsPath = path.join(
      projectDir,
      ".claude",
      "settings.local.json",
    );
    const sandboxCacheFile = path.join(
      os.tmpdir(),
      ".claude-statusline-sandbox.json",
    );
    let fileMtime = 0;
    try {
      fileMtime = fs.statSync(localSettingsPath).mtimeMs;
    } catch {}
    let useSandboxCache = false;
    try {
      const cached = JSON.parse(fs.readFileSync(sandboxCacheFile, "utf8"));
      if (cached.mtime === fileMtime && cached.projectDir === projectDir) {
        sandboxMode = cached.sandboxMode;
        useSandboxCache = true;
      }
    } catch {}
    if (!useSandboxCache) {
      try {
        const localSettings = JSON.parse(
          fs.readFileSync(localSettingsPath, "utf8"),
        );
        if (localSettings.sandbox?.enabled) {
          sandboxMode = localSettings.sandbox.autoAllowBashIfSandboxed
            ? "auto"
            : "on";
        }
      } catch {}
      try {
        fs.writeFileSync(
          sandboxCacheFile,
          JSON.stringify({ mtime: fileMtime, projectDir, sandboxMode }),
          "utf8",
        );
      } catch {}
    }
  }

  const effortDisplay = {
    max: `${red}\u25CF ${effort}${reset}`,
    high: `${violet}\u25CF ${effort}${reset}`,
    medium: `${dim}\u25D1 ${effort}${reset}`,
    default: `${dim}\u25D1 ${effort}${reset}`,
    low: `${dim}\u25D4 ${effort}${reset}`,
  };
  const effortStr = effortDisplay[effort] ?? effortDisplay.default;

  // ── Rate limit usage (native field, v2.1.80+) ──────
  const usageData = data.rate_limits || null;

  // ── Build output ────────────────────────────────────

  const ctxLabel = ctxSize > 0 ? fmt(ctxSize) : "";
  const costStr = cost < 0.01 && cost > 0 ? "<0.01" : cost.toFixed(2);
  const pctColor = colorForPct(usedPct);

  // Sandbox indicator for version line (always shown)
  const sandboxIcons = {
    auto: `${green}\uf132\uf0e7${reset}`,
    on: `${teal}\uf132${reset}`,
    "": `${dim}\uf132${reset}`,
  };
  const sandboxStr = sandboxIcons[sandboxMode];

  // Version banner: ✻ (U+273B) matches Claude Code startup style
  const shortId = sessionId ? sessionId.slice(0, 7) : "";
  const sessionSuffix = shortId
    ? sessionName
      ? `${sep}${softWhite}${sessionName}${reset} ${gray}(${shortId})${reset}`
      : `${sep}${gray}(${shortId})${reset}`
    : "";
  const versionLine = version
    ? `${claudeOrange}\u273B ${bold}${claudeOrange}Claude Code${reset} ${dim}v${version}${reset} ${sandboxStr}${sessionSuffix}`
    : "";

  // Model line: identity, effort │ bar, ctx size │ updated
  // Usage line: tokens, cache │ cost, duration, diff │ warning
  const identityGroup = `${bold}${white}${model}${reset} ${effortStr}`;
  const currentTurnInput = uncachedInput + cacheCreate + cacheRead;
  const cacheStr =
    currentTurnInput > 0 && cacheRead > 0
      ? ` ${teal}\uf1c0 ${softWhite}${Math.round((cacheRead / currentTurnInput) * 100)}%${reset}`
      : "";
  const barGroup =
    `${buildBar(usedPct, barWidth)} ${pctColor}${bold}${usedPct}%${reset}` +
    (ctxLabel ? ` ${darkGray}(${gray}${ctxLabel}${darkGray})${reset}` : "");
  const tokenGroup =
    `${gray}${fmt(totalInput)}\u2191 ${fmt(totalOutput)}\u2193${reset}` +
    cacheStr;
  const costParts = [`${teal}$${costStr}${reset}`];
  if (durationMs > 0) {
    let timeStr = `${gray}\uf253 ${fmtDuration(durationMs)}${reset}`;
    if (apiDurationMs > 0) {
      timeStr += ` ${gold}\uf0e7 ${gray}${fmtDuration(apiDurationMs)}${reset}`;
    }
    costParts.push(timeStr);
  }
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const updatedStr = `${gray}updated${reset} ${darkGray}\uf017${reset} ${softWhite}${hhmm}${reset}`;
  const modelParts = [identityGroup, barGroup, updatedStr];
  const usageParts = [tokenGroup, costParts.join(" ")];
  if (linesAdded > 0 || linesRemoved > 0) {
    usageParts.push(
      `${green}+${linesAdded}${reset} ${red}-${linesRemoved}${reset}`,
    );
  }
  if (exceeds200k) {
    usageParts.push(`${red}${bold}\u26A0 200K+${reset}`);
  }

  // Workspace line: path, branch, diff vs main
  const workspaceParts = [];
  if (dirPath) {
    workspaceParts.push(`${blue}\uf041 ${dirPath}${reset}`);
  }
  if (branch) {
    const dirtyStr = dirty ? `${coral}${dirty}${reset}` : "";
    const diffStr =
      diffAdded > 0 || diffRemoved > 0
        ? ` ${green}+${diffAdded}${reset} ${red}-${diffRemoved}${reset}`
        : "";
    const wtStr = isWorktree ? ` ${teal}\uf1bb${reset}` : "";
    workspaceParts.push(
      `${violet}\ue725 ${branch}${dirtyStr}${wtStr}${diffStr}${reset}`,
    );
  }
  // Compress leading path in a parts array when line exceeds maxCols
  function compressLeadingPath(parts, rawPath, prefix) {
    if (!rawPath || parts.length === 0) return;
    const totalWidth = visibleLen(parts.join(sep));
    if (totalWidth <= maxCols) return;
    const maxPathLen = Math.max(1, maxCols - (totalWidth - rawPath.length));
    parts[0] = `${prefix}${compressPath(rawPath, maxPathLen)}${reset}`;
  }
  compressLeadingPath(workspaceParts, dirPath, `${blue}\uf041 `);

  // CWD line: shown only when cwd differs from project_dir
  const cwdParts = [];
  if (cwdPath) {
    cwdParts.push(`${dimBlue}\uf124 ${cwdPath}${reset}`);
  }
  compressLeadingPath(cwdParts, cwdPath, `${dimBlue}\uf124 `);

  // Rate limits line: current │ weekly │ updated
  function fmtRate(rateWindow, label) {
    if (
      !rateWindow ||
      rateWindow.used_percentage === undefined ||
      rateWindow.used_percentage === null
    ) {
      const bar = buildBar(0, barWidth);
      return `${gray}${label}${reset} ${bar} ${darkGray}--% \uf017 --:--${reset}`;
    }
    const pct = Math.round(rateWindow.used_percentage);
    const rs = fmtResetTime(rateWindow.resets_at);
    const bar = `${buildBar(pct, barWidth)} ${colorForPct(pct)}${String(pct).padStart(3)}%${reset}`;
    const resetStr = rs
      ? ` ${darkGray}\uf017${reset} ${softWhite}${rs}${reset}`
      : "";
    return `${gray}${label}${reset} ${bar}${resetStr}`;
  }
  const rateParts = [
    fmtRate(usageData?.five_hour, "current"),
    fmtRate(usageData?.seven_day, "weekly"),
  ];

  // ── Collect output lines ────────────────────────────
  const output = [];
  if (versionLine) output.push(versionLine);
  output.push(modelParts.join(sep));
  output.push(usageParts.join(sep));
  if (workspaceParts.length > 0) output.push(workspaceParts.join(sep));
  if (cwdParts.length > 0) output.push(cwdParts.join(sep));
  output.push(rateParts.join(sep));

  return output;
}

module.exports = { render };
