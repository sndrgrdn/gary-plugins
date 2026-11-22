type Workspace = { number: number; focused: boolean; empty: boolean; layout: string };
type Display = { uuid: string; workspaces: Workspace[] };
type Dinky = { displays: Display[]; app: string | null };
type Switch = { monitor: number; workspace: number };

const dinky = "dinky";
let uuids: string[] = [];
let monitors = new Map<number, Workspace[]>();
let app: string | null = null;
let pending: Switch | null = null;
let started = 0;

function run(argv: string[]): Promise<Gary.ExecResult> {
  return new Promise((resolve) => host.exec([dinky, ...argv], resolve));
}

function publish() {
  const displays = uuids.map((uuid, index): Display => {
    const workspaces = monitors.get(index + 1) ?? [];
    if (pending?.monitor !== index + 1) return { uuid, workspaces };
    const target = pending.workspace;
    return { uuid, workspaces: workspaces.map((each) => ({ ...each, focused: each.number === target })) };
  });
  host.publish({ displays, app } satisfies Dinky);
}

function readDisplays() {
  return run(["debug-state"]).then((result) => {
    if (result.status !== 0) return host.log("debug-state failed: " + result.stderr.trim());
    const state = JSON.parse(result.stdout) as { displays: { uuid: string }[] };
    uuids = state.displays.map((display) => display.uuid);
  });
}

function refresh() {
  const id = ++started;
  return Promise.all([
    run(["list-workspaces", "--all", "--format", "%{workspace} %{workspace-is-focused} %{monitor-id} %{workspace-layout}"]),
    run(["list-workspaces", "--all", "--empty"]),
    run(["list-windows", "--focused", "--workspace", "focused", "--format", "%{app-name}"]),
  ]).then(([workspaces, empty, focused]) => {
    if (id !== started) return;
    if (workspaces.status !== 0 || empty.status !== 0) return host.log("list-workspaces failed: " + workspaces.stderr.trim() + empty.stderr.trim());
    const emptySet = new Set(empty.stdout.split("\n").filter(Boolean).map(Number));
    monitors = new Map();
    for (const line of workspaces.stdout.split("\n")) {
      const [number, focused, monitor, layout = ""] = line.split(" ");
      if (!number) continue;
      const list = monitors.get(Number(monitor)) ?? [];
      list.push({ number: Number(number), focused: focused === "true", empty: emptySet.has(Number(number)), layout });
      monitors.set(Number(monitor), list);
    }
    app = focused.status === 0 && focused.stdout.trim() ? focused.stdout.trim() : null;
    publish();
  });
}

readDisplays().then(refresh);

export default {
  methods: {
    "startup": () => void readDisplays().then(refresh),
    "workspace-changing": (display, workspace) => {
      pending = { monitor: Number(display), workspace: Number(workspace) };
      publish();
    },
    "workspace-changed": () => {
      pending = null;
      refresh();
    },
    "focus-changed": () => void refresh(),
    "display-changed": () => void readDisplays().then(refresh),
    "state": () => ({ uuids, monitors: Object.fromEntries(monitors), app, pending }),
  },
} satisfies Gary.Service;
