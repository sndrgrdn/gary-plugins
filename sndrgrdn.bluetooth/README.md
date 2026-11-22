# Bluetooth

Shows Bluetooth in the bar with Omarchy's icon, and opens Omarchy's Bluetooth panel below it: a switch to turn Bluetooth on or off, then your connected and paired devices.

- The icon is off, on, or on with a device connected, as in Omarchy. Right-click it to turn Bluetooth on or off.
- Click a device to connect or disconnect it. A connected device shows its battery level when it reports one.
- Gary lists only paired devices, so the panel cannot scan for new devices, pair them or forget them. Pair a new device in System Settings.

The icon is a Nerd Font glyph, so the bar needs a Nerd Font, such as `JetBrainsMono Nerd Font`. Bluetooth needs the Bluetooth permission. Until you allow it, the switch asks for it.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
