import { Effect, Option, Queue, Stream, host, topic } from "gary:effect";

type Level = "volume" | "brightness";
type Reading = { value: number; muted: boolean; display: string | null };
type Step = { level: Level; direction: -1 | 0 | 1 };

const steps = 16;
const keys: Partial<Record<Gary.MediaKeyName, Step>> = {
  "volume-up": { level: "volume", direction: 1 },
  "volume-down": { level: "volume", direction: -1 },
  mute: { level: "volume", direction: 0 },
  "brightness-up": { level: "brightness", direction: 1 },
  "brightness-down": { level: "brightness", direction: -1 },
};
const presses = Effect.runSync(Queue.unbounded<void>());
let target: { level: Level; reading: Reading } | null = null;

function read(state: Pick<Gary.State, "audio" | "brightness">, level: Level): Reading | null {
  if (level === "volume") {
    const output = state.audio?.output;
    if (output?.volume == null) return null;
    return { value: output.volume, muted: output.muted === true, display: null };
  }
  const displays = (state.brightness?.displays ?? []).flatMap((display) =>
    display.brightness === null ? [] : [{ ...display, brightness: display.brightness }],
  );
  const display = displays.find((each) => each.builtin) ?? displays[0];
  return display ? { value: display.brightness, muted: false, display: display.id } : null;
}

function current(level: Level) {
  const readings = level === "volume"
    ? topic("audio").pipe(Stream.map((audio) => read({ audio }, level)))
    : topic("brightness").pipe(Stream.map((brightness) => read({ brightness }, level)));
  return Stream.runHead(readings).pipe(Effect.map(Option.getOrNull));
}

function level(reading: Reading) {
  return reading.muted ? 0 : reading.value;
}

function symbol(level: Level, reading: Reading) {
  const value = reading.muted ? 0 : reading.value;
  if (level === "brightness") return value < 0.5 ? "sun.min.fill" : "sun.max.fill";
  if (value === 0) return "speaker.slash.fill";
  return value < 0.34 ? "speaker.wave.1.fill" : value < 0.67 ? "speaker.wave.2.fill" : "speaker.wave.3.fill";
}

function stepped(from: Reading, direction: Step["direction"]): Reading {
  if (direction === 0) return { ...from, muted: !from.muted };
  const value = Math.min(steps, Math.max(0, Math.round(from.value * steps) + direction)) / steps;
  return { ...from, value, muted: false };
}

function press(step: Step, from: Reading) {
  const to = stepped(from, step.direction);
  target = { level: step.level, reading: to };
  Queue.offerUnsafe(presses, undefined);
  const set = step.level === "brightness"
    ? host.brightness.set(to.value, to.display)
    : Effect.all([
      to.muted === from.muted ? Effect.void : host.audio.setMuted(to.muted),
      to.value === from.value ? Effect.void : host.audio.setVolume(to.value),
    ]);
  return Effect.andThen(host.show("osd"), Effect.asVoid(set));
}

export default {
  surfaces: {
    osd: { anchors: { bottom: true }, margins: { bottom: 120 }, clickThrough: true, background: "none" },
  },

  effect: Stream.fromQueue(presses).pipe(
    Stream.debounce("1.5 seconds"),
    Stream.runForEach(() => host.hide("osd").pipe(Effect.andThen(Effect.sync(() => void (target = null))))),
  ),

  render(state) {
    const shown = target ?? { level: "volume" as const, reading: read(state, "volume") };
    const value = shown.reading ? level(shown.reading) : 0;
    const { spacing } = state.theme;
    return (
      <row
        gap={spacing.section}
        padding={[spacing.item, spacing.section]}
        radius={22}
        material="glass"
        background="alpha(panel, 0.35)"
        border={{ color: "border" }}
      >
        <icon key="icon" symbol={shown.reading ? symbol(shown.level, shown.reading) : "speaker.slash.fill"} fontSize={16} width={22} color="bright" />
        <progress key="level" value={value} width={180} color="foreground" animation="smooth" duration={0.12} />
        <text key="value" font="mono" width={28} align="trailing" color="bright">{Math.round(value * 100)}</text>
      </row>
    );
  },

  onMediaKey(event, state) {
    const step = keys[event.key];
    if (!step) return;
    const from = target?.level === step.level ? target.reading : read(state, step.level);
    const run = from ? press(step, from) : current(step.level).pipe(Effect.flatMap((now) => (now ? press(step, now) : Effect.void)));
    return run.pipe(Effect.catchTag("HostError", (error) => host.log(`media key failed: ${error.message}`)));
  },
} satisfies Gary.Overlay;
