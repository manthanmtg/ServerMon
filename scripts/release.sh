#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh [major|minor|patch|VERSION] [OPTIONS]

Small SemVer release helper.

Arguments:
  major                 Bump X.0.0 from the current base version
  minor                 Bump 0.X.0 from the current base version
  patch                 Bump 0.0.X from the current base version
  VERSION               Set an explicit SemVer version, e.g. 1.2.3 or v1.2.3

Options:
  --remote NAME         Git remote to push to (default: origin)
  --branch NAME         Branch to release from and push (default: remote default branch, fallback: main)
  --dry-run             Show the computed release without changing files
  --no-push             Commit and tag locally, but do not push
  -h, --help            Show this help

If no argument is provided, the script prompts for patch/minor/major/custom.
It updates package.json, commits "chore: release vX.Y.Z", creates an annotated
tag vX.Y.Z, then pushes the branch and tag.
EOF
}

log() {
  printf '  \033[0;34m->\033[0m %s\n' "$1"
}

die() {
  printf '  \033[0;31merror:\033[0m %s\n' "$1" >&2
  exit 1
}

REMOTE="origin"
BRANCH=""
DRY_RUN="false"
PUSH="true"
BUMP=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    major|minor|patch)
      [ -z "$BUMP" ] || die "Only one bump/version argument is allowed."
      BUMP="$1"
      shift
      ;;
    --remote)
      REMOTE="${2:-}"
      [ -n "$REMOTE" ] || die "--remote requires a value."
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      [ -n "$BRANCH" ] || die "--branch requires a value."
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --no-push)
      PUSH="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      die "Unknown option: $1"
      ;;
    *)
      [ -z "$BUMP" ] || die "Only one bump/version argument is allowed."
      BUMP="$1"
      shift
      ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git repository."
cd "$REPO_ROOT"

[ -f package.json ] || die "package.json not found at repository root."

if [ "$DRY_RUN" != "true" ] && [ -n "$(git status --porcelain)" ]; then
  die "Working tree is not clean. Commit or stash changes before releasing."
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [ -z "$CURRENT_BRANCH" ]; then
  die "Detached HEAD is not supported for releases."
fi

DEFAULT_BRANCH="$(
  git symbolic-ref --quiet --short "refs/remotes/$REMOTE/HEAD" 2>/dev/null |
    sed "s#^$REMOTE/##" || true
)"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
BRANCH="${BRANCH:-$DEFAULT_BRANCH}"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  die "Releases must be run from $BRANCH (current branch: $CURRENT_BRANCH). Use --branch $CURRENT_BRANCH to override."
fi

if git remote get-url "$REMOTE" >/dev/null 2>&1; then
  log "Fetching tags from $REMOTE"
  git fetch --tags "$REMOTE" >/dev/null
fi

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
LATEST_TAG="$(
  TAG_LIST="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*')" node <<'NODE'
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parse(version) {
  const match = semver.exec(version || '');
  if (!match) return null;
  return {
    raw: version,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function comparePrerelease(a, b) {
  if (a === b) return 0;
  if (a && !b) return -1;
  if (!a && b) return 1;

  const left = a.split('.');
  const right = b.split('.');
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;

    const leftNumber = /^[0-9]+$/.test(left[index]);
    const rightNumber = /^[0-9]+$/.test(right[index]);

    if (leftNumber && rightNumber) {
      const delta = Number(left[index]) - Number(right[index]);
      if (delta !== 0) return delta;
    } else if (leftNumber) {
      return -1;
    } else if (rightNumber) {
      return 1;
    } else if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }

  return 0;
}

function compare(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

const parsedTags = (process.env.TAG_LIST || '')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((tag) => ({ tag, version: parse(tag.replace(/^v/, '')) }))
  .filter((entry) => entry.version);

parsedTags.sort((a, b) => compare(b.version, a.version));
process.stdout.write(parsedTags[0]?.tag || '');
NODE
)"
LATEST_TAG_VERSION="${LATEST_TAG#v}"

read -r BASE_VERSION SUGGESTED_PATCH SUGGESTED_MINOR SUGGESTED_MAJOR < <(
  node - "$PACKAGE_VERSION" "${LATEST_TAG_VERSION:-}" <<'NODE'
const packageVersion = process.argv[2];
const tagVersion = process.argv[3];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parse(version) {
  const match = semver.exec(version || '');
  if (!match) return null;
  return {
    raw: version,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
    build: match[5] || '',
  };
}

function comparePrerelease(a, b) {
  if (a === b) return 0;
  if (a && !b) return -1;
  if (!a && b) return 1;

  const left = a.split('.');
  const right = b.split('.');
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;

    const leftNumber = /^[0-9]+$/.test(left[index]);
    const rightNumber = /^[0-9]+$/.test(right[index]);

    if (leftNumber && rightNumber) {
      const delta = Number(left[index]) - Number(right[index]);
      if (delta !== 0) return delta;
    } else if (leftNumber) {
      return -1;
    } else if (rightNumber) {
      return 1;
    } else if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }

  return 0;
}

function compare(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

const packageParsed = parse(packageVersion);
if (!packageParsed) {
  console.error(`package.json version is not valid SemVer: ${packageVersion}`);
  process.exit(1);
}
const tagParsed = parse(tagVersion);
const base = tagParsed && compare(tagParsed, packageParsed) > 0 ? tagParsed : packageParsed;
console.log([
  base.raw,
  `${base.major}.${base.minor}.${base.patch + 1}`,
  `${base.major}.${base.minor + 1}.0`,
  `${base.major + 1}.0.0`,
].join(' '));
NODE
)

if [ -z "$BUMP" ]; then
  echo ""
  echo "Current package.json version: $PACKAGE_VERSION"
  echo "Latest SemVer tag: ${LATEST_TAG:-none}"
  echo "Base version: $BASE_VERSION"
  echo ""
  echo "Choose release bump:"
  echo "  1) patch -> $SUGGESTED_PATCH"
  echo "  2) minor -> $SUGGESTED_MINOR"
  echo "  3) major -> $SUGGESTED_MAJOR"
  echo "  4) custom"
  read -r -p "Selection [1]: " selection
  case "${selection:-1}" in
    1|patch) BUMP="patch" ;;
    2|minor) BUMP="minor" ;;
    3|major) BUMP="major" ;;
    4|custom)
      read -r -p "Version (e.g. 1.2.3): " BUMP
      ;;
    *) die "Invalid selection: $selection" ;;
  esac
fi

TARGET_VERSION="$(
  node - "$BASE_VERSION" "$BUMP" <<'NODE'
const baseVersion = process.argv[2];
const requested = process.argv[3].replace(/^v/, '');
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parse(version) {
  const match = semver.exec(version || '');
  if (!match) return null;
  return {
    raw: version,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function comparePrerelease(a, b) {
  if (a === b) return 0;
  if (a && !b) return -1;
  if (!a && b) return 1;

  const left = a.split('.');
  const right = b.split('.');
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;

    const leftNumber = /^[0-9]+$/.test(left[index]);
    const rightNumber = /^[0-9]+$/.test(right[index]);

    if (leftNumber && rightNumber) {
      const delta = Number(left[index]) - Number(right[index]);
      if (delta !== 0) return delta;
    } else if (leftNumber) {
      return -1;
    } else if (rightNumber) {
      return 1;
    } else if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }

  return 0;
}

function compare(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

const base = parse(baseVersion);
if (!base) {
  console.error(`Base version is not valid SemVer: ${baseVersion}`);
  process.exit(1);
}

let next;
if (requested === 'patch') next = `${base.major}.${base.minor}.${base.patch + 1}`;
else if (requested === 'minor') next = `${base.major}.${base.minor + 1}.0`;
else if (requested === 'major') next = `${base.major + 1}.0.0`;
else next = requested;

const parsedNext = parse(next);
if (!parsedNext) {
  console.error(`Requested version is not valid SemVer: ${next}`);
  process.exit(1);
}
if (compare(parsedNext, base) <= 0) {
  console.error(`Requested version ${next} must be greater than base version ${baseVersion}`);
  process.exit(1);
}
process.stdout.write(next);
NODE
)"

TAG="v$TARGET_VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  die "Tag $TAG already exists."
fi

echo ""
echo "Release summary"
echo "  Branch:          $BRANCH"
echo "  Remote:          $REMOTE"
echo "  package.json:    $PACKAGE_VERSION -> $TARGET_VERSION"
echo "  Tag:             $TAG"
echo "  Push:            $PUSH"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  log "Dry run only; no files changed."
  exit 0
fi

node - "$TARGET_VERSION" <<'NODE'
const fs = require('fs');
const version = process.argv[2];
const file = 'package.json';
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = version;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE

git add package.json
git commit -m "chore: release $TAG"
git tag -a "$TAG" -m "$TAG"

if [ "$PUSH" = "true" ]; then
  git push "$REMOTE" "$BRANCH"
  git push "$REMOTE" "$TAG"
else
  log "Created local commit and tag. Push with:"
  echo "  git push $REMOTE $BRANCH"
  echo "  git push $REMOTE $TAG"
fi
