import { Effect, Stream, host, topic } from "gary:effect";

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const cell = 28;
const cellGap = 4;
const width = 7 * cell + 6 * cellGap;

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

function day(date: Date, month: number, today: Date, radius: number): Gary.Node {
  const current = date.toDateString() === today.toDateString();
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  return (
    <text
      key={`${date.getMonth()}-${date.getDate()}`}
      width={cell}
      height={cell}
      align="center"
      radius={radius}
      color={date.getMonth() !== month ? "alpha(dim, 0.5)" : weekend ? "dim" : "foreground"}
      border={current ? { color: "alpha(foreground, 0.4)" } : undefined}
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
          <text font="mono" color="dim" width={56}>{time(event)}</text>
          <text>{event.title}</text>
        </row>
      ))}
    </column>
  );
}

export default {
  surface: { attach: true, margins: { top: 8, right: 20 }, anchors: { top: true, right: true } },

  effect: Stream.zipLatestAll(
    topic("calendar"),
    topic("clock").pipe(Stream.map(startOfDay), Stream.changesWith((a, b) => a.getTime() === b.getTime())),
  ).pipe(Stream.runForEach(fetchToday)),

  render(state) {
    const today = new Date(state.clock?.epoch ?? Date.now());
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const start = 1 - ((first.getDay() + 6) % 7);
    const dates = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), start + index));
    const { spacing, radius } = state.theme;
    return (
      <column padding={spacing.section} gap={spacing.section}>
        <row key="header" width={width} gap={cellGap}>
          <text key="month" style="title" action="today">{months[first.getMonth()]} {first.getFullYear()}</text>
          <spacer />
          <text key="previous" font="icon" fontSize={21} style="dim" action="previous" width={cell} height={cell} align="center" radius={radius.control} hovered={{ color: "foreground", background: "hover" }}>{"\u{F0141}"}</text>
          <text key="next" font="icon" fontSize={21} style="dim" action="next" width={cell} height={cell} align="center" radius={radius.control} hovered={{ color: "foreground", background: "hover" }}>{"\u{F0142}"}</text>
        </row>
        <grid key="grid" columns={7} gap={cellGap} align="center">
          {weekdays.map((name, index) => <text key={`w${index}`} style="dim" width={cell} height={16} align="center">{name}</text>)}
          {dates.map((date) => day(date, first.getMonth(), today, radius.control))}
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
} satisfies Gary.Menu;
