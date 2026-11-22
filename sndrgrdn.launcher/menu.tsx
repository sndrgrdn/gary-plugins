import { Effect, Option, Schema, host as lifted } from "gary:effect";
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

const cardWidth = 600;
const rowHeight = 40;
const iconSize = 24;
const visibleRows = 9;
const headerHeight = 48;
const maxRows = 150;

let apps: readonly App[] = [];
let visits: { [id: string]: Frecency.Visits } = Option.getOrElse(Schema.decodeUnknownOption(Visits)(host.storage.get("visits")), () => ({}));
let query = "";
let results: readonly Candidate[] = [];
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

function rank() {
  const nowMs = Date.now();
  results = Ranker.rank(apps.map((app) => candidate(app, nowMs)), query, { nowMs })
    .slice(0, maxRows)
    .map((ranked) => ranked.candidate);
  selected = Math.max(0, Math.min(selected, results.length - 1));
}

const refresh = Effect.fn("Launcher.refresh")(function* () {
  const installed = yield* lifted.apps.installed();
  apps = installed.map(({ name, path, app }) => ({ id: app ?? path, title: name, path }));
  rank();
}, Effect.catchTag("HostError", (error) => lifted.log(`listing apps failed: ${error.message}`)));

const launch = Effect.fn("Launcher.launch")(function* (app: App, term: string) {
  yield* lifted.apps.launch(app.path);
  visits = { ...visits, [app.id]: Frecency.recordVisit(visits[app.id], Date.now(), term) };
  yield* lifted.storage.set("visits", visits);
}, (effect, app) => Effect.catchTag(effect, "HostError", (error) => lifted.log(`launch ${app.path} failed: ${error.message}`)));

function open() {
  query = "";
  selected = 0;
  rank();
  host.show();
  Effect.runFork(refresh());
}

function pick(app: App | undefined) {
  if (!app) return;
  host.hide();
  Effect.runFork(launch(app, query));
}

function move(step: number) {
  selected = Math.max(0, Math.min(selected + step, results.length - 1));
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
  return Math.min(Math.max(results.length, 1), visibleRows);
}

function list(theme: Theme): Gary.Node {
  const { spacing } = theme;
  if (!results.length) {
    const message = apps.length ? `No apps match “${query.trim()}”` : "Looking for apps…";
    return <text key="empty" style="dim" height={rowHeight} padding={[0, spacing.item]}>{message}</text>;
  }
  return (
    <scroll key="results" height={shownRows() * rowHeight} gap={0} reveal={results[selected]?.path}>
      {results.map((app, at) => <Row app={app} chosen={at === selected} theme={theme} />)}
    </scroll>
  );
}

export default {
  surface: { anchors: { top: true, bottom: true, left: true, right: true }, exclusionMode: "ignore", background: "backdrop" },

  effect: refresh(),

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
            <input key="query" value={query} placeholder="Search apps" change="filter" submit="launch" fontSize={18} />
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
    else if (key === "enter") pick(results[selected]);
    else return false;
    return true;
  },

  onAction(action, payload) {
    if (action === "filter" && typeof payload === "string") {
      query = payload;
      selected = 0;
      rank();
    } else if (action === "launch") {
      pick(results[selected]);
    } else if (action === "close") {
      host.hide();
    } else if (action.startsWith("open:")) {
      pick(results.find((app) => app.path === action.slice(5)));
    }
  },

  methods: {
    open,
    state: () => ({ apps: apps.length, query, selected: results[selected]?.title ?? null, results: results.slice(0, 10).map((app) => app.title) }),
  },
} satisfies Gary.Menu;
