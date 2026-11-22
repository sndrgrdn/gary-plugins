# System Load

Shows CPU use over the last 60 seconds as a sparkline in the bar, with the current CPU and memory use.

![System Load widget showing a CPU sparkline, 4% CPU and 58% memory](screenshot.png)

- The sparkline draws one point every 2 seconds, from 0 to 100% CPU.
- Memory counts what Activity Monitor calls Memory Used: app memory, wired memory and compressed memory.
- It shows `--%` until the first sample arrives.

The widget reads Gary's `system` topic, which samples the kernel's counters every 2 seconds and runs no commands. It keeps the last 30 samples for the sparkline.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. Type-check it with `npx -p typescript tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
