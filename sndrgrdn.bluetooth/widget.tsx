import { Effect, host } from "gary:effect";
import { glyph } from "./glyph";

export default {
  render(state) {
    const bluetooth = state.bluetooth;
    if (!bluetooth || (!bluetooth.available && bluetooth.permission !== "notDetermined")) return null;
    return <text action="toggle" rightAction="power" fontSize={13} width={28} align="center" color="foreground">{glyph(bluetooth)}</text>;
  },

  onAction(action, _payload, state) {
    if (action === "toggle") return host.toggle();
    const bluetooth = state.bluetooth;
    if (action !== "power" || !bluetooth) return;
    const change = bluetooth.permission === "notDetermined" ? host.bluetooth.requestAccess() : host.bluetooth.setPower(!bluetooth.power);
    return change.pipe(Effect.catchTag("HostError", (error) => host.log(error.message)));
  },
} satisfies Gary.BarWidget;
