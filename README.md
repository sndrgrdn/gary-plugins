# Gary plugins

These are Sander's plugins for [Gary](https://github.com/sndrgrdn/gary), a macOS shell that you extend with TypeScript plugins. They need a Gary built from `main` at [`1d70d89`](https://github.com/sndrgrdn/gary/commit/1d70d89) or later, which reads surfaces and media keys from the manifest and has the `calendar`, `system` and `tray` topics they use.

![The bar with Dinky and Front App on the left, and Weather, Battery and Clock on the right](bar.png)

- [`sndrgrdn.battery`](sndrgrdn.battery) shows the battery level in the bar.
- [`sndrgrdn.clipboard`](sndrgrdn.clipboard) keeps a history of the text, images and files you copy, and pastes an earlier entry from a menu on ⌘⇧V.
- [`sndrgrdn.clock`](sndrgrdn.clock) shows the date and time in the bar, and opens a month calendar with today's events from the Calendar app when you click it.
- [`sndrgrdn.control-center`](sndrgrdn.control-center) opens Wi‑Fi, Bluetooth, Focus, volume and brightness controls from the bar, and shows a pill when you press the volume or brightness keys.
- [`sndrgrdn.dinky`](sndrgrdn.dinky) shows the workspaces of the [dinky](https://github.com/mikker/Dinky) window manager in the bar.
- [`sndrgrdn.focus-timer`](sndrgrdn.focus-timer) counts down focus and break sessions in the bar, with a panel to start them and a sound at the end.
- [`sndrgrdn.front-app`](sndrgrdn.front-app) shows the name and icon of the app that dinky reports as focused. It needs `sndrgrdn.dinky` and an `app-icon` font in `~/.config/gary/theme.json`, such as `sketchybar-app-font`.
- [`sndrgrdn.launcher`](sndrgrdn.launcher) opens apps from a picker that fuzzy-matches their names, like Walker in Omarchy.
- [`sndrgrdn.now-playing`](sndrgrdn.now-playing) shows the playing track in the bar, and opens a panel with the artwork, a seek bar and controls when you click it. Scrolling over it changes the volume.
- [`sndrgrdn.system-load`](sndrgrdn.system-load) shows CPU use over the last minute as a sparkline in the bar, with the current memory use.
- [`sndrgrdn.theme`](sndrgrdn.theme) switches between the Omarchy themes of [theme-switcher](https://github.com/sndrgrdn/theme-switcher) from a menu, and applies the theme to Gary, the wallpaper, and several apps.
- [`sndrgrdn.tray`](sndrgrdn.tray) shows the menu bar icons of other apps in the bar, and opens an app's menu when you click its icon.
- [`sndrgrdn.weather`](sndrgrdn.weather) shows the weather from [Open-Meteo](https://open-meteo.com) in the bar, and opens a 12-hour forecast when you click it. It shows Leeuwarden unless you set `latitude` and `longitude` in its settings.

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

To install the plugins as a package instead, which `gary plugin update` keeps up to date:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

## License

The plugins are released under the [MIT License](LICENSE).
