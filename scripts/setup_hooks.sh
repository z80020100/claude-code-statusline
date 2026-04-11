#!/bin/bash
# Configure git to use repo-local hooks from .githooks/.
# Usage: ./scripts/setup_hooks.sh

set -euo pipefail

cd "$(dirname "$0")/.."
git config --local core.hooksPath .githooks
echo "Git hooks path set to: .githooks"
