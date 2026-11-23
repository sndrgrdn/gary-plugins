# App Shortcuts

Opens an app with a global shortcut that you set in `shell.json`.

- If the app is in front, the shortcut does nothing.
- If the app runs behind other windows, it comes to the front.
- If the app is not running, it starts.

## Settings

List the shortcuts under `shortcuts` in `~/.config/gary/shell.json`. Each key is a key combination and each value is the app it opens:

```json
{
  "settings": {
    "sndrgrdn.app-shortcuts": {
      "shortcuts": {
        "hyper+return": "com.superlogical.rex",
        "hyper+shift+m": "com.apple.Music",
        "hyper+shift+\\": "com.1password.1password",
        "hyper+shift+y": "~/Applications/Chromium Apps.localized/YouTube.app"
      }
    }
  }
}
```

- A key combination is modifiers and a key joined by `+`, as in the `hotkeys` of a manifest. The modifiers are `cmd`, `ctrl`, `alt`, `shift`, and `hyper`, which is `ctrl+alt+cmd` and pairs with [Hyper Key](../sndrgrdn.hyper-key). A combination needs `cmd`, `ctrl`, `alt` or `hyper`, unless its key is `f1` to `f12`.
- The keys are letters, digits, punctuation, `space`, `return`, `tab`, `delete`, `escape`, `left`, `right`, `up`, `down`, and `f1` to `f12`. JSON writes `\` as `"\\"`.
- The app is a bundle id, such as `com.apple.Music`, or the path to an `.app` that starts with `/` or `~/`. Prefer the bundle id: it names one app even when two apps share a name, such as two web apps called YouTube. To find the bundle id of an app, run `osascript -e 'id of app "Music"'` or `mdls -raw -name kMDItemCFBundleIdentifier "/Applications/Rex.app"`.

Gary reloads the plugin when you save `shell.json`. After an edit, check `~/Library/Logs/gary.log`:

- `hotkey ctrl+alt+shift+cmd+m registered for sndrgrdn.app-shortcuts/hyper+shift+m` means the shortcut works.
- `is already taken by <plugin id>` means another Gary plugin holds the combination, so Gary leaves it out.
- macOS lets two apps register the same combination, so the log does not show a clash with another app. If another app, such as Tinycast or Raycast, uses the same shortcut, both act on it. Remove the shortcut from the other app.
- An invalid combination, or `shortcuts` that is not an object of strings, stops the plugin, and the log says why.
- A shortcut whose app is missing logs `no app with bundle id …` when you press it.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

If you installed the package before this plugin existed, run `gary plugin update` and then `gary plugin enable sndrgrdn.app-shortcuts`.

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
