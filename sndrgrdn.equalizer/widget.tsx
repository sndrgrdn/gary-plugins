import { host } from "gary:effect";

export default {
  render(state) {
    const equalizer = state["sndrgrdn.equalizer"];
    const on = equalizer != null && (equalizer.preset !== "off" || equalizer.bass > 0);
    return (
      <text action="toggle" font="icon" fontSize={14} width={28} align="center" color="foreground" opacity={on ? 1 : 0.5} tooltip="Equalizer">
        {"\u{F0EA2}"}
      </text>
    );
  },

  onAction(action) {
    if (action === "toggle") return host.toggle();
  },
} satisfies Gary.BarWidget;
