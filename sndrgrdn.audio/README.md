# Audio

Shows the volume in the bar with Omarchy's speaker icon, and opens Omarchy's audio panel below it: a switch that mutes everything, then the output and the input, each with a volume slider and its devices.

- The icon shows the volume in three steps, muted, or headphones when the output is headphones.
- Right-click the icon to mute or unmute the output and the input. Scroll over it to change the volume.
- Click a device to make it the output or the input. Right-click a slider to mute or unmute that side.
- Gary cannot set the volume of a single app, so the panel has no per-app mixer.

The icon is a Nerd Font glyph, so the bar needs a Nerd Font, such as `JetBrainsMono Nerd Font`. For the pill that the volume keys show, turn on `sndrgrdn.osd`.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
