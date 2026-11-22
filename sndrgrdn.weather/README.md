# Weather

A Gary plugin: bar-widget.

## Install

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

## Develop

Gary reloads the plugin each time you save an entry file. Type-check it with `npx -p typescript tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.

## Settings

The widget reads the current temperature and conditions from [Open-Meteo](https://open-meteo.com) every 15 minutes. It shows Leeuwarden by default. To show another place, set its coordinates in `~/.config/gary/shell.json`:

```json
{ "settings": { "sndrgrdn.weather": { "latitude": 52.37, "longitude": 4.9 } } }
```
