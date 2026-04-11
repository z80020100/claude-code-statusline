#!/bin/bash
# shellcheck source-path=SCRIPTDIR
# Auto-fix lint and format issues on tracked files.
# Usage: ./scripts/fix_lint_and_format.sh

set -euo pipefail

# shellcheck disable=SC2034
SCRIPT_PREFIX="fix"
# shellcheck disable=SC2034
STAGED_ONLY=false

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ── JS + JSON + Markdown (requires npx) ───────────────
TARGET_JS=$(list_files '*.js' '*.mjs') || true
TARGET_PRETTIER=$(list_files '*.js' '*.mjs' '*.json' '*.md') || true

if [ -n "$TARGET_JS" ] || [ -n "$TARGET_PRETTIER" ]; then
    if require_cmd npx "brew install node"; then
        if [ -n "$TARGET_JS" ]; then
            echo "fix: JS files (eslint)"
            # shellcheck disable=SC2086
            npx --yes eslint --fix $TARGET_JS || true
        fi

        if [ -n "$TARGET_PRETTIER" ]; then
            echo "fix: format (prettier)"
            # shellcheck disable=SC2086
            npx --yes prettier --write $TARGET_PRETTIER || true
        fi
    fi
fi

# ── Shell: shfmt ──────────────────────────────────────
TARGET_SH=$(list_files '*.sh' '.githooks/*') || true

if [ -n "$TARGET_SH" ]; then
    if require_cmd shfmt "brew install shfmt"; then
        echo "fix: shell scripts (shfmt)"
        # shellcheck disable=SC2086
        shfmt -i 4 -w $TARGET_SH || true
    fi
fi

echo "fix: done"
