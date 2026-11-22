import { Effect, Option, Queue, Stream, host, topic } from "gary:effect";

type Level = "volume" | "brightness";
type Reading = { value: number; muted: boolean; display: string | null };
type Step = { level: Level; direction: -1 | 0 | 1 };

const steps = 16;
const iconSize = 28;
const iconWidth = 36;
const valueWidth = 40;
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

function glyph(level: Level, reading: Reading) {
  const percent = Math.round(reading.value * 100);
  if (level === "brightness") return "\u{F0379}";
  if (reading.muted || percent <= 0) return "\u{EEE8}";
  return percent <= 33 ? "\u{F026}" : percent <= 66 ? "\u{F027}" : "\u{F028}";
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
    osd: { anchors: { bottom: true }, margins: { bottom: 68 }, clickThrough: true },
  },

  effect: Stream.fromQueue(presses).pipe(
    Stream.debounce("1.2 seconds"),
    Stream.runForEach(() => host.hide("osd").pipe(Effect.andThen(Effect.sync(() => void (target = null))))),
  ),

  render(state) {
    const shown = target ?? { level: "volume" as const, reading: read(state, "volume") };
    const value = shown.reading?.value ?? 0;
    const { spacing } = state.theme;
    return (
      <row gap={spacing.section} padding={spacing.section}>
        <text key="icon" font="osd" fontSize={iconSize} width={iconWidth} height={iconSize} align="center" color="foreground">
          {shown.reading ? glyph(shown.level, shown.reading) : "\u{EEE8}"}
        </text>
        <progress key="level" value={value} width={144} height={spacing.item} radius={0} color="accent" background="alpha(foreground, 0.45)" animation="smooth" duration={0.14} />
        <text key="value" font="osd" width={valueWidth} align="trailing" color="foreground">{`${Math.round(value * 100)}%`}</text>
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
