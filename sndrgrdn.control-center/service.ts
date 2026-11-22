import { Effect, Queue, Stream, host } from "gary:effect";
import { read, stepped, type Level } from "./levels";

type Press = { key: Gary.MediaKeyName; state: Gary.State };

const keys: Record<Gary.MediaKeyName, { level: Level; direction: -1 | 0 | 1 }> = {
  "volume-up": { level: "volume", direction: 1 },
  "volume-down": { level: "volume", direction: -1 },
  mute: { level: "volume", direction: 0 },
  "brightness-up": { level: "brightness", direction: 1 },
  "brightness-down": { level: "brightness", direction: -1 },
};
const presses = Effect.runSync(Queue.unbounded<Press>());

const apply = Effect.fn("ControlCenter.apply")(function* ({ key, state }: Press) {
  const { level, direction } = keys[key];
  const now = read(state, level);
  if (!now) return;
  if (level === "brightness") {
    yield* host.brightness.set(stepped(now.value, direction), now.display);
  } else if (direction === 0) {
    yield* host.audio.setMuted(!now.muted);
  } else {
    if (now.muted) yield* host.audio.setMuted(false);
    yield* host.audio.setVolume(stepped(now.value, direction));
  }
  yield* host.publish({ level });
  yield* host.show("osd");
}, Effect.catchTag("HostError", (error) => host.log(`media key failed: ${error.message}`)));

export default {
  effect: Effect.gen(function* () {
    yield* host.mediakeys.intercept(Object.keys(keys) as Gary.MediaKeyName[]).pipe(
      Effect.catchTag("HostError", (error) => host.log(`cannot take over the media keys: ${error.message}`)),
    );
    yield* Stream.fromQueue(presses).pipe(
      Stream.tap(apply),
      Stream.debounce("1.5 seconds"),
      Stream.runForEach(() => host.hide("osd")),
    );
  }),

  onMediaKey(event, state) {
    Queue.offerUnsafe(presses, { key: event.key, state });
  },
} satisfies Gary.Service;
