export const headphones = /headphone|headset|earbud|earphone|airpod/i;

export function glyph(output: Gary.AudioDeviceState | null | undefined) {
  if (!output) return "\u{EEE8}";
  if (headphones.test(output.name)) return "\u{F02CB}";
  const volume = output.muted ? 0 : output.volume ?? 0;
  return volume >= 0.67 ? "\u{F028}" : volume >= 0.34 ? "\u{F027}" : volume > 0 ? "\u{F026}" : "\u{EEE8}";
}
