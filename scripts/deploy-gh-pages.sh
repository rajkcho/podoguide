#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR=${1:-"."}
BRANCH=${2:-"gh-pages"}

ABS_BUILD_DIR=$(cd "$BUILD_DIR" && pwd)
ASSETS_DIR="$ABS_BUILD_DIR/assets"

if [ ! -d "$ASSETS_DIR" ]; then
  echo "Assets directory not found at $ASSETS_DIR" >&2
  exit 1
fi

npm run copy-config "$ASSETS_DIR"

TEMP_DIR=$(mktemp -d)
cleanup(){
  git worktree remove --force "$TEMP_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add "$TEMP_DIR" "$BRANCH"

rsync -a --delete --exclude '.git' "$ABS_BUILD_DIR"/ "$TEMP_DIR"/

pushd "$TEMP_DIR" >/dev/null
if git diff --quiet --cached; then
  echo "No changes to deploy."
else
  git add -A
  git commit -m "Deploy site $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push origin "$BRANCH"
fi
popd >/dev/null
