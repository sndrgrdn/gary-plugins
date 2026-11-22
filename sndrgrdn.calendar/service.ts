import { Effect, Schema, Stream, host, topic } from "gary:effect";
import type { Event, Topic } from "./topic";

class NotInstalled extends Schema.TaggedError<NotInstalled>()("NotInstalled", {}) {}
class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", { message: Schema.String }) {}

const argv = [
  "icalBuddy", "-cf", "", "-nc", "-nrd", "-npn", "-eed", "-b", "", "-ps", "|\t|",
  "-iep", "title,datetime", "-po", "title,datetime", "-df", "", "-tf", "%H:%M", "eventsToday",
];

function parse(line: string): Event {
  const [title, datetime = ""] = line.split("\t");
  return { title: title.trim(), time: datetime.match(/\d{1,2}:\d{2}/)?.[0] ?? null };
}

const events = Effect.fn("Calendar.events")(function* () {
  const result = yield* host.exec(argv);
  if (result.status === 127) return yield* new NotInstalled();
  if (result.status !== 0) return yield* new CommandFailed({ message: result.stderr.trim() });
  return result.stdout.split("\n").filter((line) => line.trim()).map(parse);
});

const refresh = events().pipe(
  Effect.map((events): Topic => ({ available: true, events })),
  Effect.catchTag("NotInstalled", () => Effect.succeed<Topic>({ available: false, reason: "icalBuddy is not installed" })),
  Effect.catch((error) =>
    Effect.as(host.log("icalBuddy failed: " + error.message), { available: false, reason: error.message } satisfies Topic),
  ),
  Effect.tap((value) => host.publish(value).pipe(Effect.ignore)),
);

function period(clock: Gary.Clock) {
  const now = new Date(clock.epoch);
  return `${now.toDateString()} ${Math.floor(now.getMinutes() / 5)}`;
}

export default {
  effect: topic("clock").pipe(Stream.map(period), Stream.changes, Stream.runForEach(() => refresh)),

  methods: {
    refresh: () => Effect.runPromise(refresh),
  },
} satisfies Gary.Service;
