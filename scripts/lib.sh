#!/bin/bash
# Shared helpers for lint and format scripts.

# shellcheck disable=SC2034
FAILED=0
: "${SCRIPT_PREFIX:=unknown}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "$SCRIPT_PREFIX: $1 not found ($2)"
        FAILED=1
        return 1
    fi
}

list_files() {
    local files
    if [ "${STAGED_ONLY:-false}" = "true" ]; then
        files=$(git diff --cached --name-only --diff-filter=d -- "$@")
    else
        files=$(git ls-files -- "$@")
    fi
    for f in $files; do
        if [ -L "$f" ]; then
            echo "$SCRIPT_PREFIX: skipping symlink $f" >&2
        else
            echo "$f"
        fi
    done
}
