import { Effect, host as lifted } from "gary:effect";
import { type App, index } from "./apps";

const cardWidth = 600;
const rowHeight = 40;
const visibleRows = 9;
const headerHeight = 44;
const padding = 8;
const cardHeight = 2 * padding + headerHeight + 1 + visibleRows * rowHeight + 2 * padding;
const maxRows = 150;

let apps: readonly App[] = [];
let skipped = "";
let query = "";
let results: readonly App[] = [];
let selected = 0;

function startsWord(name: string, at: number) {
  if (at === 0) return true;
  const before = name[at - 1];
  return /[\s\-_.]/.test(before) || (before === before.toLowerCase() && name[at] !== name[at].toLowerCase());
}

function score(needle: string, app: App): number | null {
  const at = app.key.indexOf(needle);
  if (at === 0) return 3000 - app.key.length;
  if (at > 0) return (startsWord(app.name, at) ? 2500 : 2000) - at;
  let total = 1000;
  let last = -1;
  for (const char of needle) {
    const next = app.key.indexOf(char, last + 1);
    if (next < 0) return null;
    total += (startsWord(app.name, next) ? 15 : 0) - (next - last - 1);
    last = next;
  }
  return total;
}

function rank() {
  const needle = query.trim().toLowerCase();
  const ranked = needle
    ? apps
      .map((app) => ({ app, score: score(needle, app) }))
      .filter((each): each is { app: App; score: number } => each.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((each) => each.app)
    : apps;
  results = ranked.slice(0, maxRows);
  selected = Math.max(0, Math.min(selected, results.length - 1));
}

const refresh = Effect.fn("Launcher.refresh")(function* () {
  const found = yield* index();
  apps = found.apps;
  rank();
  const names = found.skipped.join(", ");
  if (names && names !== skipped) yield* lifted.log(`no readable bundle id, so not listed: ${names}`);
  skipped = names;
});

const launch = Effect.fn("Launcher.launch")(function* (app: App) {
  yield* lifted.apps.launch(app.bundle);
}, (effect, app) => Effect.catchTag(effect, "HostError", (error) => lifted.log(`launch ${app.bundle} failed: ${error.message}`)));

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
  Effect.runFork(launch(app));
}

function move(step: number) {
  selected = Math.max(0, Math.min(selected + step, results.length - 1));
}

function Row({ app, chosen }: { app: App; chosen: boolean }) {
  return (
    <row
      key={app.bundle}
      gap={12}
      height={rowHeight}
      padding={[0, 10]}
      radius={8}
      style={chosen ? "selected" : undefined}
      hovered={chosen ? undefined : { background: "hover" }}
      action={`open:${app.bundle}`}
    >
      <image path={app.path} width={26} height={26} />
      <text style={chosen ? "active" : undefined}>{app.name}</text>
      <spacer />
      {chosen && <text style="dim">↵</text>}
    </row>
  );
}

function list(): Gary.Node {
  if (!results.length) {
    const message = apps.length ? `No apps match “${query.trim()}”` : "Looking for apps…";
    return <text key="empty" style="dim" padding={[12, 10]}>{message}</text>;
  }
  return (
    <scroll key="results" height={visibleRows * rowHeight} reveal={results[selected]?.bundle}>
      {results.map((app, at) => <Row app={app} chosen={at === selected} />)}
    </scroll>
  );
}

export default {
  surface: { anchors: { top: true, bottom: true, left: true, right: true }, exclusionMode: "ignore", background: "backdrop" },

  effect: refresh(),

  render(state) {
    const width = state.display?.width ?? 1728;
    const height = state.display?.height ?? 1117;
    return (
      <stack key="backdrop" width={width} height={height}>
        <row key="dim" width={width} height={height} background="alpha(background, 0.55)" action="close" />
        <column
          key="card"
          x={(width - cardWidth) / 2}
          y={(height - cardHeight) / 2}
          width={cardWidth}
          height={cardHeight}
          gap={0}
          padding={padding}
          radius={14}
          background="panel"
          border={{ color: "border" }}
        >
          <row key="search" gap={10} height={headerHeight} padding={[0, 10]}>
            <icon symbol="magnifyingglass" style="dim" fontSize={16} />
            <input key="query" value={query} placeholder="Search apps" change="filter" submit="launch" fontSize={18} />
          </row>
          <row key="divider" height={1} background="border" />
          <column key="list" height={visibleRows * rowHeight + 2 * padding} padding={[padding, 0, 0, 0]}>
            {list()}
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
      pick(results.find((app) => app.bundle === action.slice(5)));
    }
  },

  methods: {
    open,
    state: () => ({ apps: apps.length, skipped, query, selected: results[selected]?.name ?? null, results: results.slice(0, 10).map((app) => app.name) }),
  },
} satisfies Gary.Menu;
