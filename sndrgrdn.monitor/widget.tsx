import { Effect, host } from "gary:effect";

export default {
  render(state) {
    const displays = state.brightness?.displays ?? [];
    return <text action="toggle" scrollAction="brightness" fontSize={13} width={27} align="center" color="foreground">{displays.length > 1 ? "\u{F037A}" : "\u{F0379}"}</text>;
  },

  onAction() {
    return host.toggle();
  },

  onScroll(event, state) {
    const displays = (state.brightness?.displays ?? []).filter((display) => display.brightness !== null);
    const display = displays.find((each) => each.builtin) ?? displays[0];
    if (event.action !== "brightness" || event.phase === "momentum" || event.y === 0 || display?.brightness == null) return;
    const value = Math.min(1, Math.max(0.01, display.brightness + event.y * (event.precise ? 0.002 : 0.05)));
    return host.brightness.set(value, display.id).pipe(Effect.catchTag("HostError", (error) => host.log(error.message)));
  },
} satisfies Gary.BarWidget;
