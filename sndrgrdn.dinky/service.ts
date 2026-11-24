import { Effect, Queue, Schedule, Schema, Stream, host } from "gary:effect";
import type { Display, Workspace } from "./topic";

type Switch = { monitor: number; workspace: number };
type Request = "displays" | "workspaces";

class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", { message: Schema.String }) {}

const DebugState = Schema.fromJsonString(Schema.Struct({ displays: Schema.Array(Schema.Struct({ uuid: Schema.String })) }));
const requests = Effect.runSync(Queue.unbounded<Request>());
let uuids: readonly string[] = [];
let monitors = new Map<number, Workspace[]>();
let app: string | null = null;
let pending: Switch | null = null;

const dinky = Effect.fn("Dinky.exec")(function* (...argv: string[]) {
  const result = yield* host.exec(["dinky", ...argv]);
  if (result.status !== 0) return yield* new CommandFailed({ message: result.stderr.trim() });
  return result.stdout;
});

function request(kind: Request) {
  Queue.offerUnsafe(requests, kind);
}

const publish = Effect.suspend(() => {
  const displays = uuids.map((uuid, index): Display => {
    const workspaces = monitors.get(index + 1) ?? [];
    if (pending?.monitor !== index + 1) return { uuid, workspaces };
    const target = pending.workspace;
    return { uuid, workspaces: workspaces.map((each) => ({ ...each, focused: each.number === target })) };
  });
  return host.publish({ displays, app });
});

const readDisplays = Effect.fn("Dinky.readDisplays")(function* () {
  const state = yield* Schema.decodeUnknownEffect(DebugState)(yield* dinky("debug-state"));
  if (state.displays.length === 0) return yield* new CommandFailed({ message: "dinky reported no displays" });
  uuids = state.displays.map((display) => display.uuid);
}, Effect.retry({ schedule: Schedule.spaced("1 second"), times: 10 }), Effect.catch((error) => host.log("debug-state failed: " + error.message)));

const refresh = Effect.fn("Dinky.refresh")(function* () {
  const [workspaces, empty, focused] = yield* Effect.all(
    [
      dinky("list-workspaces", "--all", "--format", "%{workspace} %{workspace-is-focused} %{monitor-id} %{workspace-layout}"),
      dinky("list-workspaces", "--all", "--empty"),
      dinky("list-windows", "--focused", "--workspace", "focused", "--format", "%{app-name}").pipe(
        Effect.catchTag("CommandFailed", () => Effect.succeed("")),
      ),
    ],
    { concurrency: "unbounded" },
  );
  const emptySet = new Set(empty.split("\n").filter(Boolean).map(Number));
  monitors = new Map();
  for (const line of workspaces.split("\n")) {
    const [number, focused, monitor, layout = ""] = line.split(" ");
    if (!number) continue;
    const list = monitors.get(Number(monitor)) ?? [];
    list.push({ number: Number(number), focused: focused === "true", empty: emptySet.has(Number(number)), layout });
    monitors.set(Number(monitor), list);
  }
  app = focused.trim() || null;
  yield* publish;
}, Effect.catch((error) => host.log("list-workspaces failed: " + error.message)));

request("displays");

export default {
  effect: Stream.fromQueue(requests).pipe(
    Stream.switchMap((kind) =>
      Stream.fromEffect(kind === "displays" ? Effect.andThen(Effect.uninterruptible(readDisplays()), refresh()) : refresh()),
    ),
    Stream.runDrain,
  ),

  methods: {
    "startup": () => request("displays"),
    "workspace-changing": (display, workspace) => {
      pending = { monitor: Number(display), workspace: Number(workspace) };
      Effect.runSync(publish);
    },
    "workspace-changed": () => {
      pending = null;
      request("workspaces");
    },
    "focus-changed": () => request("workspaces"),
    "display-changed": () => request("displays"),
    "state": () => ({ uuids: [...uuids], monitors: Object.fromEntries(monitors), app, pending }),
  },
} satisfies Gary.Service;
