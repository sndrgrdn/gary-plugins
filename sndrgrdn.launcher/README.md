# Launcher

Opens apps and works out calculations from a picker, like [Walker](https://github.com/abenz1267/walker) in [Omarchy](https://github.com/basecamp/omarchy).

![Launcher over the Solitude wallpaper: a search field with "saf" typed, and Safari selected below it](screenshot.png)

## Use

- **alt+space** opens the picker in the middle of the display under the pointer.
  - Type to fuzzy-match app names. "ghd" finds GitHub Desktop.
  - Type a calculation, such as `20% of 50`, `5 ft to cm`, `10 usd to eur`, or `3pm london to new york`, and its answer shows above the apps.
  - Up and down, or tab, move the selection.
  - Return opens the selected app, and so does a click. On the answer, Return copies it and closes the picker.
  - Escape, or a click outside the picker, closes it.

The picker lists the apps that Gary finds in `/Applications`, `/System/Applications`, `~/Applications`, and the folders directly inside them, such as `Utilities`. It reads them when Gary loads it and again each time it opens, so typing never waits for the disk.

The picker learns from the apps you open. Each app you open moves up the list, and the empty picker lists the apps you open most and most recently first. It also remembers what you typed to open an app, so after you open HyperKey with "h", "h" puts HyperKey first. A visit counts for less as it ages, halving every 10 days, and a remembered query counts until 17 days after you last open the app. The picker keeps these visits in Gary's storage for the plugin.

## Calculator

The calculator works out arithmetic, percentages, units, currencies, dates, time zones, and number bases. It shows an answer only when the query is clearly a calculation, so "42" or "firefox" shows apps only.

Currency conversions use the European Central Bank's reference rates from [Frankfurter](https://frankfurter.dev). The plugin fetches them from `api.frankfurter.dev` when Gary loads it, and again once they are more than 12 hours old. It keeps them in Gary's storage, so conversions work offline with the last rates. This request is the plugin's only network use.

## Commands

```sh
gary call sndrgrdn.launcher open    # open the picker
gary call sndrgrdn.launcher state   # the app count, the query, the answer, and the first results
```

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Credits

The calculator, the fuzzy ranking, and the visit scores come from [omacast](https://github.com/typecraft-dev/oma-cast) by typecraft and the omacast contributors. The files in `oma-cast` are copies of its `core/Calculator.js`, `core/Ranker.js`, and `core/Frecency.js` under the MIT licence in [`oma-cast/LICENSE`](oma-cast/LICENSE). The only change turns their CommonJS exports into ES module exports.

## Develop

Gary reloads the plugin each time you save a file in its folder. Type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
