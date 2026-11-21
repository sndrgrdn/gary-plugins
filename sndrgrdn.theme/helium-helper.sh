#!/bin/sh
set -eu
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
user=${SUDO_USER:-}
case $user in ''|*/*|.*) echo "run this through sudo" >&2; exit 64 ;; esac
id -u "$user" >/dev/null
directory="/Library/Managed Preferences/$user"
plist="$directory/net.imput.helium.plist"
[ $# -eq 1 ] || { echo "usage: $0 '#rrggbb' | --remove" >&2; exit 64; }
case $1 in
  --remove) rm -f "$plist" ;;
  \#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])
    mkdir -p "$directory"
    tmp=$(mktemp)
    plutil -create xml1 "$tmp"
    plutil -insert BrowserThemeColor -string "$1" "$tmp"
    install -m 644 -o root -g wheel "$tmp" "$plist"
    rm -f "$tmp"
    ;;
  *) echo "usage: $0 '#rrggbb' | --remove" >&2; exit 64 ;;
esac
