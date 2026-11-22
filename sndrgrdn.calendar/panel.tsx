import type { Topic } from "./topic";

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const width = 7 * 28 + 6 * 2;

let offset = 0;
let travel = 0;

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

function events(calendar: Topic | undefined): Gary.Node | null {
  if (!calendar) return null;
  if (!calendar.available) return <text key="reason" style="dim">{calendar.reason}</text>;
  if (calendar.events.length === 0) return <text key="none" style="dim">No events today</text>;
  return (
    <column key="events" gap={4} width={width}>
      {calendar.events.map((event, index) => (
        <row key={String(index)} gap={10}>
          <text font="mono" color="dim" width={52}>{event.time ?? "all day"}</text>
          <text>{event.title}</text>
        </row>
      ))}
    </column>
  );
}

export default {
  surface: { attach: true, margins: { top: 6, right: 8 }, anchors: { top: true, right: true } },

  render(state) {
    const today = new Date(state.clock?.epoch ?? Date.now());
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const start = 1 - ((first.getDay() + 6) % 7);
    const dates = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), start + index));
    return (
      <column style="panel" gap={10}>
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
        {events(state["sndrgrdn.calendar"])}
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
