# Clock

Shows the date and the time in the bar, such as `Sun 22 Nov  13:45`.

![Clock widget showing Sun 22 Nov and 13:45](screenshot.png)

- The time uses the 24-hour clock and updates every minute.
- The time has a fixed width, so the widgets next to it don't shift when the minutes change.

It reads Gary's `clock` topic and needs no permissions or settings.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. Type-check it with `npx -p typescript tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
