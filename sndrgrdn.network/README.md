# Network

Shows Wi‑Fi in the bar with Omarchy's signal icon, and opens Omarchy's network panel below it: the network you are on with its details, and the networks nearby.

- The icon shows the signal in five steps, or Wi‑Fi off when it is off or not connected.
- The panel shows the signal, rate, channel and noise of the network you are on, with this Mac's IP address and the gateway.
- The switch turns Wi‑Fi on or off.
- Known networks come first, then other networks, each with a lock when it needs a password. Click one to join it. If it needs a password you haven't saved, a password field opens below it.
- Gary cannot disconnect from or forget a network, pick the band or the DNS servers, or tell Ethernet or a captive portal apart, so the panel leaves those out.

The icon is a Nerd Font glyph, so the bar needs a Nerd Font, such as `JetBrainsMono Nerd Font`. Network names need Location. Until you allow it, the panel offers to ask for it.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
