#!/usr/bin/env node

// CLI integration tests.
// Usage: node test/cli.js
//   Runs all tests and exits with code 1 on failure.

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI = path.join(__dirname, "..", "bin", "claude-code-statusline.js");
const PKG = require("../package.json");

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`\x1b[38;5;114m\u2713\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    console.log(`\x1b[38;5;167m\u2717\x1b[0m ${name}`);
    console.log(`  ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(args = [], opts = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: 10000,
    ...opts,
  });
}

function withTmpHome(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-test-"));
  try {
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

function seedSettings(tmp, data) {
  const dir = path.join(tmp, ".claude");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "settings.json"),
    JSON.stringify(data) + "\n",
  );
}

// ── --version ────────────────────────────────────────

test("--version prints package version", () => {
  assert(run(["--version"]).trim() === PKG.version, "version mismatch");
});

test("-v prints package version", () => {
  assert(run(["-v"]).trim() === PKG.version, "version mismatch");
});

// ── --help ───────────────────────────────────────────

test("--help prints complete help output", () => {
  const out = run(["--help"]);
  assert(out.includes(`${PKG.name} v${PKG.version}`), "missing name/version");
  assert(out.includes(PKG.description), "missing description");
  assert(out.includes("Usage:"), "missing Usage:");
  assert(out.includes("claude-code-statusline icons"), "missing icons command");
  assert(
    out.includes("claude-code-statusline update-check"),
    "missing update-check command",
  );
  assert(out.includes(PKG.author), "missing author");
  assert(out.includes(PKG.license), "missing license");
});

test("-h prints help", () => {
  assert(run(["-h"]).includes("Usage:"), "missing Usage:");
});

// ── stdin render ─────────────────────────────────────

test("stdin with valid JSON renders model name", () => {
  const input = JSON.stringify({ model: { display_name: "Test Model" } });
  assert(run([], { input }).includes("Test Model"), "missing model name");
});

test("stdin with invalid JSON exits silently", () => {
  const out = run([], { input: "not json" });
  assert(out === "", `expected empty output but got "${out}"`);
});

const UNDERLINE = "\x1b[4m";
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

test("stdin effort.level overrides settings.effortLevel", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { effortLevel: "low" });
    const input = JSON.stringify({
      model: { display_name: "Test Model" },
      effort: { level: "xhigh" },
    });
    const out = run([], { input, env: cleanEnv({ HOME: tmp }) });
    assert(out.includes("xhigh"), `expected "xhigh" in output, got: ${out}`);
    assert(!out.includes(" low"), `unexpected "low" in output: ${out}`);
  });
});

test("effort source: settings.effortLevel set renders explicit (no marker)", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { effortLevel: "high" });
    const input = JSON.stringify({
      model: { display_name: "M" },
      effort: { level: "high" },
    });
    const out = run([], { input, env: cleanEnv({ HOME: tmp }) });
    assert(
      !stripAnsi(out).includes("auto high"),
      `unexpected auto prefix: ${out}`,
    );
    assert(!out.includes(UNDERLINE), `unexpected underline: ${out}`);
  });
});

test("effort source: no env, no effortLevel renders auto prefix", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, {});
    const input = JSON.stringify({
      model: { display_name: "M" },
      effort: { level: "xhigh" },
    });
    const out = run([], { input, env: cleanEnv({ HOME: tmp }) });
    assert(
      stripAnsi(out).includes("auto xhigh"),
      `expected "auto xhigh" prefix: ${out}`,
    );
    assert(!out.includes(UNDERLINE), `unexpected underline: ${out}`);
  });
});

test("effort source: env-locked level underlines the level", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { env: { CLAUDE_CODE_EFFORT_LEVEL: "high" } });
    const input = JSON.stringify({
      model: { display_name: "M" },
      effort: { level: "high" },
    });
    const out = run([], { input, env: cleanEnv({ HOME: tmp }) });
    assert(out.includes(`${UNDERLINE}high`), `expected underline+high: ${out}`);
    assert(
      !stripAnsi(out).includes("auto high"),
      `unexpected auto prefix: ${out}`,
    );
  });
});

test("effort source: env-locked auto underlines auto and shows resolved level", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { env: { CLAUDE_CODE_EFFORT_LEVEL: "auto" } });
    const input = JSON.stringify({
      model: { display_name: "M" },
      effort: { level: "xhigh" },
    });
    const out = run([], { input, env: cleanEnv({ HOME: tmp }) });
    assert(out.includes(`${UNDERLINE}auto`), `expected underline+auto: ${out}`);
    assert(
      stripAnsi(out).includes("auto xhigh"),
      `expected "auto xhigh": ${out}`,
    );
  });
});

// ── setup / uninstall ────────────────────────────────

test("setup creates settings.json with statusLine", () => {
  withTmpHome((tmp) => {
    run(["setup"], { env: { ...process.env, HOME: tmp } });
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(
      settings.statusLine?.command === "claude-code-statusline",
      "statusLine.command not set",
    );
    assert(settings.statusLine?.type === "command", "statusLine.type not set");
  });
});

test("setup reports already configured on second run", () => {
  withTmpHome((tmp) => {
    const env = { ...process.env, HOME: tmp };
    run(["setup"], { env });
    assert(
      run(["setup"], { env }).includes("Already configured"),
      "missing already-configured message",
    );
  });
});

test("setup prints Nerd Font icons hint", () => {
  withTmpHome((tmp) => {
    const out = run(["setup"], { env: { ...process.env, HOME: tmp } });
    assert(
      out.includes("claude-code-statusline icons nerd"),
      "missing icons hint",
    );
  });
});

test("setup --uninstall removes statusLine", () => {
  withTmpHome((tmp) => {
    const env = { ...process.env, HOME: tmp };
    run(["setup"], { env });
    run(["setup", "--uninstall"], { env });
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(!settings.statusLine, "statusLine should be removed");
  });
});

test("setup --uninstall on empty settings reports no changes", () => {
  withTmpHome((tmp) => {
    assert(
      run(["setup", "--uninstall"], {
        env: { ...process.env, HOME: tmp },
      }).includes("No statusLine setting found"),
      "missing no-setting message",
    );
  });
});

test("setup preserves existing settings keys", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { existingKey: "value" });
    const env = { ...process.env, HOME: tmp };
    run(["setup"], { env });
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(settings.existingKey === "value", "existing key was lost");
    assert(
      settings.statusLine?.command === "claude-code-statusline",
      "statusLine not added",
    );
  });
});

test("setup --uninstall preserves other settings keys", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, {
      otherKey: 42,
      statusLine: { type: "command", command: "claude-code-statusline" },
    });
    const env = { ...process.env, HOME: tmp };
    run(["setup", "--uninstall"], { env });
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(!settings.statusLine, "statusLine should be removed");
    assert(settings.otherKey === 42, "other key was lost");
  });
});

test("setup does not overwrite different statusLine without confirmation", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, {
      statusLine: { type: "command", command: "other-tool" },
    });
    const env = { ...process.env, HOME: tmp };
    const out = run(["setup"], { env });
    assert(
      out.includes("Current statusLine setting"),
      "missing prompt message",
    );
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(
      settings.statusLine.command === "other-tool",
      "statusLine was overwritten without confirmation",
    );
  });
});

test("setup --command writes custom statusLine command", () => {
  withTmpHome((tmp) => {
    run(["setup", "--command", "node /custom/path"], {
      env: { ...process.env, HOME: tmp },
    });
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(
      settings.statusLine?.command === "node /custom/path",
      "statusLine.command not set to custom value",
    );
    assert(settings.statusLine?.type === "command", "statusLine.type not set");
  });
});

test("setup --command reports already configured for same custom command", () => {
  withTmpHome((tmp) => {
    const env = { ...process.env, HOME: tmp };
    run(["setup", "--command", "custom"], { env });
    assert(
      run(["setup", "--command", "custom"], { env }).includes(
        "Already configured",
      ),
      "missing already-configured message",
    );
  });
});

test("setup --command suppresses Nerd Font icons hint", () => {
  withTmpHome((tmp) => {
    const out = run(["setup", "--command", "custom"], {
      env: { ...process.env, HOME: tmp },
    });
    assert(
      !out.includes("claude-code-statusline icons nerd"),
      "icons hint should be suppressed for custom command",
    );
  });
});

test("setup --command without value exits with error", () => {
  withTmpHome((tmp) => {
    try {
      run(["setup", "--command"], {
        env: { ...process.env, HOME: tmp },
        stdio: ["pipe", "pipe", "pipe"],
      });
      throw new Error("expected command to fail");
    } catch (err) {
      assert(err.status === 1, "expected exit code 1");
      assert(
        err.stderr.includes("--command requires a value"),
        "missing --command requires a value message",
      );
    }
  });
});

test("setup --command rejects value starting with --", () => {
  withTmpHome((tmp) => {
    try {
      run(["setup", "--command", "--some-typo"], {
        env: { ...process.env, HOME: tmp },
        stdio: ["pipe", "pipe", "pipe"],
      });
      throw new Error("expected command to fail");
    } catch (err) {
      assert(err.status === 1, "expected exit code 1");
      assert(
        err.stderr.includes("--command requires a value"),
        "missing --command requires a value message",
      );
    }
  });
});

test("setup rejects --command combined with --uninstall (preserves statusLine)", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, {
      statusLine: { type: "command", command: "existing" },
    });
    try {
      run(["setup", "--command", "custom", "--uninstall"], {
        env: { ...process.env, HOME: tmp },
        stdio: ["pipe", "pipe", "pipe"],
      });
      throw new Error("expected command to fail");
    } catch (err) {
      assert(err.status === 1, "expected exit code 1");
      assert(
        err.stderr.includes("--command and --uninstall cannot be combined"),
        "missing combination error",
      );
    }
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(
      settings.statusLine?.command === "existing",
      "existing statusLine should not be deleted",
    );
  });
});

test("setup rejects --uninstall combined with --command (preserves statusLine)", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, {
      statusLine: { type: "command", command: "existing" },
    });
    try {
      run(["setup", "--uninstall", "--command", "custom"], {
        env: { ...process.env, HOME: tmp },
        stdio: ["pipe", "pipe", "pipe"],
      });
      throw new Error("expected command to fail");
    } catch (err) {
      assert(err.status === 1, "expected exit code 1");
      assert(
        err.stderr.includes("--command and --uninstall cannot be combined"),
        "missing combination error",
      );
    }
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, ".claude", "settings.json"), "utf8"),
    );
    assert(
      settings.statusLine?.command === "existing",
      "existing statusLine should not be deleted",
    );
  });
});

test("setup treats statusLine with missing type as different", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, {
      statusLine: { command: "claude-code-statusline" },
    });
    const out = run(["setup"], { env: { ...process.env, HOME: tmp } });
    assert(
      !out.includes("Already configured"),
      "should not short-circuit when type is missing",
    );
    assert(
      out.includes("Current statusLine setting"),
      "should prompt for overwrite",
    );
  });
});

test("setup treats statusLine with non-command type as different", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, {
      statusLine: { type: "url", command: "claude-code-statusline" },
    });
    const out = run(["setup"], { env: { ...process.env, HOME: tmp } });
    assert(
      !out.includes("Already configured"),
      "should not short-circuit when type is non-command",
    );
    assert(
      out.includes("Current statusLine setting"),
      "should prompt for overwrite",
    );
  });
});

test("setup warns when claude-code-statusline is not on PATH", () => {
  withTmpHome((tmp) => {
    const out = run(["setup"], { env: { HOME: tmp, PATH: "" } });
    assert(out.includes("not on your PATH"), "missing PATH warning");
  });
});

test("setup omits PATH warning when binary is reachable", () => {
  withTmpHome((tmp) => {
    const fakeBin = path.join(tmp, "fake-bin");
    fs.mkdirSync(fakeBin);
    const fakeExe = path.join(fakeBin, "claude-code-statusline");
    fs.writeFileSync(fakeExe, "");
    fs.chmodSync(fakeExe, 0o755);
    const out = run(["setup"], { env: { HOME: tmp, PATH: fakeBin } });
    assert(
      !out.includes("not on your PATH"),
      "should not warn when binary is reachable",
    );
  });
});

// ── icons resolution ─────────────────────────────────
// The clock icon renders unconditionally in every output, so it is a
// stable probe for which icon set was selected.

const NERD_CLOCK = "\uf017";
const UNICODE_CLOCK = "\u25F7";
const RENDER_INPUT = JSON.stringify({ model: { display_name: "T" } });

function cleanEnv(extra) {
  const env = { ...process.env };
  delete env.CLAUDE_STATUSLINE_ICONS;
  delete env.CLAUDE_CODE_EFFORT_LEVEL;
  return { ...env, ...extra };
}

function seedConfig(tmp, data) {
  const dir = path.join(tmp, ".claude");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "claude-code-statusline.json"),
    JSON.stringify(data) + "\n",
  );
}

test("icons defaults to unicode when nothing is configured", () => {
  withTmpHome((tmp) => {
    const out = run([], {
      input: RENDER_INPUT,
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes(UNICODE_CLOCK), "expected unicode clock");
    assert(!out.includes(NERD_CLOCK), "unexpected nerd clock");
  });
});

test("icons honors process.env.CLAUDE_STATUSLINE_ICONS", () => {
  withTmpHome((tmp) => {
    const out = run([], {
      input: RENDER_INPUT,
      env: cleanEnv({ HOME: tmp, CLAUDE_STATUSLINE_ICONS: "nerd" }),
    });
    assert(out.includes(NERD_CLOCK), "expected nerd clock");
  });
});

test("icons honors settings.env.CLAUDE_STATUSLINE_ICONS", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { env: { CLAUDE_STATUSLINE_ICONS: "nerd" } });
    const out = run([], {
      input: RENDER_INPUT,
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes(NERD_CLOCK), "expected nerd clock");
  });
});

test("icons honors claude-code-statusline.json", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { icons: "nerd" });
    const out = run([], {
      input: RENDER_INPUT,
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes(NERD_CLOCK), "expected nerd clock");
  });
});

test("icons settings.env beats config file", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { env: { CLAUDE_STATUSLINE_ICONS: "nerd" } });
    seedConfig(tmp, { icons: "unicode" });
    const out = run([], {
      input: RENDER_INPUT,
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes(NERD_CLOCK), "expected nerd clock");
  });
});

test("icons process.env beats settings.env and config", () => {
  withTmpHome((tmp) => {
    seedSettings(tmp, { env: { CLAUDE_STATUSLINE_ICONS: "unicode" } });
    seedConfig(tmp, { icons: "unicode" });
    const out = run([], {
      input: RENDER_INPUT,
      env: cleanEnv({ HOME: tmp, CLAUDE_STATUSLINE_ICONS: "nerd" }),
    });
    assert(out.includes(NERD_CLOCK), "expected nerd clock");
  });
});

test("icons command reports unicode default", () => {
  withTmpHome((tmp) => {
    const out = run(["icons"], {
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes("Current icons: unicode"), "missing current mode");
    assert(
      out.includes(path.join(tmp, ".claude", "claude-code-statusline.json")),
      "missing config path",
    );
  });
});

test("icons command sets nerd config", () => {
  withTmpHome((tmp) => {
    const out = run(["icons", "nerd"], {
      env: cleanEnv({ HOME: tmp }),
    });
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(out.includes("Set icons to nerd"), "missing set message");
    assert(cfg.icons === "nerd", "icons not set");
  });
});

test("icons command sets unicode explicitly", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { icons: "nerd" });
    const out = run(["icons", "unicode"], {
      env: cleanEnv({ HOME: tmp }),
    });
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(out.includes("Set icons to unicode"), "missing set message");
    assert(cfg.icons === "unicode", "icons not set");
  });
});

test("icons command preserves existing config keys", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { futureKey: 1 });
    run(["icons", "nerd"], {
      env: cleanEnv({ HOME: tmp }),
    });
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(cfg.icons === "nerd", "icons not set");
    assert(cfg.futureKey === 1, "existing key lost");
  });
});

test("icons command rejects invalid mode", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { icons: "nerd" });
    try {
      run(["icons", "bogus"], {
        env: cleanEnv({ HOME: tmp }),
        stdio: ["pipe", "pipe", "pipe"],
      });
      throw new Error("expected command to fail");
    } catch (err) {
      assert(err.status === 1, "expected exit code 1");
      assert(
        err.stderr.includes('Expected "unicode" or "nerd".'),
        "missing invalid mode message",
      );
    }
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(cfg.icons === "nerd", "config should not change");
  });
});

test("icons invalid value falls back to unicode default", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { icons: "bogus" });
    const out = run([], {
      input: RENDER_INPUT,
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes(UNICODE_CLOCK), "expected unicode clock");
    assert(!out.includes(NERD_CLOCK), "unexpected nerd clock");
  });
});

// ── update-check CLI command ─────────────────────────

test("update-check command reports all targets off by default", () => {
  withTmpHome((tmp) => {
    const out = run(["update-check"], {
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes("Current update check:"), "missing header");
    assert(out.includes("claude: off"), "missing claude state");
    assert(
      out.includes(path.join(tmp, ".claude", "claude-code-statusline.json")),
      "missing config path",
    );
  });
});

test("update-check claude reports single target state", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { updateCheck: { claude: true } });
    const out = run(["update-check", "claude"], {
      env: cleanEnv({ HOME: tmp }),
    });
    assert(out.includes("claude: on"), "missing claude on state");
  });
});

test("update-check claude on enables the target", () => {
  withTmpHome((tmp) => {
    const out = run(["update-check", "claude", "on"], {
      env: cleanEnv({ HOME: tmp }),
    });
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(
      out.includes("Set claude update check to on"),
      "missing set message",
    );
    assert(cfg.updateCheck?.claude === true, "claude not enabled");
  });
});

test("update-check claude off disables the target", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { updateCheck: { claude: true } });
    const out = run(["update-check", "claude", "off"], {
      env: cleanEnv({ HOME: tmp }),
    });
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(
      out.includes("Set claude update check to off"),
      "missing set message",
    );
    assert(cfg.updateCheck?.claude === false, "claude not disabled");
  });
});

test("update-check all on enables every known target", () => {
  withTmpHome((tmp) => {
    run(["update-check", "all", "on"], {
      env: cleanEnv({ HOME: tmp }),
    });
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(cfg.updateCheck?.claude === true, "claude not enabled by all");
  });
});

test("update-check command preserves existing config keys", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { icons: "nerd" });
    run(["update-check", "claude", "on"], {
      env: cleanEnv({ HOME: tmp }),
    });
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(cfg.updateCheck?.claude === true, "claude not set");
    assert(cfg.icons === "nerd", "existing key lost");
  });
});

test("update-check rejects invalid target", () => {
  withTmpHome((tmp) => {
    try {
      run(["update-check", "bogus", "on"], {
        env: cleanEnv({ HOME: tmp }),
        stdio: ["pipe", "pipe", "pipe"],
      });
      throw new Error("expected command to fail");
    } catch (err) {
      assert(err.status === 1, "expected exit code 1");
      assert(
        err.stderr.includes('Invalid target "bogus"'),
        "missing invalid target message",
      );
    }
  });
});

test("update-check rejects invalid value", () => {
  withTmpHome((tmp) => {
    seedConfig(tmp, { updateCheck: { claude: true } });
    try {
      run(["update-check", "claude", "yes"], {
        env: cleanEnv({ HOME: tmp }),
        stdio: ["pipe", "pipe", "pipe"],
      });
      throw new Error("expected command to fail");
    } catch (err) {
      assert(err.status === 1, "expected exit code 1");
      assert(
        err.stderr.includes('Expected "on" or "off".'),
        "missing invalid value message",
      );
    }
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(tmp, ".claude", "claude-code-statusline.json"),
        "utf8",
      ),
    );
    assert(cfg.updateCheck?.claude === true, "config should not change");
  });
});

// ── summary ──────────────────────────────────────────

console.log();
if (failed) {
  console.log(`\x1b[38;5;167m${failed} test(s) failed.\x1b[0m`);
} else {
  console.log(`\x1b[38;5;114mAll tests passed.\x1b[0m`);
}

process.exit(failed ? 1 : 0);
