#!/usr/bin/env bash
# check-docs.sh — non-blocking reminder to keep docs/ in sync with src/.
#
# Usage: bash scripts/check-docs.sh [base-ref]
#
# Compares files changed in src/ vs docs/ since <base-ref> (defaults: main when on
# develop, develop when on a feature branch, HEAD~1 otherwise). If src/ changed but
# docs/ didn't, prints heuristic suggestions about which docs to consider updating.
#
# This is informational. It exits 0 either way — never blocks a workflow.
# The discipline rules live in CLAUDE.md § Documentation.

set -euo pipefail

BASE_REF="${1:-}"

if [ -z "$BASE_REF" ]; then
  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
  case "$current_branch" in
    main)    BASE_REF="HEAD~1" ;;
    develop) BASE_REF="main" ;;
    HEAD)    BASE_REF="HEAD~1" ;;
    *)       BASE_REF="develop" ;;
  esac
fi

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null 2>&1; then
  echo "check-docs: base ref '$BASE_REF' not found. Pass one explicitly:"
  echo "  bash scripts/check-docs.sh <ref>"
  exit 0
fi

# Files changed in src/ since the base ref. Skip i18n locale JSON because string
# changes alone shouldn't force a doc edit.
# Compare the working tree (commits + staged + unstaged) against the base ref AND
# include untracked files. So "did I update docs while I was working?" is answered
# correctly mid-branch and at merge time, even when docs/ or src/ files are brand
# new and not yet `git add`-ed.
src_changes="$( {
  git diff --name-only "$BASE_REF" -- 'src/' 2>/dev/null
  git ls-files --others --exclude-standard 'src/' 2>/dev/null
} | sort -u | grep -v '^src/i18n/locales/' | grep -v '^$' || true)"

doc_changes="$( {
  git diff --name-only "$BASE_REF" -- 'docs/' 2>/dev/null
  git ls-files --others --exclude-standard 'docs/' 2>/dev/null
} | sort -u | grep -v '^$' || true)"

print_list() {
  echo "$1" | sed 's/^/  /'
}

if [ -z "$src_changes" ]; then
  echo "check-docs: no src/ changes since $BASE_REF — docs untouched is fine."
  exit 0
fi

if [ -n "$doc_changes" ]; then
  echo "check-docs: src/ changed and docs/ also changed since $BASE_REF — looks good."
  echo
  echo "src/ files changed:"
  print_list "$src_changes"
  echo
  echo "docs/ files changed:"
  print_list "$doc_changes"
  exit 0
fi

# src/ changed, docs/ didn't. Heuristic suggestions.
echo "check-docs: src/ changed since $BASE_REF, but no docs/ updates."
echo
echo "src/ files changed:"
print_list "$src_changes"
echo

suggestions=""
add_suggestion() {
  if [ -z "$suggestions" ]; then
    suggestions="$1"
  else
    suggestions="$suggestions
$1"
  fi
}

if echo "$src_changes" | grep -qE '^src/db/(schema|queries)/'; then
  add_suggestion "  • docs/glossary.md  — vocabulary, invariants, refresh entities, settings keys"
fi
if echo "$src_changes" | grep -qE '^src/app/'; then
  add_suggestion "  • docs/flows.md     — user-facing flows, edge cases, smart defaults"
fi
if echo "$src_changes" | grep -qE '^src/providers/'; then
  add_suggestion "  • docs/architecture.md — provider stack, boot pipeline, data flow"
fi
if echo "$src_changes" | grep -qE '^src/(services/|components/organisms/|db/queries/)'; then
  add_suggestion "  • docs/merge-points.md — cross-cutting touch radius"
fi

if [ -n "$suggestions" ]; then
  echo "Likely candidates based on what changed:"
  echo "$suggestions"
else
  echo "No obvious doc target — pure refactor or visual change is likely; carry on."
fi

echo
echo "Update rules: CLAUDE.md § Documentation. If this is a refactor / visual /"
echo "test-only change, ignore this and continue. Exit code is 0 either way."
exit 0
