#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
usage: scripts/check-glyphs.sh [<font.ttf>]

Checks that every private-use code point written as \u{...} in the plugins'
.ts and .tsx files is in the font, JetBrainsMono Nerd Font Regular from
~/Library/Fonts by default. It prints each code point with the font's name
for its glyph, and exits with status 1 when the font lacks one.
It runs Python with fontTools through uv, or python3 when uv is missing.
EOF
}

[[ ${1:-} == -h || ${1:-} == --help ]] && { usage; exit 0; }
font=${1:-$HOME/Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf}
[[ -f $font ]] || { echo "no font at $font" >&2; exit 1; }
cd "$(dirname "$0")/.."

python=(python3)
command -v uv >/dev/null && python=(uv run --quiet --with fonttools python)

grep -rhoE --include='*.ts' --include='*.tsx' --exclude-dir=node_modules '\\u\{[0-9A-Fa-f]+\}' . |
    "${python[@]}" -c '
import sys
from fontTools.ttLib import TTFont

cmap = TTFont(sys.argv[1]).getBestCmap()
points = sorted({int(escape[3:-1], 16) for escape in sys.stdin.read().split()})
private = [point for point in points if 0xE000 <= point <= 0xF8FF or point >= 0xF0000]
missing = [point for point in private if point not in cmap]
for point in private:
    name = cmap.get(point, "MISSING")
    print(f"U+{point:05X}  {name}")
print(f"{len(private) - len(missing)} of {len(private)} code points found in {sys.argv[1]}")
sys.exit(1 if missing else 0)
' "$font"
