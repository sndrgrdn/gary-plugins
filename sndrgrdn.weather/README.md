# Weather

Shows the current temperature and conditions in the bar, from [Open-Meteo](https://open-meteo.com).

![Weather menu with the temperature, conditions, and a chart of the forecast](screenshot.png)

- The icon is Omarchy's Nerd Font glyph for the weather: sun, partly cloudy, cloud, fog, rain, snow or thunder, with the moon at night. The bar needs a Nerd Font, such as `JetBrainsMono Nerd Font`.
- It shows `--°C` until the first request succeeds.
- Clicking it opens a panel below it with the conditions, the place, and the temperature for the next 12 hours.
- It refreshes every 15 minutes while the screen is unlocked, and 10 seconds after you unlock the Mac. It keeps the last forecast in its storage, so a reload shows it at once and waits out the 15 minutes.
- It uses Gary's `network` capability. It needs no API key and no permissions.

## Settings

It shows Leeuwarden by default. To show another place, set its coordinates and name in `~/.config/gary/shell.json`:

```json
{ "settings": { "sndrgrdn.weather": { "latitude": 52.37, "longitude": 4.9, "place": "Amsterdam" } } }
```

Without `place`, the panel names the place by its coordinates.

## Setup

Name a Nerd Font `icon` in `~/.config/gary/theme.json`. The panel shows the bar's weather glyph in it:

```json
{ "fonts": { "icon": { "family": "JetBrainsMono Nerd Font", "size": 13, "weight": "regular" } } }
```

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
