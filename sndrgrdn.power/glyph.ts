const draining = ["\u{F007A}", "\u{F007B}", "\u{F007C}", "\u{F007D}", "\u{F007E}", "\u{F007F}", "\u{F0080}", "\u{F0081}", "\u{F0082}", "\u{F0079}"];
const charging = ["\u{F089C}", "\u{F0086}", "\u{F0087}", "\u{F0088}", "\u{F089D}", "\u{F0089}", "\u{F089E}", "\u{F008A}", "\u{F008B}", "\u{F0085}"];

export function glyph(battery: Gary.Battery, percent: number) {
  const index = Math.max(0, Math.min(9, Math.floor(percent / 10)));
  if (battery.source === "battery") return draining[index];
  if (battery.charging) return charging[index];
  return percent >= 99 ? "\u{F0085}" : draining[index];
}
