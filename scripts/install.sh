#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_SLUG="z80020100/claude-code-statusline"
REPO_GIT_URL="https://github.com/${REPO_SLUG}.git"

usage() {
    cat <<EOF >&2
Usage: $0 [local|dev|stable|custom <ref>]
  local           install from ${REPO_ROOT} (default when prompted)
  dev             install from ${REPO_SLUG} (main branch)
  stable          install from ${REPO_SLUG} (latest GitHub release)
  custom <ref>    install from ${REPO_GIT_URL}#<ref> (branch, tag, or SHA)
EOF
}

latest_release_tag() {
    curl -fsSL "https://api.github.com/repos/${REPO_SLUG}/releases/latest" |
        sed -nE 's/.*"tag_name": *"([^"]+)".*/\1/p' |
        head -1
}

prompt_ref() {
    echo "Fetching refs from ${REPO_GIT_URL}..." >&2
    local heads=() tags=() ref name pick i=1
    while IFS=$'\t' read -r _ ref; do
        case "${ref}" in
        refs/heads/*) heads+=("${ref#refs/heads/}") ;;
        refs/tags/*) tags+=("${ref#refs/tags/}") ;;
        esac
    done < <(git ls-remote --heads --tags --refs "${REPO_GIT_URL}")

    local all=()
    ((${#heads[@]} > 0)) && all+=("${heads[@]}")
    ((${#tags[@]} > 0)) && all+=("${tags[@]}")

    if ((${#heads[@]} > 0)); then
        echo "Branches:" >&2
        for name in "${heads[@]}"; do
            printf "  %2d) %s\n" "${i}" "${name}" >&2
            i=$((i + 1))
        done
    fi
    if ((${#tags[@]} > 0)); then
        echo "Tags:" >&2
        for name in "${tags[@]}"; do
            printf "  %2d) %s\n" "${i}" "${name}" >&2
            i=$((i + 1))
        done
    fi

    read -r -p "Select number or type ref: " pick
    if [[ -z "${pick}" ]]; then
        echo "No selection provided" >&2
        exit 1
    fi
    if [[ "${pick}" =~ ^[0-9]+$ ]] && ((pick >= 1 && pick <= ${#all[@]})); then
        printf '%s' "${all[$((pick - 1))]}"
    else
        printf '%s' "${pick}"
    fi
}

SOURCE="${1:-}"
REF="${2:-}"

if [[ -z "${SOURCE}" ]]; then
    echo "Choose installation source:"
    echo "  1) local    ${REPO_ROOT}"
    echo "  2) dev      ${REPO_SLUG} (main branch)"
    echo "  3) stable   ${REPO_SLUG} (latest GitHub release)"
    echo "  4) custom   specific branch, tag, or SHA on ${REPO_SLUG}"
    read -r -p "Enter [1/2/3/4]: " CHOICE
    case "${CHOICE}" in
    1) SOURCE="local" ;;
    2) SOURCE="dev" ;;
    3) SOURCE="stable" ;;
    4)
        SOURCE="custom"
        REF="$(prompt_ref)"
        ;;
    *)
        echo "Invalid choice: ${CHOICE}" >&2
        exit 1
        ;;
    esac
fi

case "${SOURCE}" in
local)
    MARKETPLACE_PATH="${REPO_ROOT}"
    ;;
dev)
    MARKETPLACE_PATH="${REPO_GIT_URL}#main"
    ;;
stable)
    echo "==> Fetching latest release tag from ${REPO_SLUG}"
    REF="$(latest_release_tag)"
    if [[ -z "${REF}" ]]; then
        echo "No release tag found on ${REPO_SLUG}" >&2
        exit 1
    fi
    echo "==> Resolved release: ${REF}"
    MARKETPLACE_PATH="${REPO_GIT_URL}#${REF}"
    ;;
custom)
    if [[ -z "${REF}" ]]; then
        echo "Branch / tag / SHA required" >&2
        usage
        exit 1
    fi
    MARKETPLACE_PATH="${REPO_GIT_URL}#${REF}"
    ;;
*)
    usage
    exit 1
    ;;
esac

echo "==> Adding marketplace: ${MARKETPLACE_PATH}"
claude plugin marketplace add "${MARKETPLACE_PATH}"

echo "==> Installing plugin: ${PLUGIN_ID}"
claude plugin install "${PLUGIN_ID}"

echo "==> Done."
