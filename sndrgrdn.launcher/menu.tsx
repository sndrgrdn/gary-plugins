import { Effect, Option, Schedule, Schema, fetch, host as lifted } from "gary:effect";
import { calculate, type Answer } from "./calculate";
import * as Calculator from "./oma-cast/Calculator";
import * as Frecency from "./oma-cast/Frecency";
import * as Ranker from "./oma-cast/Ranker";

type App = { id: string; title: string; path: string };
type Candidate = App & { type: "application"; frecency: number; openedAt: number | null; searchTerms: Frecency.SearchTerm[] };
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

const cardWidth = 600;
const rowHeight = 40;
const iconSize = 24;
const visibleRows = 9;
const headerHeight = 48;
const maxRows = 150;
const ratesUrl = "https://api.frankfurter.dev/v1/latest";
const ratesMaxAge = 12 * 3_600_000;
const zonesMaxAge = 10 * 60_000;
const zoneNames = Calculator.zoneList();
let hour12 = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;

let apps: readonly App[] = [];
let visits: { [id: string]: Frecency.Visits } = Option.getOrElse(Schema.decodeUnknownOption(Visits)(host.storage.get("visits")), () => ({}));
let rates = Option.getOrNull(Schema.decodeUnknownOption(StoredRates)(host.storage.get("rates")));
let zones: { at: number; offsets: { [zone: string]: number } } = { at: 0, offsets: {} };
let query = "";
let results: readonly Candidate[] = [];
let calculation: Answer | null = null;
let selected = 0;

function candidate(app: App, nowMs: number): Candidate {
  const seen = visits[app.id];
  return {
    ...app,
    type: "application",
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

function search() {
  const nowMs = Date.now();
  results = Ranker.rank(apps.map((app) => candidate(app, nowMs)), query, { nowMs })
    .slice(0, maxRows)
    .map((ranked) => ranked.candidate);
  calculation = answer(nowMs);
  selected = Math.max(0, Math.min(selected, rowCount() - 1));
}

function shift() {
  return calculation ? 1 : 0;
}

function rowCount() {
  return shift() + results.length;
}

const refresh = Effect.fn("Launcher.refresh")(function* () {
  const installed = yield* lifted.apps.installed();
  apps = installed.map(({ name, path, app }) => ({ id: app ?? path, title: name, path }));
  search();
}, Effect.catchTag("HostError", (error) => lifted.log(`listing apps failed: ${error.message}`)));

const launch = Effect.fn("Launcher.launch")(function* (app: App, term: string) {
  yield* lifted.apps.launch(app.path);
  visits = { ...visits, [app.id]: Frecency.recordVisit(visits[app.id], Date.now(), term) };
  yield* lifted.storage.set("visits", visits);
}, (effect, app) => Effect.catchTag(effect, "HostError", (error) => lifted.log(`launch ${app.path} failed: ${error.message}`)));

const refreshRates = Effect.gen(function* () {
  if (rates && Date.now() - rates.fetchedAt < ratesMaxAge) return;
  const response = yield* fetch(ratesUrl);
  if (response.status !== 200) return yield* lifted.log(`exchange rates request failed with status ${response.status}`);
  const latest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Rates))(response.text);
  rates = { ...latest, fetchedAt: Date.now() };
  yield* lifted.storage.set("rates", rates);
}).pipe(Effect.catch((error) => lifted.log(`exchange rates request failed: ${error.message}`)));

function open() {
  query = "";
  selected = 0;
  search();
  host.show();
  Effect.runFork(refresh());
}

function pick(app: App | undefined) {
  if (!app) return;
  host.hide();
  Effect.runFork(launch(app, query));
}

function copy(answer: Calculator.Calculation) {
  host.clipboard.writeText(answer.copy);
  host.hide();
}

function submit() {
  if (calculation && selected === 0) copy(calculation);
  else pick(results[selected - shift()]);
}

function move(step: number) {
  selected = Math.max(0, Math.min(selected + step, rowCount() - 1));
}

function CalculationRow({ answer, chosen, theme }: { answer: Calculator.Calculation; chosen: boolean; theme: Theme }) {
  const { radius, spacing } = theme;
  return (
    <row
      key="calculation"
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={Math.max(0, radius.surface - spacing.item)}
      style={chosen ? "selected" : undefined}
      hovered={chosen ? undefined : { background: "hover" }}
      action="copy"
    >
      <icon symbol="equal" style="dim" fontSize={16} width={iconSize} />
      <text style={chosen ? "active" : "title"} font="title">{answer.result}</text>
      <spacer />
      <text style="dim">{answer.input}</text>
      {chosen && <text style="dim">↵</text>}
    </row>
  );
}

function Row({ app, chosen, theme }: { app: App; chosen: boolean; theme: Theme }) {
  const { radius, spacing } = theme;
  return (
    <row
      key={app.path}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={Math.max(0, radius.surface - spacing.item)}
      style={chosen ? "selected" : undefined}
      hovered={chosen ? undefined : { background: "hover" }}
      action={`open:${app.path}`}
    >
      <image path={app.path} width={iconSize} height={iconSize} />
      <text style={chosen ? "active" : undefined}>{app.title}</text>
      <spacer />
      {chosen && <text style="dim">↵</text>}
    </row>
  );
}

function shownRows() {
  return Math.min(Math.max(rowCount(), 1), visibleRows);
}

function list(theme: Theme): Gary.Node {
  const { spacing } = theme;
  if (!rowCount()) {
    const message = apps.length ? `No apps match “${query.trim()}”` : "Looking for apps…";
    return <text key="empty" style="dim" height={rowHeight} padding={[0, spacing.item]}>{message}</text>;
  }
  return (
    <scroll key="results" height={shownRows() * rowHeight} gap={0} reveal={calculation && selected === 0 ? "calculation" : results[selected - shift()]?.path}>
      {calculation && <CalculationRow answer={calculation} chosen={selected === 0} theme={theme} />}
      {results.map((app, at) => <Row app={app} chosen={at + shift() === selected} theme={theme} />)}
    </scroll>
  );
}

export default {
  surface: { anchors: { top: true, bottom: true, left: true, right: true }, exclusionMode: "ignore", background: "backdrop" },

  effect: Effect.gen(function* () {
    yield* Effect.forkScoped(Effect.repeat(refreshRates, Schedule.spaced("1 hour")));
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
        <row key="dim" width={width} height={height} background="alpha(background, 0.55)" action="close" />
        <column
          key="card"
          x={(width - cardWidth) / 2}
          y={(height - cardHeight(visibleRows)) / 2}
          width={cardWidth}
          height={cardHeight(shownRows())}
          gap={0}
          padding={spacing.item}
          style="surface"
          border={{ color: "border" }}
        >
          <row key="search" height={headerHeight} padding={[0, spacing.item]}>
            <icon symbol="magnifyingglass" style="dim" fontSize={16} width={iconSize} />
            <input key="query" value={query} placeholder="Search apps" change="filter" submit="submit" fontSize={18} />
          </row>
          <row key="divider" height={0}>
            <row key="line" height={1} width={cardWidth - 2 * spacing.item} background="border" />
          </row>
          <column key="list" height={shownRows() * rowHeight + spacing.item} padding={[spacing.item, 0, 0, 0]}>
            {list(state.theme)}
          </column>
        </column>
      </stack>
    );
  },

  onHotkey(id) {
    if (id === "open") open();
  },

  onKey(key) {
    if (key === "down" || key === "tab") move(1);
    else if (key === "up" || key === "shift+tab") move(-1);
    else if (key === "enter") submit();
    else return false;
    return true;
  },

  onAction(action, payload) {
    if (action === "filter" && typeof payload === "string") {
      query = payload;
      selected = 0;
      search();
    } else if (action === "submit") {
      submit();
    } else if (action === "copy" && calculation) {
      copy(calculation);
    } else if (action === "close") {
      host.hide();
    } else if (action.startsWith("open:")) {
      pick(results.find((app) => app.path === action.slice(5)));
    }
  },

  methods: {
    open,
    state: () => ({
      apps: apps.length,
      query,
      calculation: calculation?.result ?? null,
      rules: calculation?.rules ?? [],
      selected: calculation && selected === 0 ? calculation.result : results[selected - shift()]?.title ?? null,
      results: results.slice(0, 10).map((app) => app.title),
    }),
  },
} satisfies Gary.Menu;
