import { Effect, Option, Schedule, Schema, fetch, host as lifted, settings } from "gary:effect";
import { calculate, type Answer } from "./calculate";
import { paneTitles, scanPanes } from "./panes";
import * as Calculator from "./oma-cast/Calculator";
import * as Frecency from "./oma-cast/Frecency";
import * as Ranker from "./oma-cast/Ranker";

type Entry = { kind: "app"; id: string; title: string; path: string } | { kind: "pane"; id: string; title: string };
type Row = { kind: "answer"; answer: Answer } | Entry;
type Candidate = Entry & { type: "application" | "preference"; frecency: number; openedAt: number | null; searchTerms: Frecency.SearchTerm[] };
type Theme = Gary.Theme;

const Visits = Schema.Record(
  Schema.String,
  Schema.Struct({
    anchor: Schema.Finite,
    openedAt: Schema.Finite,
    searchTerms: Schema.mutable(Schema.Array(Schema.Struct({ term: Schema.String, at: Schema.Finite }))),
  }),
);
const Rates = Schema.Struct({ base: Schema.String, date: Schema.String, rates: Schema.Record(Schema.String, Schema.Number) });
const StoredRates = Schema.Struct({ ...Rates.fields, fetchedAt: Schema.Finite });
const Panes = Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, title: Schema.NonEmptyString }));

const cardWidth = 600;
const rowHeight = 40;
const iconSize = 24;
const headerHeight = 48;
const layout = {
  rows: typeof settings.rows === "number" && settings.rows >= 1 ? Math.floor(settings.rows) : 9,
  listsEmptyQuery: settings.minimal !== true,
};
const kept = 150;
const ratesUrl = "https://api.frankfurter.dev/v1/latest";
const ratesMaxAge = 12 * 3_600_000;
const zonesMaxAge = 10 * 60_000;
const zoneNames = Calculator.zoneList();
const rankType = { app: "application", pane: "preference" } as const;
const settingsApp = "/System/Applications/System Settings.app";
let hour12 = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;

let apps: readonly Entry[] = [];
let panes: readonly Entry[] = Option.getOrElse(Schema.decodeUnknownOption(Panes)(host.storage.get("panes")), () => []).map((pane) => ({ kind: "pane", ...pane }));
let visits: { [id: string]: Frecency.Visits } = Option.getOrElse(Schema.decodeUnknownOption(Visits)(host.storage.get("visits")), () => ({}));
let rates = Option.getOrNull(Schema.decodeUnknownOption(StoredRates)(host.storage.get("rates")));
let zones: { at: number; offsets: { [zone: string]: number } } = { at: 0, offsets: {} };
let query = "";
let rows: readonly Row[] = [];
let selected = 0;

function candidate(entry: Entry, nowMs: number): Candidate {
  const seen = visits[entry.id];
  return {
    ...entry,
    type: rankType[entry.kind],
    frecency: seen ? Frecency.score(seen.anchor, nowMs / 1000) : 1,
    openedAt: seen?.openedAt ?? null,
    searchTerms: seen?.searchTerms ?? [],
  };
}

function offset(zone: string, at: number) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const [, sign, hours, minutes] = /^GMT(?:([+-])(\d\d):(\d\d))?$/.exec(name) ?? [];
  return sign ? (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) : 0;
}

function answer(nowMs: number) {
  if (nowMs - zones.at > zonesMaxAge) {
    zones = { at: nowMs, offsets: Object.fromEntries(zoneNames.map((zone) => [zone, offset(zone, nowMs)])) };
  }
  try {
    return calculate(query, { nowMs, localOffset: -new Date(nowMs).getTimezoneOffset(), hour12, rates, zones: zones.offsets });
  } catch (error) {
    host.log(`calculating “${query}” failed: ${error}`);
    return null;
  }
}

function listed() {
  return layout.listsEmptyQuery || query.trim() !== "";
}

function search() {
  const nowMs = Date.now();
  const found = answer(nowMs);
  const entries: readonly Entry[] = listed()
    ? Ranker.rank([...apps, ...panes].map((entry) => candidate(entry, nowMs)), query, { nowMs })
        .slice(0, kept)
        .map((ranked) => ranked.candidate)
    : [];
  rows = found ? [{ kind: "answer", answer: found }, ...entries] : entries;
  selected = Math.max(0, Math.min(selected, rows.length - 1));
}

const refresh = Effect.fn("Launcher.refresh")(function* () {
  const installed = yield* lifted.apps.installed();
  apps = installed.map(({ name, path, app }) => ({ kind: "app", id: app ?? path, title: name, path }));
  search();
}, Effect.catchTag("HostError", (error) => lifted.log(`listing apps failed: ${error.message}`)));

const refreshPanes = Effect.fn("Launcher.refreshPanes")(function* () {
  const scan = yield* lifted.exec(scanPanes);
  if (scan.status !== 0) return yield* lifted.log(`listing settings panes failed with status ${scan.status}: ${scan.stderr}`);
  const rows = scan.stdout.split("\n").filter((line) => line).map((line) => {
    const [id, title] = line.split("\t");
    return { id, title };
  });
  const scanned = (yield* Schema.decodeUnknownEffect(Panes)(rows)).map(({ id, title }) => ({ id, title: paneTitles[id] ?? title }));
  panes = scanned.map((pane) => ({ kind: "pane", ...pane }));
  search();
  yield* lifted.storage.set("panes", scanned);
}, Effect.catch((error) => lifted.log(`listing settings panes failed: ${error.message}`)));

const launch = Effect.fn("Launcher.launch")(function* (entry: Entry, term: string) {
  if (entry.kind === "app") {
    yield* lifted.apps.launch(entry.path);
  } else {
    const { status, stderr } = yield* lifted.exec(["/usr/bin/open", `x-apple.systempreferences:${entry.id}`]);
    if (status !== 0) return yield* lifted.log(`open ${entry.title} failed with status ${status}: ${stderr}`);
  }
  visits = { ...visits, [entry.id]: Frecency.recordVisit(visits[entry.id], Date.now(), term) };
  yield* lifted.storage.set("visits", visits);
}, (effect, entry) => Effect.catchTag(effect, "HostError", (error) => lifted.log(`open ${entry.title} failed: ${error.message}`)));

const refreshRates = Effect.fn("Launcher.refreshRates")(function* () {
  if (rates && Date.now() - rates.fetchedAt < ratesMaxAge) return;
  const response = yield* fetch(ratesUrl);
  if (response.status !== 200) return yield* lifted.log(`exchange rates request failed with status ${response.status}`);
  const latest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Rates))(response.text);
  rates = { ...latest, fetchedAt: Date.now() };
  yield* lifted.storage.set("rates", rates);
}, Effect.catch((error) => lifted.log(`exchange rates request failed: ${error.message}`)));

const open = Effect.fn("Launcher.open")(function* () {
  query = "";
  selected = 0;
  search();
  yield* lifted.show();
  yield* refresh();
});

const choose = Effect.fn("Launcher.choose")(function* (row: Row | undefined) {
  if (!row) return;
  yield* lifted.hide();
  if (row.kind === "answer") yield* lifted.clipboard.writeText(row.answer.copy);
  else yield* launch(row, query);
});

function move(step: number) {
  selected = Math.max(0, Math.min(selected + step, rows.length - 1));
}

function rowKey(row: Row) {
  return row.kind === "answer" ? "calculation" : row.kind === "app" ? row.path : row.id;
}

function Row({ row, chosen, theme }: { row: Row; chosen: boolean; theme: Theme }) {
  const { radius, spacing } = theme;
  return (
    <row
      key={rowKey(row)}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={Math.max(0, radius.surface - spacing.item)}
      style={chosen ? "highlight" : undefined}
      action={`open:${rowKey(row)}`}
      hoverAction={`hover:${rowKey(row)}`}
    >
      {row.kind === "answer" ? (
        <>
          <text font="icon" color={chosen ? "accent" : "foreground"} fontSize={18} width={iconSize} align="center">{"\u{F01FC}"}</text>
          <text color={chosen ? "accent" : "foreground"} font="title">{row.answer.result}</text>
          <spacer />
          <text color="dim">{row.answer.input}</text>
        </>
      ) : (
        <>
          <image path={row.kind === "app" ? row.path : settingsApp} width={iconSize} height={iconSize} />
          <text color={chosen ? "accent" : "foreground"}>{row.title}</text>
          <spacer />
          {row.kind === "pane" && <text color="dim">System Settings</text>}
        </>
      )}
      <text key="enter" color="accent" opacity={chosen ? 0.36 : 0}>↵</text>
    </row>
  );
}

function shownRows() {
  return Math.min(Math.max(rows.length, 1), layout.rows);
}

function list(theme: Theme): Gary.Node {
  const { spacing } = theme;
  if (!rows.length) {
    const message = apps.length ? `No apps or settings match “${query.trim()}”` : "Looking for apps…";
    return <text key="empty" color="dim" height={rowHeight} padding={[0, spacing.item]}>{message}</text>;
  }
  return (
    <scroll key="results" height={shownRows() * rowHeight} gap={0} reveal={rows[selected] && rowKey(rows[selected])}>
      {rows.map((row, at) => <Row row={row} chosen={at === selected} theme={theme} />)}
    </scroll>
  );
}

export default {
  surface: { anchors: { top: true, bottom: true, left: true, right: true }, exclusionMode: "ignore", background: "backdrop" },

  effect: Effect.gen(function* () {
    yield* Effect.forkScoped(Effect.repeat(refreshRates(), Schedule.spaced("1 hour")));
    yield* Effect.forkScoped(refreshPanes());
    yield* refresh();
  }),

  onTopic({ topic, value }) {
    if (topic === "clock") hour12 = value.hour12;
  },

  render(state) {
    const width = state.display?.width ?? 1728;
    const height = state.display?.height ?? 1117;
    const { spacing } = state.theme;
    const cardHeight = (rows: number) => 3 * spacing.item + headerHeight + rows * rowHeight;
    return (
      <stack key="backdrop" width={width} height={height}>
        <row key="dim" width={width} height={height} background="scrim" action="close" />
        <column
          key="card"
          x={(width - cardWidth) / 2}
          y={Math.round(height / 4)}
          width={cardWidth}
          height={listed() ? cardHeight(shownRows()) : 2 * spacing.item + headerHeight}
          gap={0}
          padding={spacing.item}
          style="picker"
        >
          <row key="search" height={headerHeight} padding={[0, spacing.item]}>
            <text font="icon" color="dim" fontSize={21} width={iconSize} align="center" y={0.5}>{"\u{F0349}"}</text>
            <input key="query" value={query} placeholder="Search apps and settings" change="filter" submit="submit" fontSize={18} />
          </row>
          {listed() && (
            <>
              <row key="divider" height={0}>
                <row key="line" height={1} width={cardWidth - 2 * spacing.item} background="border" />
              </row>
              <column key="list" height={shownRows() * rowHeight + spacing.item} padding={[spacing.item, 0, 0, 0]}>
                {list(state.theme)}
              </column>
            </>
          )}
        </column>
      </stack>
    );
  },


  onKey(key) {
    if (key === "down" || key === "tab") move(1);
    else if (key === "up" || key === "shift+tab") move(-1);
    else if (key === "enter") return choose(rows[selected]);
    else return false;
    return true;
  },

  onAction(action, payload) {
    if (action === "filter" && typeof payload === "string") {
      query = payload;
      selected = 0;
      search();
    } else if (action === "submit") {
      return choose(rows[selected]);
    } else if (action === "close") {
      return lifted.hide();
    } else if (action.startsWith("hover:") && payload === true) {
      selected = Math.max(0, rows.findIndex((row) => rowKey(row) === action.slice(6)));
    } else if (action.startsWith("open:")) {
      return choose(rows.find((row) => rowKey(row) === action.slice(5)));
    }
  },

  methods: {
    open,
    state: () => {
      const label = (row: Row) => (row.kind === "answer" ? row.answer.result : row.title);
      const answered = rows[0]?.kind === "answer" ? rows[0].answer : null;
      return {
        apps: apps.length,
        panes: panes.length,
        query,
        calculation: answered?.result ?? null,
        rules: answered?.rules ?? [],
        selected: rows[selected] ? label(rows[selected]) : null,
        results: rows.filter((row) => row.kind !== "answer").slice(0, 10).map(label),
      };
    },
  },
} satisfies Gary.Menu;
