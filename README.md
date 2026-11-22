# Gary plugins

These are Sander's plugins for [Gary](https://github.com/sndrgrdn/gary), a macOS shell that you extend with TypeScript plugins. They need Gary 0.3.1 or later, which finds the files a plugin ships relative to its folder.

- `sndrgrdn.battery` shows the battery level in the bar.
- `sndrgrdn.clock` shows the time in the bar.
- `sndrgrdn.dinky` shows the workspaces of the [dinky](https://github.com/mikker/Dinky) window manager in the bar.
- `sndrgrdn.front-app` shows the name and icon of the app that dinky reports as focused. It needs `sndrgrdn.dinky` and an `app-icon` font in `~/.config/gary/theme.json`, such as `sketchybar-app-font`.
- `sndrgrdn.theme` switches between the Omarchy themes of [theme-switcher](https://github.com/sndrgrdn/theme-switcher) from a menu, and applies the theme to Gary, the wallpaper, and several apps.
- `sndrgrdn.weather` shows the weather from [Open-Meteo](https://open-meteo.com) in the bar. It shows Leeuwarden unless you set `latitude` and `longitude` in its settings.

## Install

Clone the repository:

```sh
git clone https://github.com/sndrgrdn/gary-plugins.git
```

To use all the plugins and edit them in place, link the clone as your plugin folder:

```sh
ln -s "$PWD/gary-plugins" ~/.config/gary/plugins
```

The link works only when `~/.config/gary/plugins` does not exist yet. Gary loads every plugin in the folder. Turn on each plugin that you want with `gary plugin enable <id>`.

To install single plugins instead, copy each one into `~/.config/gary/plugins` and turn it on:

```sh
gary plugin add gary-plugins/sndrgrdn.clock --enable
```

## License

The plugins are released under the [MIT License](LICENSE).
