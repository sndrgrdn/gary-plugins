import { Effect, host as lifted } from "gary:effect";
import type { HostError } from "gary:effect";

type Entry = { id: string; title: string; symbol: string; ask: string | null; run: () => Effect.Effect<null, HostError> };
type Choice = "cancel" | "confirm";
type View = { page: "list"; index: number | null } | { page: "confirm"; entry: Entry; choice: Choice };

const width = 208;
const entries: readonly Entry[] = [
  { id: "lock", title: "Lock", symbol: "lock", ask: null, run: () => lifted.power.lock() },
  { id: "sleep", title: "Sleep", symbol: "moon", ask: null, run: () => lifted.power.sleep() },
  { id: "restart", title: "Restart", symbol: "arrow.clockwise", ask: "Restart this Mac?", run: () => lifted.power.restart() },
  { id: "shut-down", title: "Shut down", symbol: "power", ask: "Shut down this Mac?", run: () => lifted.power.shutDown() },
  { id: "log-out", title: "Log out", symbol: "rectangle.portrait.and.arrow.right", ask: "Log out of this Mac?", run: () => lifted.power.logOut() },
];
const moves: { [key: string]: 1 | -1 } = { down: 1, tab: 1, up: -1, "shift+tab": -1 };
const swaps = new Set(["left", "right", "up", "down", "tab", "shift+tab"]);

let view: View = { page: "list", index: null };
let problem: string | null = null;

function list(entry: Entry): View {
  return { page: "list", index: entries.indexOf(entry) };
}

function step(index: number | null, delta: 1 | -1) {
  if (index === null) return delta === 1 ? 0 : entries.length - 1;
  return (index + delta + entries.length) % entries.length;
}

const run = Effect.fn("Power.run")(function* (entry: Entry) {
  problem = null;
  yield* entry.run().pipe(
    Effect.andThen(lifted.hide()),
    Effect.catchTag("HostError", (error) => Effect.sync(() => {
      problem = error.message;
      view = list(entry);
    })),
  );
});

function pick(entry: Entry) {
  if (!entry.ask) return run(entry);
  problem = null;
  view = { page: "confirm", entry, choice: "confirm" };
  return Effect.void;
}

function Item({ entry, selected }: { entry: Entry; selected: boolean }) {
  const color = selected ? "bright" : "foreground";
  return (
    <row
      key={entry.id}
      gap={10}
      padding={[6, 8]}
      radius={8}
      width={width - 16}
      action={`pick:${entry.id}`}
      background={selected ? "hover" : undefined}
      hovered={{ background: "hover" }}
    >
      <icon symbol={entry.symbol} width={16} color={color} />
      <text color={color}>{entry.ask ? `${entry.title}…` : entry.title}</text>
    </row>
  );
}

function Button({ choice, title, selected, destructive }: { choice: Choice; title: string; selected: boolean; destructive: boolean }) {
  return (
    <row
      key={choice}
      width={(width - 24) / 2}
      padding={[6, 0]}
      radius={8}
      align="center"
      action={choice}
      background={selected ? "control" : undefined}
      border={{ color: selected ? "alpha(foreground, 0.4)" : "border" }}
      hovered={{ background: "hover" }}
      pressed={{ scale: 0.97 }}
    >
      <text color={destructive && selected ? "bad" : selected ? "bright" : "foreground"}>{title}</text>
    </row>
  );
}

function confirm(entry: Entry, choice: Choice) {
  return (
    <column gap={12} padding={[4, 4]}>
      <column key="question" gap={4}>
        <text key="ask" style="title">{entry.ask}</text>
        <text key="detail" color="dim" fontSize={11}>Open apps can save their work or cancel.</text>
      </column>
      <row key="buttons" gap={8}>
        <Button choice="cancel" title="Cancel" selected={choice === "cancel"} destructive={false} />
        <Button choice="confirm" title={entry.title} selected={choice === "confirm"} destructive />
      </row>
    </column>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 6, right: 8 } },

  render() {
    const body = view.page === "confirm"
      ? confirm(view.entry, view.choice)
      : entries.map((entry, index) => <Item entry={entry} selected={view.page === "list" && view.index === index} />);
    return (
      <column width={width} padding={8} gap={2}>
        {body}
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[4, 8]}>{problem}</text> : null}
      </column>
    );
  },

  onKey(key) {
    if (view.page === "list") {
      const delta = moves[key];
      if (delta) {
        view = { page: "list", index: step(view.index, delta) };
        return true;
      }
      return key === "enter" && view.index !== null ? pick(entries[view.index]) : false;
    }
    if (key === "enter" && view.choice === "confirm") return run(view.entry);
    if (key === "escape" || key === "enter") view = list(view.entry);
    else if (swaps.has(key)) view = { ...view, choice: view.choice === "confirm" ? "cancel" : "confirm" };
    else return false;
    return true;
  },

  onAction(action) {
    if (action.startsWith("pick:")) {
      const entry = entries.find((each) => each.id === action.slice(5));
      return entry ? pick(entry) : undefined;
    }
    if (view.page !== "confirm") return;
    if (action === "confirm") return run(view.entry);
    view = list(view.entry);
  },
} satisfies Gary.Menu;
