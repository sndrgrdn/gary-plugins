import { host } from "gary:effect";

const bars = ["\u{F092F}", "\u{F091F}", "\u{F0922}", "\u{F0925}", "\u{F0928}"];

function glyph(wifi: Gary.WiFi | undefined) {
  if (!wifi?.power || !wifi.connected) return "\u{F092E}";
  if (wifi.rssi == null) return bars[4];
  const strength = Math.min(100, Math.max(0, 2 * (wifi.rssi + 100)));
  return bars[Math.max(0, Math.min(4, Math.ceil(strength / 20) - 1))];
}

export default {
  render(state) {
    return <text action="toggle" fontSize={13} width={27} align="center" color="foreground">{glyph(state.wifi)}</text>;
  },

  onAction() {
    return host.toggle();
  },
} satisfies Gary.BarWidget;
