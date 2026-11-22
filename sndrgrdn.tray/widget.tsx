import { Effect, Schedule, Schema, host, settings } from "gary:effect";

const height = 30;
const hidden = Schema.decodeUnknownSync(Schema.Array(Schema.String))(settings.hide ?? ["com.apple."]);
let items: Gary.TrayItem[] = [];
let problem: string | null = null;
let iconError: string | null = null;

const refresh = Effect.gen(function* () {
  const result = yield* host.tray.items();
  items = result.items.filter((item) => !hidden.some((prefix) => item.id.startsWith(prefix)));
  problem = null;
  if (result.iconError !== iconError && result.iconError) yield* host.log(`tray icons failed: ${result.iconError}`);
  iconError = result.iconError;
}).pipe(Effect.catchTag("HostError", (error) => Effect.sync(() => (problem = error.message))));

function TrayItem({ item }: { item: Gary.TrayItem }) {
  const tooltip = item.description ?? item.title ?? item.name;
  if (!item.icon) {
    return <text key={item.id} action={item.id} tooltip={tooltip} color="foreground">{item.title ?? item.name}</text>;
  }
  const width = Math.round((item.width * height) / item.height);
  return (
    <row key={item.id} action={item.id} tooltip={tooltip} width={width} height={height} clip>
      <image path={item.icon} width={width} height={height} y={-height} shadow={{ color: "foreground", radius: 0, y: height }} />
    </row>
  );
}

export default {
  effect: Effect.repeat(refresh, Schedule.spaced("5 seconds")),

  render() {
    if (problem) return <icon symbol="exclamationmark.triangle" color="alpha(foreground, 0.5)" tooltip={problem} />;
    return <row>{items.map((item) => <TrayItem item={item} />)}</row>;
  },

  onAction(id) {
    Effect.runFork(host.tray.press(id).pipe(Effect.catchTag("HostError", (error) => host.log(`press failed: ${error.message}`))));
  },

  methods: {
    state: () => ({ items: items.map(({ id, name, description, icon }) => ({ id, name, description, icon })), problem, iconError }),
  },
} satisfies Gary.BarWidget;
