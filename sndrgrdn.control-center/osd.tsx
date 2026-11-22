import { Effect, Option, Queue, Stream, host, topic } from "gary:effect";
import { read, shown, stepped, symbol, type Level } from "./levels";

const keys: Partial<Record<Gary.MediaKeyName, { level: Level; direction: -1 | 0 | 1 }>> = {
  "volume-up": { level: "volume", direction: 1 },
  "volume-down": { level: "volume", direction: -1 },
  mute: { level: "volume", direction: 0 },
  "brightness-up": { level: "brightness", direction: 1 },
  "brightness-down": { level: "brightness", direction: -1 },
};
const presses = Effect.runSync(Queue.unbounded<Gary.MediaKeyName>());
let level: Level = "volume";

function current(level: Level) {
  const readings = level === "volume"
    ? topic("audio").pipe(Stream.map((audio) => read({ audio }, level)))
    : topic("brightness").pipe(Stream.map((brightness) => read({ brightness }, level)));
  return Stream.runHead(readings).pipe(Effect.map(Option.getOrNull));
}

const apply = Effect.fn("ControlCenter.apply")(function* (key: Gary.MediaKeyName) {
  const step = keys[key];
  if (!step) return;
  const now = yield* current(step.level);
  if (!now) return;
  level = step.level;
  if (level === "brightness") {
    yield* host.brightness.set(stepped(now.value, step.direction), now.display);
  } else if (step.direction === 0) {
    yield* host.audio.setMuted(!now.muted);
  } else {
    if (now.muted) yield* host.audio.setMuted(false);
    yield* host.audio.setVolume(stepped(now.value, step.direction));
  }
  yield* host.show("osd");
}, Effect.catchTag("HostError", (error) => host.log(`media key failed: ${error.message}`)));

export default {
  surfaces: {
    osd: { anchors: { bottom: true }, margins: { bottom: 120 }, clickThrough: true, background: "none" },
  },

  effect: Stream.fromQueue(presses).pipe(
    Stream.tap(apply),
    Stream.debounce("1.5 seconds"),
    Stream.runForEach(() => host.hide("osd")),
  ),

  render(state) {
    const now = read(state, level);
    const value = now ? shown(now) : 0;
    const { spacing } = state.theme;
    return (
      <row
        gap={spacing.section}
        padding={[spacing.item, spacing.section]}
        radius={22}
        material="glass"
        background="alpha(panel, 0.35)"
        border={{ color: "border" }}
        animation="smooth"
      >
        <icon key="icon" symbol={now ? symbol(level, now) : "speaker.slash.fill"} fontSize={16} width={22} color="bright" />
        <progress key="level" value={value} width={180} color="foreground" />
        <text key="value" font="mono" width={28} align="trailing" color="bright">{Math.round(value * 100)}</text>
      </row>
    );
  },

  onMediaKey(event) {
    Queue.offerUnsafe(presses, event.key);
  },
} satisfies Gary.Overlay;
