import { Effect, Fiber, host, type HostError } from "gary:effect";

let volume: number | null = null;
let hideVolume: Fiber.Fiber<void> | null = null;

function run(effect: Effect.Effect<unknown, HostError>) {
  Effect.runSync(effect.pipe(Effect.tapError((error) => host.log(error.message)), Effect.ignore));
}

function label(track: Gary.Track) {
  return track.artist ? `${track.artist} · ${track.title}` : track.title;
}

function showVolume(next: number) {
  volume = next;
  if (hideVolume) Effect.runFork(Fiber.interrupt(hideVolume));
  hideVolume = Effect.runFork(
    Effect.delay(
      Effect.sync(() => {
        volume = null;
      }),
      "1500 millis",
    ),
  );
}

export default {
  render(state) {
    const track = state.nowplaying?.track;
    if (volume !== null) {
      return (
        <row gap={4} padding={[0, state.theme.spacing.item]} action="open" scrollAction="volume">
          <text key="glyph" fontSize={13} width={20} align="center" color="foreground">{volume === 0 ? "\u{EEE8}" : "\u{F028}"}</text>
          <text key="text" color="foreground">{`${Math.round(volume * 100)}%`}</text>
        </row>
      );
    }
    if (!track) return null;
    return (
      <row gap={4} padding={[0, state.theme.spacing.item]} action="open" scrollAction="volume">
        <text key="glyph" fontSize={13} width={20} align="center" color={track.playing ? "foreground" : "dim"}>{"\u{F075A}"}</text>
        <text key="text" color={track.playing ? "foreground" : "dim"}>{label(track)}</text>
      </row>
    );
  },

  onAction(action) {
    if (action === "open") return host.toggle();
  },

  onScroll(event, state) {
    if (event.action !== "volume" || event.phase === "momentum" || event.y === 0) return;
    const current = volume ?? state.audio?.output?.volume;
    if (current == null) return;
    const next = Math.min(1, Math.max(0, current + event.y * (event.precise ? 0.002 : 0.05)));
    run(host.audio.setVolume(next));
    showVolume(next);
  },
} satisfies Gary.BarWidget;
