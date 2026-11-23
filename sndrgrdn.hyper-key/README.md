# Hyper Key

Makes Caps Lock a Hyper key. Hold Caps Lock and every key you press gets Control, Option and Command, so a shortcut such as `hyper+m` in [App Shortcuts](../sndrgrdn.app-shortcuts) fires.

- Tapping Caps Lock alone does nothing.
- Caps Lock works as Caps Lock again when you turn the plugin off or quit Gary, and after Gary crashes.
- Gary maps Caps Lock to F18 on each keyboard and turns F18 into Hyper. When a keyboard sends Caps Lock anyway, such as one that connected later or one that another app remapped, Gary ignores that one press and maps the keyboards again.

## Setup

Hyper Key needs Accessibility for Gary. Run `gary permissions request accessibility` and allow it in System Settings.

Turn off Caps Lock remapping in other apps, such as the Hyper key of Tinycast or Karabiner-Elements. Two apps that remap Caps Lock take it from each other.

## Settings

Hyper is Control, Option and Command. To add Shift, set `shift` to `true` in `~/.config/gary/shell.json`:

```json
{ "settings": { "sndrgrdn.hyper-key": { "shift": true } } }
```

`shift` is `true` or `false`, and `false` when you leave it out. Gary reloads the plugin when you save `shell.json`. A value that is not `true` or `false` stops the plugin, and `~/Library/Logs/gary.log` says why.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

If you installed the package before this plugin existed, run `gary plugin update` and then `gary plugin enable sndrgrdn.hyper-key`.

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
