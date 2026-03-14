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

# ── Helpers ─────────────────────────────────────────────
count_lines() {
  find "$1" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) -exec cat {} + 2>/dev/null | wc -l | tr -d ' '
}

count_files() {
  find "$1" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) 2>/dev/null | wc -l | tr -d ' '
}

count_lines_ext() {
  find "$SRC" -type f -name "*.$1" -exec cat {} + 2>/dev/null | wc -l | tr -d ' '
}

count_files_ext() {
  find "$SRC" -type f -name "*.$1" 2>/dev/null | wc -l | tr -d ' '
}

bar() {
  local val=$1 max=$2 width=${3:-30}
  local filled=$(( val * width / max ))
  [[ $filled -eq 0 && $val -gt 0 ]] && filled=1
  local empty=$(( width - filled ))
  printf "${GREEN}"
  for ((i=0; i<filled; i++)); do printf "█"; done
  printf "${DIM}"
  for ((i=0; i<empty; i++)); do printf "░"; done
  printf "${RESET}"
}

separator() {
  printf "  ${DIM}──────────────────────────────────────────────────────${RESET}\n"
}

# ── Gather Data ─────────────────────────────────────────
TOTAL_LINES=$(count_lines "$SRC")
TOTAL_FILES=$(count_files "$SRC")

TS_LINES=$(count_lines_ext "ts")
TS_FILES=$(count_files_ext "ts")
TSX_LINES=$(count_lines_ext "tsx")
TSX_FILES=$(count_files_ext "tsx")
CSS_LINES=$(count_lines_ext "css")
CSS_FILES=$(count_files_ext "css")

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
  (( l > MAX_DIR_LINES )) && MAX_DIR_LINES=$l
done

TOP_FILES=$(find "$SRC" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + 2>/dev/null \
  | sort -rn | grep -v ' total$' | head -10)

# ── Print ───────────────────────────────────────────────
echo ""
printf "  ${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}\n"
printf "  ${BOLD}${CYAN}║${RESET}       ${BOLD}${WHITE}⚡ ServerMon — Project Stats${RESET}               ${BOLD}${CYAN}║${RESET}\n"
printf "  ${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}\n"
echo ""

printf "  ${BOLD}${YELLOW}  OVERVIEW${RESET}\n"
separator
printf "  ${BOLD}${WHITE}  Total Lines    ${GREEN}%'d${RESET}\n" "$TOTAL_LINES"
printf "  ${BOLD}${WHITE}  Total Files    ${GREEN}%'d${RESET}\n" "$TOTAL_FILES"
separator
echo ""

printf "  ${BOLD}${YELLOW}  BY FILE TYPE${RESET}\n"
separator
printf "  ${DIM}  %-10s  %8s  %6s  %s${RESET}\n" "Type" "Lines" "Files" ""

EXT_MAX=$TSX_LINES
(( TS_LINES > EXT_MAX )) && EXT_MAX=$TS_LINES

printf "  ${MAGENTA}  %-10s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " ".tsx" "$TSX_LINES" "$TSX_FILES"
bar "$TSX_LINES" "$EXT_MAX" 24
echo ""

printf "  ${BLUE}  %-10s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " ".ts" "$TS_LINES" "$TS_FILES"
bar "$TS_LINES" "$EXT_MAX" 24
echo ""

printf "  ${CYAN}  %-10s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " ".css" "$CSS_LINES" "$CSS_FILES"
bar "$CSS_LINES" "$EXT_MAX" 24
echo ""
separator
echo ""

printf "  ${BOLD}${YELLOW}  BY DIRECTORY${RESET}\n"
separator
printf "  ${DIM}  %-20s  %8s  %5s  %s${RESET}\n" "Directory" "Lines" "Files" ""

COLORS=("$GREEN" "$BLUE" "$MAGENTA" "$CYAN" "$YELLOW" "$WHITE")
for i in "${!DIR_NAMES[@]}"; do
  c="${COLORS[$i]}"
  pct=$(( DIR_LINES[i] * 100 / TOTAL_LINES ))
  printf "  ${c}  %-20s${RESET}  ${WHITE}%'8d${RESET}  ${DIM}%5d${RESET}   " "${DIR_NAMES[$i]}/" "${DIR_LINES[$i]}" "${DIR_FILES[$i]}"
  bar "${DIR_LINES[$i]}" "$MAX_DIR_LINES" 18
  printf " ${DIM}%3d%%${RESET}" "$pct"
  echo ""
done
separator
echo ""

printf "  ${BOLD}${YELLOW}  TOP 10 LARGEST FILES${RESET}\n"
separator
RANK=0
while IFS= read -r line; do
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
printf "  ${DIM}  Generated on $(date '+%B %d, %Y at %H:%M')${RESET}\n"
echo ""
