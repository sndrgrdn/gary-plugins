import { Effect, host } from "gary:effect";
import type { HostError } from "gary:effect";

const headphones = /headphone|headset|earbud|earphone|airpod/i;

function glyph(output: Gary.AudioDeviceState | null | undefined) {
  if (!output) return "\u{EEE8}";
  if (headphones.test(output.name)) return "\u{F02CB}";
  const volume = output.muted ? 0 : output.volume ?? 0;
  return volume >= 0.67 ? "\u{F028}" : volume >= 0.34 ? "\u{F027}" : volume > 0 ? "\u{F026}" : "\u{EEE8}";
}

function run(effect: Effect.Effect<unknown, HostError>) {
  return effect.pipe(Effect.catchTag("HostError", (error) => host.log(error.message)));
}

export default {
  render(state) {
    return <text action="toggle" rightAction="mute" scrollAction="volume" fontSize={13} width={27} align="center" color="foreground">{glyph(state.audio?.output)}</text>;
  },

  onAction(action, _payload, state) {
    if (action === "toggle") return host.toggle();
    const { output, input } = state.audio ?? {};
    if (action !== "mute" || !output) return;
    const mute = !output.muted || (input != null && !input.muted);
    return run(Effect.all([host.audio.setMuted(mute), input ? host.audio.setMuted(mute, "input") : Effect.void]));
  },

  onScroll(event, state) {
    const output = state.audio?.output;
    if (event.action !== "volume" || event.phase === "momentum" || event.y === 0 || output?.volume == null) return;
    const volume = Math.min(1, Math.max(0, (output.muted ? 0 : output.volume) + event.y * (event.precise ? 0.002 : 0.05)));
    return run(Effect.all([output.muted ? host.audio.setMuted(false) : Effect.void, host.audio.setVolume(volume)]));
  },
} satisfies Gary.BarWidget;
