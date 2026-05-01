#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

STORED_VERSION="${PLUGIN_DATA_DIR}/installed-version"
SETTINGS="${CLAUDE_DIR}/settings.json"

read_json_field() {
    node -e '
        try {
            const v = require(process.argv[1])[process.argv[2]];
            if (v !== undefined && v !== null) {
                console.log(typeof v === "string" ? v : JSON.stringify(v));
            }
        } catch {}
    ' "$1" "$2"
}

plugin_version() {
    claude plugin list 2>/dev/null |
        awk -v id="${PLUGIN_ID}" '
            $NF == id { found = 1; next }
            found && /Version:/ {
                sub(/.*Version:[[:space:]]*/, "")
                print
                exit
            }
        '
}

npm_global_version() {
    npm ls -g "${PKG_NAME}" --depth=0 2>/dev/null |
        awk -v pkg="${PKG_NAME}" '
            index($0, pkg "@") { n = split($0, a, "@"); print a[n] }
        '
}

PLUGIN_PRESENT=no
NPM_PRESENT=no
plugin_installed && PLUGIN_PRESENT=yes
npm_global_installed && NPM_PRESENT=yes

case "${PLUGIN_PRESENT}/${NPM_PRESENT}" in
yes/*) INSTALL_TYPE="plugin" ;;
no/yes) INSTALL_TYPE="standalone npm" ;;
no/no) INSTALL_TYPE="not installed" ;;
esac

echo "Installation type: ${INSTALL_TYPE}"
echo
echo "[Plugin]"
echo "  Installed: ${PLUGIN_PRESENT}"
if [[ "${PLUGIN_PRESENT}" == "yes" ]]; then
    PLUGIN_VERSION="$(plugin_version)"
    [[ -n "${PLUGIN_VERSION}" ]] && echo "  Version: ${PLUGIN_VERSION}"
fi
if [[ -f "${STORED_VERSION}" ]]; then
    echo "  Plugin-installed CLI version: $(cat "${STORED_VERSION}")"
else
    echo "  Plugin-installed CLI version: (not present)"
fi
if marketplace_added; then
    echo "  Marketplace: registered"
else
    echo "  Marketplace: not registered"
fi
echo
echo "[npm global (-g)]"
echo "  Installed: ${NPM_PRESENT}"
if [[ "${NPM_PRESENT}" == "yes" ]]; then
    NPM_VERSION="$(npm_global_version)"
    [[ -n "${NPM_VERSION}" ]] && echo "  Version: ${NPM_VERSION}"
fi
echo
echo "[CLI on PATH]"
if cli_present; then
    echo "  Path: $(command -v claude-code-statusline)"
    echo "  Version: $(claude-code-statusline --version)"
else
    echo "  (not on PATH)"
fi
echo
echo "[Claude Code settings] ${SETTINGS}"
STATUSLINE="$(read_json_field "${SETTINGS}" "statusLine")"
if [[ -n "${STATUSLINE}" ]]; then
    echo "  statusLine: ${STATUSLINE}"
else
    echo "  statusLine: (not configured)"
fi
echo
echo "[User config] ${CONFIG}"
if [[ -f "${CONFIG}" ]]; then
    sed 's/^/  /' "${CONFIG}"
else
    echo "  (absent)"
fi
