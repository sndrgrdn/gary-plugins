# Equalizer

Tunes everything you hear with presets, from an equalizer icon in the bar. Click the icon for the menu: pick a preset, and drag **Extra bass** to add up to 12 dB below 100 Hz on top of it.

- **Off** plays the sound unchanged.
- **Harman** corrects the Sennheiser HD 6XX (and HD 650) to the Harman target. Its filters are AutoEq's fit to oratory1990's measurement ([source](https://github.com/jaakkopasanen/AutoEq/tree/master/results/oratory1990/over-ear/Sennheiser%20HD%206XX)).
- **Harman+** is Harman with 2.5 dB more bass below 100 Hz, for drum & bass.

The plugin remembers a choice per output device, so the HD 6XX preset stays on your headphones and the speakers play unchanged. Extra bass makes the bass louder and leaves the rest alone. Gary's limiter turns loud peaks down just enough that they do not clip. Harman's preamp matches its loudness (LUFS, measured on pink noise) to Off, so switching changes the tone and not the volume. Harman+ keeps that preamp, so its extra bass plays louder.

It needs Gary with `host.audio.setEqualizer` and the System Audio Recording permission. The icon is a Nerd Font glyph, so name a Nerd Font `icon` in `~/.config/gary/theme.json`, as `sndrgrdn.audio` describes.

## Develop

Gary reloads the plugin each time you save an entry file. Add a preset to `presets.ts`, with at most 15 bands so the extra bass shelf fits in Gary's 16. Type-check it with `npx tsc -p .`.
