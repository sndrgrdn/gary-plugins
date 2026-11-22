#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
usage: scripts/screenshot.sh <out.png> [<plugin>/<kind> <action>]

Captures a README screenshot in the theme named in scripts/screenshot-theme,
on an empty dinky workspace, then restores the theme and the workspace.
With an action, it clicks that action with `gary action` and captures the
surface that opens; without one, it captures the bar.
EOF
}

[[ $# -eq 1 || $# -eq 3 ]] || { usage >&2; exit 2; }
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
    [[ -n $opened ]] && gary action "$target" "$action" >/dev/null 2>&1 || true
    [[ $theme != "$current_theme" ]] && gary call sndrgrdn.theme set "$current_theme" >/dev/null
    dinky workspace "$current_workspace" >/dev/null
}
trap restore EXIT

dinky workspace "$empty_workspace" >/dev/null
[[ $theme != "$current_theme" ]] && { gary call sndrgrdn.theme set "$theme" >/dev/null; sleep 3; }
sleep 1

if [[ -z $target ]]; then
    screencapture -x -R0,0,"$(osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSScreen.mainScreen.frame.size.width')",32 "$out"
else
    before=$(windows)
    gary action "$target" "$action" >/dev/null
    opened=1
    sleep 1.5
    id=$(comm -13 <(sort <<<"$before") <(windows | sort) | head -1)
    [[ -n $id ]] || { echo "no new Gary window after $target $action" >&2; exit 1; }
    screencapture -x -o -l"$id" "$out"
fi
echo "$out"
