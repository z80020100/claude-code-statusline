#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

CACHE_DIR="${CLAUDE_DIR}/.cache"

local_files_present() {
    [[ -f "${CONFIG}" ]] ||
        [[ -f "${CACHE_DIR}/update-check-claude.json" ]] ||
        [[ -f "${CACHE_DIR}/update-check-statusline.json" ]] ||
        [[ -d "${PLUGIN_DATA_DIR}" ]]
}

remove_file() {
    if [[ -f "$1" ]]; then
        echo "==> Removing $1"
        rm -f "$1"
    fi
}

remove_dir() {
    if [[ -d "$1" ]]; then
        echo "==> Removing $1"
        rm -rf "$1"
    fi
}

if ! cli_present && ! plugin_installed && ! marketplace_added && ! npm_global_installed && ! local_files_present; then
    echo "Nothing to uninstall."
    exit 0
fi

if cli_present; then
    echo "==> Clearing statusline configuration via CLI"
    claude-code-statusline setup --uninstall
fi

remove_file "${CONFIG}"
remove_file "${CACHE_DIR}/update-check-claude.json"
remove_file "${CACHE_DIR}/update-check-statusline.json"
remove_dir "${PLUGIN_DATA_DIR}"

if plugin_installed; then
    echo "==> Uninstalling Claude Code plugin (${PLUGIN_ID})"
    claude plugin uninstall "${PLUGIN_ID}"
fi

if marketplace_added; then
    echo "==> Removing marketplace entry (${MARKETPLACE_ID})"
    claude plugin marketplace remove "${MARKETPLACE_ID}"
fi

if npm_global_installed; then
    echo "==> Uninstalling global npm package (${PKG_NAME})"
    npm uninstall -g "${PKG_NAME}"
fi

echo "==> Done."
