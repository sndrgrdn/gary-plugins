import { Effect, Option, Schema, Stream, SubscriptionRef, host, settings } from "gary:effect";
import type { Mode, Session } from "./topic";

const ModeArgument = Schema.Literals(["focus", "break"]);
const Seconds = Schema.FiniteFromString.pipe(Schema.check(Schema.isGreaterThan(0)));
const Minutes = Schema.FiniteFromString;
const StoredSession = Schema.Struct({ mode: ModeArgument, endsAt: Schema.Finite, length: Schema.Finite });

class SoundFailed extends Schema.TaggedError<SoundFailed>()("SoundFailed", { message: Schema.String }) {}

const lengths: Record<Mode, number> = { focus: 25 * 60_000, break: 5 * 60_000 };
const sound = String(settings.sound ?? "/System/Library/Sounds/Glass.aiff");
const volume = String(settings.volume ?? 1);

const stored = Option.getOrNull(Schema.decodeUnknownOption(StoredSession)(Effect.runSync(host.storage.get("session"))));
const session = Effect.runSync(SubscriptionRef.make<Session | null>(stored && stored.endsAt > Date.now() ? stored : null));

function begin(mode: Mode, length: number, now: number): Session {
  return { mode, endsAt: now + length, length };
}

function extend(current: Session | null, change: number, now: number): Session | null {
  if (!current) return change > 0 ? begin("focus", change, now) : null;
  if (current.endsAt + change <= now) return null;
  return { ...current, endsAt: current.endsAt + change, length: current.length + change };
}

function update(next: (current: Session | null, now: number) => Session | null) {
  return Effect.runSync(SubscriptionRef.updateAndGet(session, (current) => next(current, Date.now())));
}

const chime = Effect.fn("FocusTimer.chime")(function* (ended: Session) {
  const result = yield* host.exec(["afplay", "-v", volume, sound]);
  if (result.status !== 0) return yield* new SoundFailed({ message: result.stderr.trim() });
  yield* host.log(`${ended.mode} ended, played ${sound} at volume ${volume}`);
}, Effect.catch((error) => host.log(`end sound failed: ${error.message}`)));

const persist = SubscriptionRef.changes(session).pipe(
  Stream.runForEach((current) =>
    Effect.andThen(host.storage.set("session", current ?? undefined), host.publish({ session: current })),
  ),
  Effect.catch((error) => host.log(`saving the session failed: ${error.message}`)),
);

const alarm = SubscriptionRef.changes(session).pipe(
  Stream.switchMap((current) =>
    current ? Stream.fromEffect(Effect.as(Effect.sleep(Math.max(0, current.endsAt - Date.now())), current)) : Stream.empty,
  ),
  Stream.runForEach((ended) => Effect.andThen(SubscriptionRef.set(session, null), chime(ended))),
);

export default {
  effect: Effect.all([persist, alarm], { concurrency: "unbounded", discard: true }),

  methods: {
    start: (mode, seconds) => {
      const length = seconds === undefined ? null : Schema.decodeUnknownSync(Seconds)(seconds) * 1000;
      const decoded = Schema.decodeUnknownSync(ModeArgument)(mode);
      return update((_, now) => begin(decoded, length ?? lengths[decoded], now));
    },
    stop: () => update(() => null),
    add: (minutes) => {
      const change = Schema.decodeUnknownSync(Minutes)(minutes) * 60_000;
      return update((current, now) => extend(current, change, now));
    },
  },
} satisfies Gary.Service;
