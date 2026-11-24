import { Effect, Queue, Schema, Stream, host, settings } from "gary:effect";

const slot = 28;
const inkHeight = 12;
const hidden = Schema.decodeUnknownSync(Schema.Array(Schema.String))(settings.hide ?? ["com.apple."]);
const collapseAfter = Schema.decodeUnknownSync(Schema.Number)(settings.collapseAfter ?? 5);
const touches = Effect.runSync(Queue.unbounded<void>());
let tray: Gary.Tray | null = null;
let open = false;

function TrayItem({ item }: { item: Gary.TrayItem }) {
  const tooltip = item.description ?? item.title ?? item.name;
  const actions = { action: item.id, rightAction: `right:${item.id}`, tooltip };
  if (!item.icon) return <text key={item.id} {...actions} color="foreground">{item.title ?? item.name}</text>;
  const scale = Math.min(1, inkHeight / item.height);
  return (
    <row key={item.id} {...actions} width={slot * Math.max(1, Math.ceil((item.width * scale) / slot))} height={slot} align="center">
      <image path={item.icon} width={item.width * scale} height={item.height * scale} color="foreground" />
    </row>
  );
}

export default {
  effect: Stream.fromQueue(touches).pipe(
    Stream.debounce(`${collapseAfter} seconds`),
    Stream.runForEach(() => Effect.sync(() => (open = false))),
  ),

  onTopic({ topic, value }) {
    if (topic === "tray") tray = { ...value, items: value.items.filter((item) => !hidden.some((prefix) => item.id.startsWith(prefix))) };
  },

  render() {
    if (tray && !tray.available) return <text font="icon" color="bad" tooltip={tray.reason}>{"\u{F002A}"}</text>;
    const items = tray?.items ?? [];
    if (items.length === 0) return <row />;
    return (
      <row animation="smooth" duration={0.3} gap={0}>
        <text key="drawer" action="toggle" tooltip={open ? "Hide tray" : "Show tray"} fontSize={13} width={slot} height={slot} align="center" style="dim" hovered={{ color: "foreground" }}>{open ? "\u{F054}" : "\u{F053}"}</text>
        {open && items.map((item) => <TrayItem item={item} />)}
      </row>
    );
  },

  onAction(action) {
    Queue.offerUnsafe(touches, undefined);
    if (action === "toggle") {
      open = !open;
      return;
    }
    const [button, id] = action.startsWith("right:") ? (["right", action.slice(6)] as const) : (["left", action] as const);
    return host.tray.press(id, { button }).pipe(Effect.catchTag("HostError", (error) => host.log(`press failed: ${error.message}`)));
  },

  methods: {
    state: () => tray,
  },
} satisfies Gary.BarWidget;
