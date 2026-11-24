import { host } from "gary:effect";
import { glyph } from "./glyph";

export default {
  render(state) {
    return <text action="toggle" fontSize={13} width={28} align="center" color="foreground">{glyph(state.wifi)}</text>;
  },

  onAction() {
    return host.toggle();
  },
} satisfies Gary.BarWidget;
