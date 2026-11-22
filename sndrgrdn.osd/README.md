# OSD

Takes over the volume, mute and brightness keys and shows the level in a pill near the bottom of the screen, like Omarchy's on-screen display.

- Each key changes the level in steps of 1/16, like macOS, and the pill shows the new level at once, before the change reaches the system.
- Presses in quick succession each count, so five presses of volume up add five steps.
- The pill hides 1.5 seconds after the last press. Until then it shows the level it set, and after that the level the system reports.
- Brightness changes the built-in display, or the first display whose brightness Gary can set.

Taking over the media keys needs Accessibility. `gary onboarding` lists it if it is missing.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

It has no bar widget, so turn it on with `gary plugin enable sndrgrdn.osd`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
