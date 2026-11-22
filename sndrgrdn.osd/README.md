# OSD

Takes over the volume, mute and brightness keys and shows the level in a card near the bottom of the screen, like Omarchy's on-screen display.

- Each key changes the level in steps of 1/16, like macOS, and the card shows the new level at once, before the change reaches the system.
- Presses in quick succession each count, so five presses of volume up add five steps.
- The card shows a Nerd Font icon, a bar, and the level as a percentage. Muted shows the muted icon with the level that unmuting returns to, as Omarchy does.
- The card keeps its size and the icon, bar and percentage keep their places whatever the level, so only the bar's fill moves.
- The card hides 1.2 seconds after the last press. Until then it shows the level it set, and after that the level the system reports.
- Brightness changes the built-in display, or the first display whose brightness Gary can set.
- The card uses the theme's `surface` style. For the translucent macOS HUD look, give the root `row` in `osd.tsx` a `radius`, `material="glass"` and a translucent `background`, and set the surface's `background` to `"none"`.

Taking over the media keys needs Accessibility. `gary onboarding` lists it if it is missing.

## Setup

Name a Nerd Font `osd` in `~/.config/gary/theme.json`. The icons are its glyphs and the percentage is set in it:

```json
{ "fonts": { "osd": { "family": "JetBrainsMono Nerd Font", "size": 16, "weight": "bold" } } }
```

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

It has no bar widget, so turn it on with `gary plugin enable sndrgrdn.osd`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
