export function glyph(bluetooth: Gary.Bluetooth | undefined) {
  if (!bluetooth?.power) return "\u{F00B2}";
  return bluetooth.devices.some((device) => device.connected) ? "\u{F00B1}" : "\u{F00AF}";
}
