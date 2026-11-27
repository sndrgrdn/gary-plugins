export type Preset = { id: string; name: string; summary: string; equalizer: Gary.Equalizer | null };

export const bassShelf = { frequency: 100, maxGain: 12 };

const harmanBands: Gary.EqualizerBand[] = [
  { type: "lowShelf", frequency: 105, gain: 6.4, q: 0.7 },
  { type: "peak", frequency: 8800, gain: 5.1, q: 1.42 },
  { type: "peak", frequency: 118, gain: -3.1, q: 0.5 },
  { type: "peak", frequency: 37, gain: 0.7, q: 3.96 },
  { type: "peak", frequency: 3169, gain: -1.7, q: 3.89 },
  { type: "highShelf", frequency: 10000, gain: -2.1, q: 0.7 },
  { type: "peak", frequency: 1227, gain: -1.2, q: 2.53 },
  { type: "peak", frequency: 2055, gain: 1.2, q: 3.23 },
  { type: "peak", frequency: 587, gain: 0.4, q: 1.19 },
  { type: "peak", frequency: 5332, gain: -1.1, q: 5.75 },
];

export const presets: Preset[] = [
  { id: "off", name: "Off", summary: "The headphones as they are", equalizer: null },
  {
    id: "harman",
    name: "Harman",
    summary: "HD 6XX corrected to the Harman target",
    equalizer: { preamp: -0.8, bands: harmanBands },
  },
  {
    id: "harman-plus",
    name: "Harman+",
    summary: "Harman with 2.5 dB more bass",
    equalizer: {
      preamp: -0.8,
      bands: [...harmanBands, { type: "lowShelf", frequency: bassShelf.frequency, gain: 2.5, q: 0.7 }],
    },
  },
];

export function presetById(id: string) {
  return presets.find((preset) => preset.id === id) ?? presets[0];
}

export function compose(preset: Preset, bass: number): Gary.Equalizer | null {
  if (!preset.equalizer && bass === 0) return null;
  const base = preset.equalizer ?? { preamp: 0, bands: [] };
  if (bass === 0) return base;
  return {
    preamp: base.preamp,
    bands: [...base.bands, { type: "lowShelf", frequency: bassShelf.frequency, gain: bass, q: 0.7 }],
  };
}
