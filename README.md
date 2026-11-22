# Gary plugins

These are Sander's plugins for [Gary](https://github.com/sndrgrdn/gary), a macOS shell that you extend with TypeScript plugins. They need a Gary built from `main` at [`6bba347`](https://github.com/sndrgrdn/gary/commit/6bba347) or later, which gives plugins the theme's spacing and radius scales and sizes text by its glyphs.

![The bar with the menu snail and Dinky's workspaces on the left, a Do Not Disturb indicator, the clock and the weather beside the notch, and the tray, Bluetooth, Wi‑Fi, audio, display and battery icons on the right](bar.png)

- [`sndrgrdn.audio`](sndrgrdn.audio) shows the volume in the bar, and opens a panel with the output and input volumes and devices, like Omarchy's audio panel.
- [`sndrgrdn.bluetooth`](sndrgrdn.bluetooth) shows Bluetooth in the bar, and opens a panel to turn it on or off and connect your paired devices, like Omarchy's.
- [`sndrgrdn.clipboard`](sndrgrdn.clipboard) keeps a history of the text, images and files you copy, and pastes an earlier entry from a menu on ⌘⇧V.
- [`sndrgrdn.clock`](sndrgrdn.clock) shows the date and time in the bar, in its own format or Omarchy's `dddd HH:mm`, and opens a month calendar with today's events from the Calendar app when you click it.
- [`sndrgrdn.dinky`](sndrgrdn.dinky) shows the workspaces of the [dinky](https://github.com/mikker/Dinky) window manager in the bar.
- [`sndrgrdn.focus-timer`](sndrgrdn.focus-timer) counts down focus and break sessions in the bar, with a panel to start them and a sound at the end.
- [`sndrgrdn.front-app`](sndrgrdn.front-app) shows the name and icon of the app that dinky reports as focused. It needs `sndrgrdn.dinky` and an `app-icon` font in `~/.config/gary/theme.json`, such as `sketchybar-app-font`.
- [`sndrgrdn.indicators`](sndrgrdn.indicators) shows small icons before the clock while a focus session runs, the screen is recording, the Mac stays awake, or a Focus such as Do Not Disturb is on.
- [`sndrgrdn.launcher`](sndrgrdn.launcher) opens apps from a picker that fuzzy-matches their names and learns which apps you open, and works out calculations and conversions, like Walker in Omarchy.
- [`sndrgrdn.menu`](sndrgrdn.menu) opens a keyboard-driven main menu from a snail in the bar or ⌥⇧Space, like the Omarchy menu, to take screenshots and recordings, read text and QR codes, pick a colour, change the theme, keep the Mac awake, and lock or restart it.
- [`sndrgrdn.monitor`](sndrgrdn.monitor) shows a display icon in the bar, and opens a panel with the brightness of each display, like Omarchy's monitor panel.
- [`sndrgrdn.network`](sndrgrdn.network) shows the Wi‑Fi signal in the bar, and opens a panel with the network's details and the networks nearby to join, like Omarchy's.
- [`sndrgrdn.now-playing`](sndrgrdn.now-playing) shows the playing track in the bar, and opens a panel with the artwork, a seek bar and controls when you click it. Scrolling over it changes the volume.
- [`sndrgrdn.osd`](sndrgrdn.osd) takes over the volume and brightness keys and shows the level on a card near the bottom of the screen, like Omarchy's on-screen display.
- [`sndrgrdn.power`](sndrgrdn.power) shows the battery level in the bar, and opens a panel with the battery's health, cycles, time left and charge rate, and CPU and memory use, like Omarchy's power panel.
- [`sndrgrdn.system-load`](sndrgrdn.system-load) shows CPU use over the last minute as a sparkline in the bar, with the current memory use.
- [`sndrgrdn.theme`](sndrgrdn.theme) switches between the Omarchy themes of [theme-switcher](https://github.com/sndrgrdn/theme-switcher) from a menu, and applies the theme to Gary, the wallpaper, and several apps.
- [`sndrgrdn.tray`](sndrgrdn.tray) shows the menu bar icons of other apps in a drawer in the bar, and opens an app's menu when you click its icon.
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

`sndrgrdn.launcher/oma-cast` holds files from [omacast](https://github.com/typecraft-dev/oma-cast), under omacast's own [MIT License](sndrgrdn.launcher/oma-cast/LICENSE).
