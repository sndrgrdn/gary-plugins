import { Effect, Option, Schema, Stream, host as lifted, topic } from "gary:effect";
import type { HostError } from "gary:effect";
import { glyph } from "./glyph";

type Spacing = Gary.Theme["spacing"];
type Theme = Gary.Theme;

const width = 320;
const rowHeight = 32;
const headerHeight = 24;
const visibleRows = 8;
const checkWidth = 18;
const buttonSize = 28;
const grey = "mix(foreground, #000000, 0.35)";

const Address = Schema.Struct({ device: Schema.String, ip: Schema.String, gateway: Schema.String });
const stored = Option.getOrNull(Schema.decodeUnknownOption(Address)(host.storage.get("address")));

let address: { ip: string; gateway: string } | null = stored;
let busy: string | null = null;
let secret: string | null = null;
let forgetting: string | null = null;
let problem: string | null = null;

function run(effect: Effect.Effect<unknown, HostError>) {
  problem = null;
  return effect.pipe(Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))));
}

const scan = lifted.wifi.scan().pipe(
  Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))),
);

const lookup = Effect.fn("Network.lookup")(function* (device: string) {
  const [ip, gateway] = yield* Effect.all([
    lifted.exec(["/usr/sbin/ipconfig", "getifaddr", device]),
    lifted.exec(["/usr/sbin/ipconfig", "getoption", device, "router"]),
  ]);
  address = { ip: ip.stdout.trim() || "--", gateway: gateway.stdout.trim() || "--" };
  yield* lifted.storage.set("address", { device, ...address });
}, Effect.catchTag("HostError", () => Effect.sync(() => void (address = null))));

function join(network: Gary.WiFiNetwork, password: string | null) {
  const ssid = network.ssid ?? "";
  secret = network.secure && !network.known && password === null ? ssid : null;
  if (secret) return;
  busy = ssid;
  return run(lifted.wifi.join(ssid, password)).pipe(Effect.ensuring(Effect.sync(() => void (busy = null))));
}

function strongest(state: Gary.State) {
  const best = new Map<string, Gary.WiFiNetwork>();
  for (const network of state.wifi?.networks ?? []) {
    if (network.ssid && (best.get(network.ssid)?.rssi ?? -Infinity) < network.rssi) best.set(network.ssid, network);
  }
  const current = state.wifi?.ssid;
  return [...best.values()].sort((a, b) =>
    Number(b.ssid === current) - Number(a.ssid === current) || Number(b.known) - Number(a.known) || b.rssi - a.rssi,
  );
}

function status(wifi: Gary.WiFi | undefined) {
  if (!wifi?.available) return "No adapter";
  if (!wifi.power) return "Turned off";
  if (!wifi.connected) return "Not connected";
  return null;
}

function rowRadius({ radius, spacing }: Theme) {
  return Math.max(0, radius.surface - spacing.item);
}

function Divider({ name, theme }: { name: string; theme: Theme }) {
  return (
    <row key={name} height={0}>
      <row key="line" height={1} width={width - 2 * theme.spacing.item} background="border" />
    </row>
  );
}

function Switch({ on, action, tooltip }: { on: boolean; action: string; tooltip: string }) {
  return (
    <row
      key="switch"
      width={36}
      height={20}
      radius={10}
      padding={2}
      background={on ? "selected" : "control"}
      border={{ color: on ? "selected" : "alpha(foreground, 0.4)" }}
      action={action}
      tooltip={tooltip}
      animation="smooth"
    >
      <row key="knob" width={16} height={16} radius={8} background={on ? "foreground" : "dim"} x={on ? 16 : 0} />
    </row>
  );
}

function Header({ title, spacing }: { title: string; spacing: Spacing }) {
  return <text key={title} fontSize={11} font="strong" color="dim" height={headerHeight} padding={[0, spacing.item]}>{title.toUpperCase()}</text>;
}

function Detail({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <row key={label} width={width} height={rowHeight}>
      <column key="text" gap={0}>
        <text key="label" fontSize={11} color="dim">{label}</text>
        <text key="value" color="foreground">{value}</text>
      </column>
    </row>
  );
}

function details(wifi: Gary.WiFi, spacing: Spacing) {
  const cell = (width - 4 * spacing.item - spacing.section) / 2;
  const rows: [string, string][] = [
    ["Signal", wifi.rssi == null ? "--" : `${wifi.rssi} dBm`],
    ["Rate", wifi.transmitRate == null ? "--" : `${Math.round(wifi.transmitRate)} Mbps`],
    ["Channel", wifi.channel == null ? "--" : String(wifi.channel)],
    ["Noise", wifi.noise == null ? "--" : `${wifi.noise} dBm`],
    ["IP address", address?.ip ?? "--"],
    ["Gateway", address?.gateway ?? "--"],
  ];
  return (
    <grid key="details" columns={2} gap={spacing.item} padding={[0, spacing.item]}>
      {rows.map(([label, value]) => <Detail label={label} value={value} width={cell} />)}
    </grid>
  );
}

function Network({ network, state }: { network: Gary.WiFiNetwork; state: Gary.State }) {
  const { spacing } = state.theme;
  const ssid = network.ssid ?? "";
  const current = ssid === state.wifi?.ssid;
  const pending = busy === ssid;
  return (
    <row
      key={ssid}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={rowRadius(state.theme)}
      action={`join:${ssid}`}
      rightAction={network.known ? `options:${ssid}` : undefined}
      tooltip={network.known ? "Right-click to forget" : undefined}
      background={current ? "selected" : undefined}
      hovered={current ? undefined : { background: "hover" }}
      width={width - 2 * spacing.item}
    >
      <text
        key="icon"
        font="icon"
        fontSize={15}
        width={checkWidth}
        align="center"
        y={0.5}
        color="foreground"
        loop={pending ? { rotation: [0, 360] } : undefined}
      >
        {pending ? "\u{F04E6}" : "\u{F05A9}"}
      </text>
      <text key="name" color="foreground" font={current ? "strong" : undefined}>{ssid}</text>
      <spacer />
      {pending ? <text key="status" color="dim">{busy === forgetting ? "Forgetting…" : "Connecting…"}</text> : current ? <text key="status" color="dim">Connected</text> : null}
      {network.secure ? <text key="lock" font="icon" fontSize={10} width={10} align="center" color="dim">{"\u{F033E}"}</text> : null}
    </row>
  );
}

function list(state: Gary.State) {
  const { spacing } = state.theme;
  if (state.wifi?.location !== "authorized") {
    return (
      <row key="location" height={rowHeight} padding={[0, spacing.item]} radius={rowRadius(state.theme)} action="location" hovered={{ background: "hover" }} width={width - 2 * spacing.item}>
        <text key="icon" font="icon" fontSize={15} width={checkWidth} align="center" y={0.5} color="dim">{"\u{F034E}"}</text>
        <text key="text">Allow Location to see network names</text>
      </row>
    );
  }
  if (!state.wifi?.networks && !problem) return <text key="scanning" color="dim" height={rowHeight} padding={[0, spacing.item]}>Scanning Wi‑Fi…</text>;
  const found = strongest(state);
  const known = found.filter((network) => network.known);
  const other = found.filter((network) => !network.known);
  const rows = (each: Gary.WiFiNetwork) => {
    const row = <Network network={each} state={state} />;
    if (forgetting === each.ssid) {
      return [
        row,
        <row key="forget" height={rowHeight} padding={[0, spacing.item]} radius={rowRadius(state.theme)} action={`forget:${forgetting}`} hovered={{ background: "hover" }} width={width - 2 * spacing.item}>
          <text key="icon" font="icon" fontSize={15} width={checkWidth} align="center" y={0.5} color="dim">{"\u{F0377}"}</text>
          <text key="text">Forget This Network</text>
        </row>,
      ];
    }
    if (secret !== each.ssid) return [row];
    return [row, <input key="password" placeholder={`Password for ${secret}`} submit="password" width={width - 2 * spacing.item} height={rowHeight} padding={[0, 2 * spacing.item + checkWidth]} />];
  };
  return (
    <scroll key="networks" height={visibleRows * rowHeight} gap={0}>
      {known.length > 0 && <Header title="Known networks" spacing={spacing} />}
      {known.flatMap(rows)}
      {other.length > 0 && <Header title="Other networks" spacing={spacing} />}
      {other.flatMap(rows)}
    </scroll>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 8, right: 20 } },

  effect: Effect.all([
    scan,
    topic("wifi").pipe(
      Stream.map((wifi) => (wifi.connected && wifi.interface ? wifi.interface : null)),
      Stream.changes,
      Stream.runForEach((device) => {
        if (device !== stored?.device) address = null;
        return device ? lookup(device) : Effect.void;
      }),
    ),
  ], { concurrency: "unbounded" }),

  render(state) {
    const { theme } = state;
    const { spacing } = theme;
    const wifi = state.wifi;
    const on = wifi?.power === true;
    const label = status(wifi);
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" height={rowHeight + 2 * spacing.item} padding={[0, spacing.item]}>
          <text key="icon" font="icon" fontSize={22} width={28} align="center" y={0.5} color="foreground" opacity={wifi?.connected ? 1 : 0.5}>{glyph(wifi)}</text>
          <column key="labels" gap={0}>
            <text key="title" style="title">{wifi?.connected && wifi.ssid ? wifi.ssid : "Wi‑Fi"}</text>
            {label ? <text key="status" fontSize={11} color="dim">{label.toUpperCase()}</text> : null}
          </column>
          <spacer />
          <row key="actions" gap={spacing.item}>
            {wifi?.connected ? (
              <text key="speedtest" action="speedtest" tooltip="Run a speed test" width={buttonSize} height={buttonSize} align="center" radius={theme.radius.control} fontSize={20} color={grey} background={`alpha(${grey}, 0.12)`} hovered={{ color: "accent", border: { color: "accent" } }}>
                {"\u{F04C5}"}
              </text>
            ) : null}
            {wifi?.available ? <Switch on={on} action="power" tooltip={on ? "Turn Wi‑Fi off" : "Turn Wi‑Fi on"} /> : null}
          </row>
        </row>
        {wifi?.connected ? details(wifi, spacing) : null}
        <Divider name="divider" theme={theme} />
        {on ? list(state) : <text key="off" color="dim" height={rowHeight} padding={[0, spacing.item]}>Turn Wi‑Fi on to see networks</text>}
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{problem}</text> : null}
      </column>
    );
  },

  onAction(action, payload, state) {
    if (action === "speedtest") return lifted.show("speedtest").pipe(Effect.andThen(lifted.hide()));
    if (action === "power") return run(lifted.wifi.setPower(state.wifi?.power !== true)).pipe(Effect.andThen(Effect.delay(scan, "2 seconds")));
    if (action === "location") return run(lifted.wifi.requestLocation());
    if (action.startsWith("options:")) return void (forgetting = forgetting === action.slice(8) ? null : action.slice(8));
    if (action.startsWith("forget:")) {
      if (busy) return;
      busy = action.slice(7);
      return run(lifted.wifi.forget(busy)).pipe(Effect.ensuring(Effect.sync(() => void (busy = forgetting = null))));
    }
    const ssid = action.startsWith("join:") ? action.slice(5) : action === "password" ? secret : null;
    const network = strongest(state).find((each) => each.ssid === ssid);
    if (!network || network.ssid === state.wifi?.ssid || busy) return;
    return join(network, action === "password" && typeof payload === "string" ? payload : null);
  },
} satisfies Gary.Menu;
