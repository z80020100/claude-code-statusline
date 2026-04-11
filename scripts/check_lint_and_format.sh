#!/bin/bash
# shellcheck source-path=SCRIPTDIR
# Check lint and format issues on tracked files.
# Usage: ./scripts/check_lint_and_format.sh [--staged]
#   --staged  Only check staged files (used by pre-commit hook)
#   (default) Check all tracked files

set -euo pipefail

# shellcheck disable=SC2034
SCRIPT_PREFIX="check"
# shellcheck disable=SC2034
STAGED_ONLY=false
# shellcheck disable=SC2034
[ "${1:-}" = "--staged" ] && STAGED_ONLY=true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ── JS + JSON + Markdown (requires npx) ───────────────
TARGET_JS=$(list_files '*.js' '*.mjs') || true
TARGET_PRETTIER=$(list_files '*.js' '*.mjs' '*.json' '*.md') || true

if [ -n "$TARGET_JS" ] || [ -n "$TARGET_PRETTIER" ]; then
    if require_cmd npx "brew install node"; then
        if [ -n "$TARGET_JS" ]; then
            echo "check: JS files (eslint)"
            # shellcheck disable=SC2086
            if ! npx --yes eslint $TARGET_JS; then
                echo "check: eslint failed"
                FAILED=1
            fi
        fi

        if [ -n "$TARGET_PRETTIER" ]; then
            echo "check: format (prettier)"
            # shellcheck disable=SC2086
            if ! npx --yes prettier --check $TARGET_PRETTIER; then
                echo "check: prettier failed (run: ./scripts/fix_lint_and_format.sh)"
                FAILED=1
            fi
        fi
    fi
fi

# ── Statusline width check ───────────────────────────
STATUSLINE="lib/statusline.js"
if [[ "$TARGET_JS" == *"$STATUSLINE"* ]]; then
    echo "check: statusline width"
    if ! node test/measure-width.js --check; then
        echo "check: statusline width failed"
        FAILED=1
    fi
fi

# ── Shell: shellcheck + shfmt ─────────────────────────
TARGET_SH=$(list_files '*.sh') || true

if [ -n "$TARGET_SH" ]; then
    if require_cmd shellcheck "brew install shellcheck"; then
        echo "check: shell scripts (shellcheck)"
        # shellcheck disable=SC2086
        if ! shellcheck -x $TARGET_SH; then
            echo "check: shellcheck failed"
            FAILED=1
        fi
    fi

    if require_cmd shfmt "brew install shfmt"; then
        echo "check: shell scripts (shfmt)"
        # shellcheck disable=SC2086
        if ! shfmt -i 4 -d $TARGET_SH; then
            echo "check: shfmt failed (run: ./scripts/fix_lint_and_format.sh)"
            FAILED=1
        fi
    fi
fi

exit "$FAILED"
