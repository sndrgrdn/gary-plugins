#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
usage: scripts/screenshot.sh [--rect <x>,<y>,<w>,<h>] [--window] [--keys "<key>..."] [--crop <x>,<width>] <out.png> [<plugin>/<kind> <action>]

Captures a README screenshot in the theme named in scripts/screenshot-theme,
on an empty dinky workspace, then restores the theme and the workspace.
With an action, it clicks that action with `gary action` and captures the
surface that opens; without one, it captures the bar. Name a plugin alone,
with no action, to summon it instead of clicking.
--rect captures that area of the screen, in points, wallpaper included,
for full-screen surfaces such as the launcher and the theme picker.
--window opens a Finder window on the empty workspace, so Front App has an app to show.
--keys presses keys in the opened surface with `gary key` before the capture.
--crop captures only the bar between x and x+width, in points, which is the
frame `gary action` prints for a node; the bar's action, if any, is still clicked.
EOF
}

keys=
crop=
window=
rect=
while [[ ${1:-} == --* ]]; do
    case $1 in
        --keys) keys=${2:?}; shift 2 ;;
        --rect) rect=${2:?}; shift 2 ;;
        --window) window=1; shift ;;
        --crop) crop=${2:?}; shift 2 ;;
        *) usage >&2; exit 2 ;;
    esac
done
[[ $# -eq 1 || $# -eq 2 || $# -eq 3 ]] || { usage >&2; exit 2; }
out=$1
target=${2:-}
action=${3:-}
root=$(cd "$(dirname "$0")" && pwd)
[[ -f $root/screenshot-theme ]] || { echo "write a theme id to scripts/screenshot-theme first" >&2; exit 1; }
theme=$(tr -d "[:space:]" <"$root/screenshot-theme")

windows() {
    osascript -l JavaScript -e '
ObjC.import("CoreGraphics");
const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0));
const rows = [];
for (let i = 0; i < list.count; i++) {
  const w = list.objectAtIndex(i);
  if (!/^gary$/i.test(ObjC.unwrap(w.objectForKey("kCGWindowOwnerName")))) continue;
  if (ObjC.unwrap(w.objectForKey("kCGWindowLayer")) === 26) continue;
  rows.push(ObjC.unwrap(w.objectForKey("kCGWindowNumber")));
}
rows.join("\n");'
}

current_theme=$(gary call sndrgrdn.theme list | python3 -c 'import json,sys; print(next(t["id"] for t in json.load(sys.stdin)["themes"] if t["current"]))')
current_workspace=$(dinky list-workspaces --focused)
empty_workspace=$(dinky list-workspaces --monitor focused --empty | head -1)
[[ -n $empty_workspace ]] || { echo "no empty dinky workspace on this display" >&2; exit 1; }

opened=
restore() {
    [[ -n $window ]] && osascript -e 'tell application "Finder" to close front window' >/dev/null 2>&1 || true
    if [[ -n $opened ]]; then
        if [[ -n $action ]]; then gary action "$target" "$action" >/dev/null 2>&1 || true; else gary hide "$target" >/dev/null 2>&1 || true; fi
    fi
    [[ $theme != "$current_theme" ]] && gary call sndrgrdn.theme set "$current_theme" >/dev/null
    dinky workspace "$current_workspace" >/dev/null
}
trap restore EXIT

dinky workspace "$empty_workspace" >/dev/null
[[ $theme != "$current_theme" ]] && { gary call sndrgrdn.theme set "$theme" >/dev/null; sleep 6; }
[[ -n $window ]] && { osascript -e 'tell application "Finder" to make new Finder window' >/dev/null; sleep 1; }
sleep 1

width=$(osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSScreen.mainScreen.frame.size.width')
before=$(windows)
if [[ -n $target ]]; then
    if [[ -n $action ]]; then gary action "$target" "$action" >/dev/null; else gary summon "$target" >/dev/null; fi
    opened=1
    sleep 3
    [[ -n $keys ]] && { gary key "${target%%/*}" $keys >/dev/null; sleep 1; }
fi

if [[ -n $rect ]]; then
    screencapture -x -R"$rect" "$out"
elif [[ -n $crop ]]; then
    screencapture -x -R"${crop%,*}",0,"${crop#*,}",32 "$out"
elif [[ -z $target ]]; then
    screencapture -x -R0,0,"$width",32 "$out"
else
    id=$(comm -13 <(sort <<<"$before") <(windows | sort) | head -1)
    [[ -n $id ]] || { echo "no new Gary window after $target $action" >&2; exit 1; }
    screencapture -x -o -l"$id" "$out"
fi
echo "$out"
