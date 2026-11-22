import { Effect, Schedule, Stream, host as lifted, topic } from "gary:effect";
import type { HostError } from "gary:effect";

type Spacing = Gary.Theme["spacing"];

const width = 320;
const rowHeight = 32;
const visibleRows = 8;
const checkWidth = 18;
const phrases = ["Wiring bits", "Handling packets", "Sorting frames", "Hauling bytes", "Routing crumbs", "Counting collisions", "Bending light"];

let networks: readonly Gary.WiFiNetwork[] | null = null;
let address: { ip: string; gateway: string } | null = null;
let busy: string | null = null;
let secret: string | null = null;
let problem: string | null = null;
let phrase = 0;

function run(effect: Effect.Effect<unknown, HostError>) {
  problem = null;
  return effect.pipe(Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))));
}

const scan = lifted.wifi.scan().pipe(
  Effect.tap((found) => Effect.sync(() => void (networks = found))),
  Effect.catchTag("HostError", (error) => Effect.sync(() => {
    networks = [];
    problem = error.message;
  })),
);

const lookup = Effect.fn("Network.lookup")(function* (device: string) {
  const [ip, gateway] = yield* Effect.all([
    lifted.exec(["/usr/sbin/ipconfig", "getifaddr", device]),
    lifted.exec(["/usr/sbin/ipconfig", "getoption", device, "router"]),
  ]);
  address = { ip: ip.stdout.trim() || "--", gateway: gateway.stdout.trim() || "--" };
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
  for (const network of networks ?? []) {
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
  return phrases[phrase % phrases.length];
}

function Switch({ on, action, tooltip }: { on: boolean; action: string; tooltip: string }) {
  return (
    <row key="switch" width={36} height={20} radius={10} padding={2} background={on ? "foreground" : "control"} action={action} tooltip={tooltip} animation="smooth">
      <row key="knob" width={16} height={16} radius={8} background={on ? "background" : "foreground"} x={on ? 16 : 0} />
    </row>
  );
}

function Header({ title, spacing }: { title: string; spacing: Spacing }) {
  return <text key={title} fontSize={11} font="strong" color="dim" height={24} padding={[0, spacing.item]}>{title.toUpperCase()}</text>;
}

function Detail({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <column key={label} gap={0} width={width}>
      <text key="label" fontSize={11} color="dim">{label}</text>
      <text key="value" color="bright">{value}</text>
    </column>
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

function Network({ network, state, spacing }: { network: Gary.WiFiNetwork; state: Gary.State; spacing: Spacing }) {
  const ssid = network.ssid ?? "";
  const current = ssid === state.wifi?.ssid;
  const pending = busy === ssid;
  return (
    <row key={ssid} height={rowHeight} padding={[0, spacing.item]} radius={6} action={`join:${ssid}`} hovered={{ background: "hover" }} width={width - 2 * spacing.item}>
      <icon
        key="icon"
        symbol={pending ? "arrow.triangle.2.circlepath" : "wifi"}
        width={checkWidth}
        color={current ? "bright" : "dim"}
        loop={pending ? { rotation: [0, 360] } : undefined}
      />
      <text key="name" color={current ? "bright" : "foreground"}>{ssid}</text>
      <spacer />
      {pending ? <text key="status" color="dim">Connecting…</text> : current ? <text key="status" color="dim">Connected</text> : null}
      {network.secure ? <icon key="lock" symbol="lock.fill" fontSize={10} color="dim" /> : null}
    </row>
  );
}

function list(state: Gary.State, spacing: Spacing) {
  if (state.wifi?.location !== "authorized") {
    return (
      <row key="location" height={rowHeight} padding={[0, spacing.item]} radius={6} action="location" hovered={{ background: "hover" }} width={width - 2 * spacing.item}>
        <icon key="icon" symbol="location" width={checkWidth} color="dim" />
        <text key="text">Allow Location to see network names</text>
      </row>
    );
  }
  if (networks === null) return <text key="scanning" fontSize={11} font="strong" color="dim" height={rowHeight} padding={[0, spacing.item]}>SCANNING WI‑FI…</text>;
  const found = strongest(state);
  const known = found.filter((network) => network.known);
  const other = found.filter((network) => !network.known);
  const rows = (each: Gary.WiFiNetwork) => {
    const row = <Network network={each} state={state} spacing={spacing} />;
    if (secret !== each.ssid) return [row];
    return [row, <input key="password" placeholder={`Password for ${secret}`} submit="password" height={rowHeight} padding={[0, 2 * spacing.item + checkWidth]} />];
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
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 6, right: 8 } },

  effect: Effect.all([
    scan,
    Effect.repeat(Effect.sync(() => void phrase++), { schedule: Schedule.spaced("2800 millis") }),
    topic("wifi").pipe(
      Stream.map((wifi) => (wifi.connected && wifi.interface ? wifi.interface : null)),
      Stream.changes,
      Stream.runForEach((device) => (device ? lookup(device) : Effect.sync(() => void (address = null)))),
    ),
  ], { concurrency: "unbounded" }),

  render(state) {
    const { spacing } = state.theme;
    const wifi = state.wifi;
    const on = wifi?.power === true;
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" padding={spacing.item}>
          <icon key="icon" symbol={on ? "wifi" : "wifi.slash"} fontSize={20} width={28} color={wifi?.connected ? "bright" : "dim"} />
          <column key="labels" gap={2}>
            <text key="title" style="title">{wifi?.connected && wifi.ssid ? wifi.ssid : "Wi‑Fi"}</text>
            <text key="status" fontSize={11} color="dim">{status(wifi).toUpperCase()}</text>
          </column>
          <spacer />
          {wifi?.available ? <Switch on={on} action="power" tooltip={on ? "Turn Wi‑Fi off" : "Turn Wi‑Fi on"} /> : null}
        </row>
        {wifi?.connected ? details(wifi, spacing) : null}
        <row key="divider" height={1} width={width - 2 * spacing.item} background="border" />
        {on ? list(state, spacing) : <text key="off" color="dim" height={rowHeight} padding={[0, spacing.item]}>Turn Wi‑Fi on to see networks</text>}
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{problem}</text> : null}
      </column>
    );
  },

  onAction(action, payload, state) {
    if (action === "power") return run(lifted.wifi.setPower(state.wifi?.power !== true)).pipe(Effect.andThen(Effect.delay(scan, "2 seconds")));
    if (action === "location") return run(lifted.wifi.requestLocation());
    const ssid = action.startsWith("join:") ? action.slice(5) : action === "password" ? secret : null;
    const network = strongest(state).find((each) => each.ssid === ssid);
    if (!network || network.ssid === state.wifi?.ssid || busy) return;
    return join(network, action === "password" && typeof payload === "string" ? payload : null);
  },
} satisfies Gary.Menu;
