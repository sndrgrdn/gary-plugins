import { Effect, Schema, host, settings } from "gary:effect";

const height = 30;
const hidden = Schema.decodeUnknownSync(Schema.Array(Schema.String))(settings.hide ?? ["com.apple."]);
let tray: Gary.Tray | null = null;

function TrayItem({ item }: { item: Gary.TrayItem }) {
  const tooltip = item.description ?? item.title ?? item.name;
  const actions = { action: item.id, rightAction: `right:${item.id}`, tooltip };
  if (!item.icon) return <text key={item.id} {...actions} color="foreground">{item.title ?? item.name}</text>;
  return <image key={item.id} {...actions} path={item.icon} width={Math.round((item.width * height) / item.height)} height={height} color="foreground" />;
}

export default {
  onTopic({ topic, value }) {
    if (topic === "tray") tray = { ...value, items: value.items.filter((item) => !hidden.some((prefix) => item.id.startsWith(prefix))) };
  },

  render() {
    if (tray && !tray.available) return <icon symbol="exclamationmark.triangle" color="alpha(foreground, 0.5)" tooltip={tray.reason} />;
    return <row>{(tray?.items ?? []).map((item) => <TrayItem item={item} />)}</row>;
  },

  onAction(action) {
    const [button, id] = action.startsWith("right:") ? (["right", action.slice(6)] as const) : (["left", action] as const);
    return host.tray.press(id, { button }).pipe(Effect.catchTag("HostError", (error) => host.log(`press failed: ${error.message}`)));
  },

  methods: {
    state: () => tray,
  },
} satisfies Gary.BarWidget;
