#!/usr/bin/env bash
set -euo pipefail

SRC="src"
if [[ ! -d "$SRC" ]]; then
  echo "Error: src/ directory not found. Run from the project root."
  exit 1
fi

# ── Colors ──────────────────────────────────────────────
BOLD="\033[1m"
DIM="\033[2m"
RESET="\033[0m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
MAGENTA="\033[35m"
BLUE="\033[34m"
WHITE="\033[97m"
RED="\033[31m"

# ── Helpers ─────────────────────────────────────────────
count_lines() {
  find "$1" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) \
    ! -name "*.test.*" ! -name "*.spec.*" \
    -exec cat {} + 2>/dev/null | wc -l | tr -d ' '
}

count_files() {
  find "$1" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) \
    ! -name "*.test.*" ! -name "*.spec.*" \
    2>/dev/null | wc -l | tr -d ' '
}

count_test_lines() {
  find "$1" -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" \) \
    -exec cat {} + 2>/dev/null | wc -l | tr -d ' '
}

count_test_files() {
  find "$1" -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" \) \
    2>/dev/null | wc -l | tr -d ' '
}

count_lines_ext() {
  find "$SRC" -type f -name "*.$1" ! -name "*.test.*" ! -name "*.spec.*" \
    -exec cat {} + 2>/dev/null | wc -l | tr -d ' '
}

count_files_ext() {
  find "$SRC" -type f -name "*.$1" ! -name "*.test.*" ! -name "*.spec.*" \
    2>/dev/null | wc -l | tr -d ' '
}

safe_pct() {
  local num=$1 denom=$2
  if (( denom == 0 )); then echo 0; else echo $(( num * 100 / denom )); fi
}

bar() {
  local val=$1 max=$2 width=${3:-30} color=${4:-$GREEN}
  if (( max == 0 )); then max=1; fi
  local filled=$(( val * width / max ))
  [[ $filled -eq 0 && $val -gt 0 ]] && filled=1
  local empty=$(( width - filled ))
  printf "${color}"
  for ((i=0; i<filled; i++)); do printf "█"; done
  printf "${DIM}"
  for ((i=0; i<empty; i++)); do printf "░"; done
  printf "${RESET}"
}

separator() {
  printf "  ${DIM}────────────────────────────────────────────────────────────${RESET}\n"
}

# ── Gather Data ─────────────────────────────────────────
TOTAL_LINES=$(count_lines "$SRC")
TOTAL_FILES=$(count_files "$SRC")
TEST_LINES=$(count_test_lines "$SRC")
TEST_FILES=$(count_test_files "$SRC")
ALL_LINES=$(( TOTAL_LINES + TEST_LINES ))
ALL_FILES=$(( TOTAL_FILES + TEST_FILES ))

TS_LINES=$(count_lines_ext "ts")
TS_FILES=$(count_files_ext "ts")
TSX_LINES=$(count_lines_ext "tsx")
TSX_FILES=$(count_files_ext "tsx")
CSS_LINES=$(count_lines_ext "css")
CSS_FILES=$(count_files_ext "css")

# ── Directory Stats ─────────────────────────────────────
declare -a DIR_NAMES=("src/modules" "src/lib" "src/app" "src/components" "src/models" "src/types")
declare -a DIR_LINES=()
declare -a DIR_FILES=()
MAX_DIR_LINES=0

for dir in "${DIR_NAMES[@]}"; do
  if [[ -d "$dir" ]]; then
    l=$(count_lines "$dir")
    f=$(count_files "$dir")
  else
    l=0; f=0
  fi
  DIR_LINES+=("$l")
  DIR_FILES+=("$f")
  (( l > MAX_DIR_LINES )) && MAX_DIR_LINES=$l || true
done

# ── Module Stats ────────────────────────────────────────
declare -a MOD_NAMES=()
declare -a MOD_LINES=()
declare -a MOD_FILES=()
declare -a MOD_TESTS=()
MAX_MOD_LINES=0

if [[ -d "$SRC/modules" ]]; then
  for mod_dir in "$SRC"/modules/*/; do
    [[ -d "$mod_dir" ]] || continue
    mod_name=$(basename "$mod_dir")
    ml=$(count_lines "$mod_dir")
    mf=$(count_files "$mod_dir")
    mt=$(count_test_files "$mod_dir")
    MOD_NAMES+=("$mod_name")
    MOD_LINES+=("$ml")
    MOD_FILES+=("$mf")
    MOD_TESTS+=("$mt")
    (( ml > MAX_MOD_LINES )) && MAX_MOD_LINES=$ml || true
  done
fi

# ── Top Files ───────────────────────────────────────────
TOP_FILES=$(find "$SRC" -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.*" ! -name "*.spec.*" \
  -exec wc -l {} + 2>/dev/null \
  | sort -rn | grep -v ' total$' | head -10)

# ── Git Stats ───────────────────────────────────────────
GIT_AVAILABLE=false
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null; then
  GIT_AVAILABLE=true
  GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
  GIT_COMMITS=$(git rev-list --count HEAD 2>/dev/null || echo "0")
  GIT_CONTRIBUTORS=$(git shortlog -sn --no-merges HEAD 2>/dev/null | wc -l | tr -d ' ')
  GIT_LAST_COMMIT=$(git log -1 --format='%ar' 2>/dev/null || echo "unknown")
  GIT_FIRST_COMMIT=$(git log --max-parents=0 --format='%as' HEAD 2>/dev/null || echo "unknown")
  GIT_TAGS=$(git tag -l 2>/dev/null | wc -l | tr -d ' ')
fi

# ── Dependency Count ────────────────────────────────────
DEPS=0; DEV_DEPS=0
if [[ -f "package.json" ]]; then
  DEPS=$(grep -c '"[^"]*":' <(sed -n '/"dependencies"/,/}/p' package.json) 2>/dev/null || echo 0)
  DEV_DEPS=$(grep -c '"[^"]*":' <(sed -n '/"devDependencies"/,/}/p' package.json) 2>/dev/null || echo 0)
  # Subtract 1 for the section header line if count > 0
  (( DEPS > 0 )) && DEPS=$((DEPS - 1)) || true
  (( DEV_DEPS > 0 )) && DEV_DEPS=$((DEV_DEPS - 1)) || true
fi

# ── Print ───────────────────────────────────────────────
echo ""
printf "  ${BOLD}${CYAN}╔════════════════════════════════════════════════════════╗${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}         ${BOLD}${WHITE}⚡ ServerMon — Project Stats${RESET}                  ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}╚════════════════════════════════════════════════════════╝${RESET}\n"
echo ""

# ── Overview ────────────────────────────────────────────
printf "  ${BOLD}${YELLOW}  OVERVIEW${RESET}\n"
separator
printf "  ${BOLD}${WHITE}  Source Lines   ${GREEN}%'d${RESET}\n" "$TOTAL_LINES"
printf "  ${BOLD}${WHITE}  Source Files   ${GREEN}%'d${RESET}\n" "$TOTAL_FILES"
printf "  ${BOLD}${WHITE}  Test Lines    ${MAGENTA}%'d${RESET}    ${DIM}(%d files)${RESET}\n" "$TEST_LINES" "$TEST_FILES"
printf "  ${BOLD}${WHITE}  Total         ${CYAN}%'d${RESET}    ${DIM}(source + tests)${RESET}\n" "$ALL_LINES"
if (( DEPS > 0 || DEV_DEPS > 0 )); then
  printf "  ${BOLD}${WHITE}  Dependencies  ${BLUE}%d${RESET} prod  ${DIM}+${RESET}  ${BLUE}%d${RESET} dev\n" "$DEPS" "$DEV_DEPS"
fi
TEST_RATIO=$(safe_pct "$TEST_LINES" "$TOTAL_LINES")
printf "  ${BOLD}${WHITE}  Test Ratio    ${MAGENTA}%d%%${RESET}     ${DIM}(test lines / source lines)${RESET}\n" "$TEST_RATIO"
separator
echo ""

# ── By File Type ────────────────────────────────────────
printf "  ${BOLD}${YELLOW}  BY FILE TYPE${RESET}\n"
separator
printf "  ${DIM}  %-10s  %8s  %6s  %s${RESET}\n" "Type" "Lines" "Files" ""

EXT_MAX=$TSX_LINES
(( TS_LINES > EXT_MAX )) && EXT_MAX=$TS_LINES || true

printf "  ${MAGENTA}  %-10s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " ".tsx" "$TSX_LINES" "$TSX_FILES"
bar "$TSX_LINES" "$EXT_MAX" 24 "$MAGENTA"
echo ""

printf "  ${BLUE}  %-10s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " ".ts" "$TS_LINES" "$TS_FILES"
bar "$TS_LINES" "$EXT_MAX" 24 "$BLUE"
echo ""

printf "  ${CYAN}  %-10s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " ".css" "$CSS_LINES" "$CSS_FILES"
bar "$CSS_LINES" "$EXT_MAX" 24 "$CYAN"
echo ""
separator
echo ""

# ── By Directory ────────────────────────────────────────
printf "  ${BOLD}${YELLOW}  BY DIRECTORY${RESET}\n"
separator
printf "  ${DIM}  %-20s  %8s  %5s  %s${RESET}\n" "Directory" "Lines" "Files" ""

COLORS=("$GREEN" "$BLUE" "$MAGENTA" "$CYAN" "$YELLOW" "$WHITE")
for i in "${!DIR_NAMES[@]}"; do
  c="${COLORS[$((i % ${#COLORS[@]}))]}"
  pct=$(safe_pct "${DIR_LINES[$i]}" "$TOTAL_LINES")
  printf "  ${c}  %-20s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " "${DIR_NAMES[$i]}/" "${DIR_LINES[$i]}" "${DIR_FILES[$i]}"
  bar "${DIR_LINES[$i]}" "$MAX_DIR_LINES" 18 "$c"
  printf " ${DIM}%3d%%${RESET}" "$pct"
  echo ""
done
separator
echo ""

# ── Modules ─────────────────────────────────────────────
if (( ${#MOD_NAMES[@]} > 0 )); then
  printf "  ${BOLD}${YELLOW}  MODULES (${#MOD_NAMES[@]})${RESET}\n"
  separator
  printf "  ${DIM}  %-18s  %7s  %5s  %5s  %s${RESET}\n" "Module" "Lines" "Files" "Tests" ""

  # Sort modules by lines (descending) using indexed sort
  declare -a SORTED_IDX=()
  for i in "${!MOD_NAMES[@]}"; do SORTED_IDX+=("$i"); done
  for ((i=0; i<${#SORTED_IDX[@]}; i++)); do
    for ((j=i+1; j<${#SORTED_IDX[@]}; j++)); do
      if (( MOD_LINES[SORTED_IDX[j]] > MOD_LINES[SORTED_IDX[i]] )); then
        tmp=${SORTED_IDX[i]}
        SORTED_IDX[i]=${SORTED_IDX[j]}
        SORTED_IDX[j]=$tmp
      fi
    done
  done

  MOD_COLORS=("$GREEN" "$BLUE" "$MAGENTA" "$CYAN" "$YELLOW" "$WHITE" "$RED")
  for ci in "${!SORTED_IDX[@]}"; do
    idx=${SORTED_IDX[$ci]}
    c="${MOD_COLORS[$((ci % ${#MOD_COLORS[@]}))]}"
    test_indicator=""
    if (( MOD_TESTS[idx] > 0 )); then
      test_indicator="${GREEN}✓${RESET}"
    else
      test_indicator="${DIM}–${RESET}"
    fi
    printf "  ${c}  %-18s${RESET}  ${WHITE}%'7d${RESET}  ${DIM}%5d${RESET}  %b %b   " \
      "${MOD_NAMES[$idx]}" "${MOD_LINES[$idx]}" "${MOD_FILES[$idx]}" "$test_indicator" "${DIM}${MOD_TESTS[$idx]}${RESET}"
    bar "${MOD_LINES[$idx]}" "$MAX_MOD_LINES" 14 "$c"
    echo ""
  done
  separator
  echo ""
fi

# ── Top 10 Largest Files ───────────────────────────────
printf "  ${BOLD}${YELLOW}  TOP 10 LARGEST FILES${RESET}\n"
separator
RANK=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  lines=$(echo "$line" | awk '{print $1}')
  file=$(echo "$line" | awk '{print $2}' | sed "s|^$SRC/||")
  RANK=$((RANK + 1))

  if (( RANK <= 3 )); then
    MEDAL="${BOLD}${YELLOW}"
    case $RANK in
      1) PREFIX="  🥇" ;;
      2) PREFIX="  🥈" ;;
      3) PREFIX="  🥉" ;;
    esac
  else
    MEDAL="${DIM}"
    PREFIX="  ${DIM}$(printf '%2d.' $RANK)${RESET}"
  fi
  printf "  ${PREFIX} ${MEDAL}%'5d${RESET}  ${WHITE}%s${RESET}\n" "$lines" "$file"
done <<< "$TOP_FILES"
separator
echo ""

# ── Git Stats ───────────────────────────────────────────
if $GIT_AVAILABLE; then
  printf "  ${BOLD}${YELLOW}  GIT${RESET}\n"
  separator
  printf "  ${BOLD}${WHITE}  Branch         ${CYAN}%s${RESET}\n" "$GIT_BRANCH"
  printf "  ${BOLD}${WHITE}  Commits        ${GREEN}%s${RESET}\n" "$GIT_COMMITS"
  printf "  ${BOLD}${WHITE}  Contributors   ${MAGENTA}%s${RESET}\n" "$GIT_CONTRIBUTORS"
  printf "  ${BOLD}${WHITE}  Tags           ${BLUE}%s${RESET}\n" "$GIT_TAGS"
  printf "  ${BOLD}${WHITE}  First Commit   ${DIM}%s${RESET}\n" "$GIT_FIRST_COMMIT"
  printf "  ${BOLD}${WHITE}  Last Commit    ${DIM}%s${RESET}\n" "$GIT_LAST_COMMIT"
  separator
  echo ""
fi

printf "  ${DIM}  Generated on $(date '+%B %d, %Y at %H:%M')${RESET}\n"
echo ""
