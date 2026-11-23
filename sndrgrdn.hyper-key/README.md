# Hyper Key

Makes a key a Hyper key. Caps Lock is the default. Hold the Hyper key and every key you press gets Control, Option and Command, so a shortcut such as `hyper+m` in [App Shortcuts](../sndrgrdn.app-shortcuts) fires.

- Tapping the Hyper key alone does nothing, unless you set `tap`.
- Caps Lock works as Caps Lock again when you turn the plugin off or quit Gary, and after Gary crashes.
- For Caps Lock, Gary maps Caps Lock to F18 on each keyboard and turns F18 into Hyper. When a keyboard sends Caps Lock anyway, such as one that connected later or one that another app remapped, Gary ignores that one press and maps the keyboards again. Other keys need no mapping, so Gary leaves the keyboard mappings alone.

## Setup

Hyper Key needs Accessibility for Gary. Run `gary permissions request accessibility` and allow it in System Settings.

If you keep Caps Lock as the Hyper key, turn off Caps Lock remapping in other apps, such as the Hyper key of Tinycast or Karabiner-Elements. Two apps that remap Caps Lock take it from each other.

## Settings

Set the settings under `sndrgrdn.hyper-key` in `~/.config/gary/shell.json`. Gary reloads the plugin when you save `shell.json`.

```json
{ "settings": { "sndrgrdn.hyper-key": { "key": "capsLock", "shift": false } } }
```

| Setting | Value | Default |
| --- | --- | --- |
| `key` | The key that is Hyper while you hold it. | `"capsLock"` |
| `shift` | `true` adds Shift to Hyper. | `false` |
| `tap` | The key that a tap of the Hyper key sends. `"capsLock"` toggles Caps Lock. | none |

`key` takes any of these names:

- `capsLock`.
- One side of a modifier: `leftCommand`, `rightCommand`, `leftOption`, `rightOption`, `leftControl`, `rightControl`, `leftShift`, `rightShift`, or `fn`. The other side keeps working as usual, so with `rightCommand`, left Command is still Command.
- A key name from hotkeys: a letter, a digit, punctuation such as `;` or `/`, `return`, `space`, `tab`, `escape`, `delete`, `left`, `right`, `up`, `down`, or `f1` to `f20`.

To make right Command the Hyper key:

```json
{ "settings": { "sndrgrdn.hyper-key": { "key": "rightCommand" } } }
```

To make F19 the Hyper key:

```json
{ "settings": { "sndrgrdn.hyper-key": { "key": "f19" } } }
```

A key that you type with stops typing. With `"key": "a"`, the A key no longer types `a`.

`tap` takes `capsLock` or a key name from hotkeys. A tap is a press and release of the Hyper key within 200 ms, the default tapping term of QMK, with no other key pressed in between. A longer hold or another key sends no tap. To keep Caps Lock as Hyper and send Escape on a tap:

```json
{ "settings": { "sndrgrdn.hyper-key": { "key": "capsLock", "tap": "escape" } } }
```

Use `tap` with Caps Lock, an F key, or one side of a modifier. On a key that you type with, a fast roll into the next key misfires as Hyper, because Hyper Key does no roll handling.

A setting with a wrong value stops the plugin, and `~/Library/Logs/gary.log` says why.

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
