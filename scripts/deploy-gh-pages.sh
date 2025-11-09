#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR=${1:-"."}
BRANCH=${2:-"gh-pages"}
projectRoot=$(git rev-parse --show-toplevel)

ABS_BUILD_DIR=$(cd "$BUILD_DIR" && pwd)
ASSETS_DIR="$ABS_BUILD_DIR/assets"

if [ ! -d "$ASSETS_DIR" ]; then
  echo "Assets directory not found at $ASSETS_DIR" >&2
  exit 1
fi

npm run copy-config "$ASSETS_DIR"

TEMP_DIR=$(mktemp -d)
cleanup(){
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

git clone --branch "$BRANCH" "$projectRoot" "$TEMP_DIR" >/dev/null 2>&1
rsync -a --delete --exclude '.git' "$ABS_BUILD_DIR"/ "$TEMP_DIR"/

pushd "$TEMP_DIR" >/dev/null
if [ -n "$(git status --short)" ]; then
  git add -A
  git commit -m "Deploy site $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push origin "$BRANCH"
else
  echo "No changes to deploy."
fi
popd >/dev/null
