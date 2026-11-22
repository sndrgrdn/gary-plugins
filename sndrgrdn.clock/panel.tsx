import { Effect, Stream, host, topic } from "gary:effect";

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const width = 7 * 28 + 6 * 2;

let offset = 0;
let travel = 0;
let events: readonly Gary.CalendarEvent[] | null = null;
let reason: string | null = null;

const fetchToday = Effect.fn("Clock.fetchToday")(
  function* ([calendar, day]: [Gary.CalendarChange, Date]) {
    if (!calendar.available) {
      reason = calendar.reason ?? "Calendar is unavailable";
      return;
    }
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    events = yield* host.calendar.events(day.getTime(), end.getTime());
    reason = null;
  },
  Effect.catchTag("HostError", (error) => Effect.sync(() => void (reason = error.message))),
);

function startOfDay(clock: Gary.Clock) {
  const now = new Date(clock.epoch);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function time(event: Gary.CalendarEvent) {
  return event.allDay ? "all day" : new Date(event.start).toTimeString().slice(0, 5);
}

function day(date: Date, month: number, today: Date): Gary.Node {
  const current = date.toDateString() === today.toDateString();
  return (
    <text
      key={`${date.getMonth()}-${date.getDate()}`}
      width={28}
      height={24}
      align="center"
      radius={6}
      color={current ? "bright" : date.getMonth() === month ? "foreground" : "dim"}
      background={current ? "control" : undefined}
      font={current ? "strong" : undefined}
    >
      {date.getDate()}
    </text>
  );
}

function agenda(): Gary.Node | null {
  if (reason) return <text key="reason" style="dim">{reason}</text>;
  if (!events) return null;
  if (events.length === 0) return <text key="none" style="dim">No events today</text>;
  return (
    <column key="events" width={width}>
      {events.map((event) => (
        <row key={`${event.id}@${event.start}`}>
          <text font="mono" color="dim" width={52}>{time(event)}</text>
          <text>{event.title}</text>
        </row>
      ))}
    </column>
  );
}

export default {
  surface: { attach: true, margins: { top: 6, right: 8 }, anchors: { top: true, right: true } },

  effect: Stream.zipLatestAll(
    topic("calendar"),
    topic("clock").pipe(Stream.map(startOfDay), Stream.changesWith((a, b) => a.getTime() === b.getTime())),
  ).pipe(Stream.runForEach(fetchToday)),

  render(state) {
    const today = new Date(state.clock?.epoch ?? Date.now());
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const start = 1 - ((first.getDay() + 6) % 7);
    const dates = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), start + index));
    const { spacing } = state.theme;
    return (
      <column style="panel" padding={spacing.section} gap={spacing.section}>
        <row key="header" width={width}>
          <text key="month" style="title" action="today">{months[first.getMonth()]} {first.getFullYear()}</text>
          <spacer />
          <icon key="previous" symbol="chevron.left" style="dim" action="previous" width={22} height={22} hovered={{ color: "bright" }} />
          <icon key="next" symbol="chevron.right" style="dim" action="next" width={22} height={22} hovered={{ color: "bright" }} />
        </row>
        <grid key="grid" columns={7} gap={2} align="center">
          {weekdays.map((name, index) => <text key={`w${index}`} style="dim" width={28} align="center">{name}</text>)}
          {dates.map((date) => day(date, first.getMonth(), today))}
        </grid>
        {agenda()}
      </column>
    );
  },

  onAction(action) {
    if (action === "previous") offset -= 1;
    if (action === "next") offset += 1;
    if (action === "today") offset = 0;
  },

  onScroll(event) {
    if (event.phase === "momentum") return;
    if (event.phase === "began") travel = 0;
    travel += event.y;
    if (Math.abs(travel) < (event.precise ? 24 : 1)) return;
    offset -= Math.sign(travel);
    travel = 0;
  },
} satisfies Gary.Panel;
