import { host } from "gary:effect";
import { anyAlarming } from "./usage";

export default {
  render(state) {
    const providers = state["sndrgrdn.agents"]?.providers ?? [];
    return (
      <row action="toggle">
        <text key="glyph" fontSize={13} width={28} align="center" color={anyAlarming(providers) ? "bad" : "foreground"}>{"\u{F16A3}"}</text>
      </row>
    );
  },

  onAction() {
    return host.toggle();
  },
} satisfies Gary.BarWidget;
