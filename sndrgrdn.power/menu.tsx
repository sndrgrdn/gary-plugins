import { Effect, host as lifted } from "gary:effect";
import type { HostError } from "gary:effect";

type Entry = { id: string; title: string; symbol: string; ask: string | null; run: () => Effect.Effect<null, HostError> };
type Choice = "cancel" | "confirm";
type Spacing = Gary.Theme["spacing"];
type View = { page: "list"; index: number | null } | { page: "confirm"; entry: Entry; choice: Choice };

const width = 208;
const rowHeight = 32;
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

function Item({ entry, selected, spacing }: { entry: Entry; selected: boolean; spacing: Spacing }) {
  const color = selected ? "bright" : "foreground";
  return (
    <row
      key={entry.id}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={6}
      width={width - 2 * spacing.item}
      action={`pick:${entry.id}`}
      background={selected ? "hover" : undefined}
      hovered={{ background: "hover" }}
    >
      <icon symbol={entry.symbol} width={18} color={color} />
      <text color={color}>{entry.ask ? `${entry.title}…` : entry.title}</text>
    </row>
  );
}

function Button({ choice, title, selected, destructive, width }: { choice: Choice; title: string; selected: boolean; destructive: boolean; width: number }) {
  return (
    <row
      key={choice}
      width={width}
      height={rowHeight}
      radius={6}
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

function confirm(entry: Entry, choice: Choice, spacing: Spacing) {
  const button = (width - 5 * spacing.item) / 2;
  return (
    <column key="confirm" gap={spacing.section} padding={spacing.item}>
      <column key="question" gap={0}>
        <text key="ask" style="title">{entry.ask}</text>
        <text key="detail" color="dim" fontSize={11}>Open apps can save their work or cancel.</text>
      </column>
      <row key="buttons">
        <Button choice="cancel" title="Cancel" selected={choice === "cancel"} destructive={false} width={button} />
        <Button choice="confirm" title={entry.title} selected={choice === "confirm"} destructive width={button} />
      </row>
    </column>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 6, right: 8 } },

  render(state) {
    const { spacing } = state.theme;
    const body = view.page === "confirm"
      ? confirm(view.entry, view.choice, spacing)
      : (
        <column key="list" gap={0}>
          {entries.map((entry, index) => <Item entry={entry} selected={view.page === "list" && view.index === index} spacing={spacing} />)}
        </column>
      );
    return (
      <column width={width} padding={spacing.item}>
        {body}
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{problem}</text> : null}
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
