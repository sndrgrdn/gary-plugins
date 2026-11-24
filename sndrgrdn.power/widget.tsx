import { host } from "gary:effect";
import { glyph } from "./glyph";

export default {
  render(state) {
    const battery = state.battery;
    if (!battery?.present || battery.percent === null) return null;
    const low = battery.source === "battery" && battery.percent <= 20;
    return (
      <row action="toggle" gap={4}>
        <text key="glyph" fontSize={13} width={28} align="center" color={low ? "bad" : "foreground"}>{glyph(battery, battery.percent)}</text>
        {state.settings.showPercentage === true && <text key="percent" color={low ? "bad" : "foreground"}>{battery.percent}%</text>}
      </row>
    );
  },

  onAction() {
    return host.toggle();
  },
} satisfies Gary.BarWidget;
