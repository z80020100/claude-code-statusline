# shellcheck shell=bash
# Shared constants and detection helpers for install/uninstall/check scripts.
# Source from a sibling script:
#   source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

CLAUDE_DIR="${HOME}/.claude"
# shellcheck disable=SC2034
CONFIG="${CLAUDE_DIR}/claude-code-statusline.json"
PLUGIN_ID="claude-code-statusline@claude-code-statusline"
MARKETPLACE_ID="claude-code-statusline"
PKG_NAME="@z80020100/claude-code-statusline"
# shellcheck disable=SC2034
PLUGIN_DATA_DIR="${CLAUDE_DIR}/plugins/data/claude-code-statusline-claude-code-statusline"

cli_present() {
    command -v claude-code-statusline >/dev/null 2>&1
}

plugin_installed() {
    command -v claude >/dev/null 2>&1 &&
        claude plugin list 2>/dev/null | grep -qF "${PLUGIN_ID}"
}

marketplace_added() {
    command -v claude >/dev/null 2>&1 &&
        claude plugin marketplace list 2>/dev/null | grep -qF "${MARKETPLACE_ID}"
}

npm_global_installed() {
    command -v npm >/dev/null 2>&1 &&
        npm ls -g "${PKG_NAME}" --depth=0 >/dev/null 2>&1
}
