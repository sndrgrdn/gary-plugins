import { Effect, host as lifted } from "gary:effect";
import type { HostError } from "gary:effect";
import { read, shown, symbol, type Level } from "./levels";

type Page = "tiles" | "wifi" | "bluetooth";
type Spacing = Gary.Theme["spacing"];
type TileProps = { symbol: string; title: string; detail: string; on: boolean; action?: string; rightAction?: string; tooltip?: string };

const width = 300;
const rowHeight = 32;
const visibleRows = 8;
const checkWidth = 18;

let page: Page = "tiles";
let networks: readonly Gary.WiFiNetwork[] | null = null;
let busy: string | null = null;
let secret: string | null = null;
let problem: string | null = null;

const settle = Effect.sync(() => void (busy = null));

function run(effect: Effect.Effect<unknown, HostError>, onError = (error: HostError) => void (problem = error.message)) {
  problem = null;
  Effect.runFork(effect.pipe(Effect.catchTag("HostError", (error) => Effect.sync(() => onError(error)))));
}

function open(next: Page) {
  page = next;
  busy = secret = problem = null;
  if (next !== "wifi") return;
  networks = null;
  run(lifted.wifi.scan().pipe(Effect.tap((found) => Effect.sync(() => void (networks = found)))), (error) => {
    networks = [];
    problem = error.message;
  });
}

function join(network: Gary.WiFiNetwork, password: string | null) {
  const ssid = network.ssid ?? "";
  secret = network.secure && !network.known && password === null ? ssid : null;
  if (secret) return;
  busy = ssid;
  run(lifted.wifi.join(ssid, password).pipe(Effect.ensuring(settle)));
}

function toggle(device: Gary.BluetoothDevice) {
  busy = device.address;
  const change = device.connected ? lifted.bluetooth.disconnect(device.address) : lifted.bluetooth.connect(device.address);
  run(change.pipe(Effect.ensuring(settle)));
}

function strongest(state: Gary.State) {
  const best = new Map<string, Gary.WiFiNetwork>();
  for (const network of networks ?? []) {
    if (network.ssid && (best.get(network.ssid)?.rssi ?? -Infinity) < network.rssi) best.set(network.ssid, network);
  }
  const current = state.wifi?.ssid;
  return [...best.values()].sort((a, b) => Number(b.ssid === current) - Number(a.ssid === current) || b.rssi - a.rssi);
}

function Tile(props: TileProps & { width: number; spacing: Spacing }) {
  return (
    <column
      width={props.width}
      padding={props.spacing.item}
      radius={12}
      clip
      background="control"
      hovered={{ background: "alpha(foreground, 0.16)" }}
      pressed={{ scale: 0.97 }}
      action={props.action}
      rightAction={props.rightAction}
      tooltip={props.tooltip}
    >
      <row key="badge" width={28} height={28} radius={14} background={props.on ? "foreground" : "control"} align="center" animation="smooth">
        <icon symbol={props.symbol} fontSize={13} width={28} color={props.on ? "background" : "foreground"} />
      </row>
      <column key="label" gap={0}>
        <text font="strong" color="bright">{props.title}</text>
        <text fontSize={11} color="dim">{props.detail}</text>
      </column>
    </column>
  );
}

function wifiTile(wifi: Gary.WiFi | undefined): TileProps {
  const on = wifi?.power === true;
  const detail = !wifi?.available ? "Unavailable" : !on ? "Off" : wifi.ssid ?? (wifi.connected ? "On" : "Not connected");
  return { symbol: on ? "wifi" : "wifi.slash", title: "Wi‑Fi", detail, on, action: "wifi", rightAction: "wifi-list", tooltip: "Right-click for networks" };
}

function bluetoothTile(bluetooth: Gary.Bluetooth | undefined): TileProps {
  const on = bluetooth?.power === true;
  const connected = bluetooth?.devices.find((device) => device.connected);
  const detail = bluetooth?.permission === "notDetermined" ? "Allow access"
    : !bluetooth?.available ? "Unavailable"
    : !on ? "Off"
    : connected?.name ?? "On";
  return { symbol: "dot.radiowaves.left.and.right", title: "Bluetooth", detail, on, action: "bluetooth", rightAction: "bluetooth-list", tooltip: "Right-click for devices" };
}

function focusTile(focus: Gary.Focus | undefined): TileProps {
  const on = focus?.active === true;
  const detail = !focus?.available ? "No access" : on ? focus.name ?? "On" : "Off";
  return { symbol: on ? focus?.symbol ?? "moon.fill" : "moon", title: "Focus", detail, on, tooltip: focus?.reason ?? "Gary can read Focus but not change it" };
}

function LevelSlider({ level, state }: { level: Level; state: Gary.State }) {
  const now = read(state, level);
  if (!now) return null;
  const { spacing } = state.theme;
  return (
    <row key={level}>
      <icon symbol={symbol(level, now)} width={20} color="foreground" />
      <slider value={shown(now)} action={level} width={width - 5 * spacing.item - 20} color="foreground" />
    </row>
  );
}

function tiles(state: Gary.State) {
  const { spacing } = state.theme;
  const tile = { width: (width - 6 * spacing.item) / 3, spacing };
  return (
    <column key="tiles" gap={spacing.section} padding={spacing.item}>
      <grid key="tiles" columns={3} gap={spacing.item}>
        <Tile key="wifi" {...wifiTile(state.wifi)} {...tile} />
        <Tile key="bluetooth" {...bluetoothTile(state.bluetooth)} {...tile} />
        <Tile key="focus" {...focusTile(state.focus)} {...tile} />
      </grid>
      <column key="levels">
        <LevelSlider level="volume" state={state} />
        <LevelSlider level="brightness" state={state} />
      </column>
    </column>
  );
}

function Item({ label, detail, checked, pending, action, spacing }: { label: string; detail?: Gary.Node; checked: boolean; pending: boolean; action: string; spacing: Spacing }) {
  return (
    <row key={action} height={rowHeight} padding={[0, spacing.item]} radius={6} action={action} hovered={{ background: "hover" }} width={width - 2 * spacing.item}>
      <icon symbol={pending ? "arrow.triangle.2.circlepath" : "checkmark"} width={checkWidth} opacity={checked || pending ? 1 : 0} loop={pending ? { rotation: [0, 360] } : undefined} />
      <text color={checked ? "bright" : "foreground"}>{label}</text>
      <spacer />
      {detail}
    </row>
  );
}

function wifiList(state: Gary.State) {
  const { spacing } = state.theme;
  if (networks === null) return [<text key="scanning" color="dim" height={rowHeight} padding={[0, spacing.item]}>Scanning…</text>];
  return strongest(state).flatMap((network) => {
    const ssid = network.ssid ?? "";
    const item = (
      <Item label={ssid} detail={network.secure ? <icon key="lock" symbol="lock.fill" fontSize={10} color="dim" /> : undefined} checked={ssid === state.wifi?.ssid} pending={busy === ssid} action={`join:${ssid}`} spacing={spacing} />
    );
    if (secret !== ssid) return [item];
    return [item, <input key="password" placeholder={`Password for ${ssid}`} submit="password" height={rowHeight} padding={[0, 2 * spacing.item + checkWidth]} />];
  });
}

function bluetoothList(state: Gary.State) {
  const { spacing } = state.theme;
  const devices = state.bluetooth?.devices ?? [];
  if (!devices.length) return [<text key="empty" color="dim" height={rowHeight} padding={[0, spacing.item]}>No paired devices</text>];
  return devices.map((device) => (
    <Item
      label={device.name ?? device.address}
      detail={device.battery === null ? undefined : <text key="battery" color="dim">{device.battery}%</text>}
      checked={device.connected}
      pending={busy === device.address}
      action={`device:${device.address}`}
      spacing={spacing}
    />
  ));
}

function list(title: string, items: Gary.Node[], spacing: Spacing) {
  return (
    <column key="list">
      <row key="header" height={rowHeight} padding={[0, spacing.item]} action="back" hovered={{ opacity: 0.7 }}>
        <icon symbol="chevron.left" style="dim" />
        <text style="dim" fontSize={15}>{title}</text>
      </row>
      <row key="divider" height={1} background="border" />
      <scroll key="items" height={visibleRows * rowHeight} gap={0}>{items}</scroll>
    </column>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 6, right: 8 } },

  render(state) {
    const { spacing } = state.theme;
    const body = page === "wifi" ? list("Wi‑Fi", wifiList(state), spacing)
      : page === "bluetooth" ? list("Bluetooth", bluetoothList(state), spacing)
      : tiles(state);
    return (
      <column width={width} padding={spacing.item}>
        {body}
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{problem}</text> : null}
      </column>
    );
  },

  onKey(key) {
    if (key !== "escape" || page === "tiles") return false;
    open("tiles");
    return true;
  },

  onAction(action, payload, state) {
    const { wifi, bluetooth } = state;
    if (action === "wifi") run(lifted.wifi.setPower(wifi?.power !== true));
    else if (action === "bluetooth") {
      run(bluetooth?.permission === "notDetermined" ? lifted.bluetooth.requestAccess() : lifted.bluetooth.setPower(bluetooth?.power !== true));
    } else if (action === "wifi-list" || action === "bluetooth-list") open(action === "wifi-list" ? "wifi" : "bluetooth");
    else if (action === "back") open("tiles");
    else if (action === "volume" && typeof payload === "number") {
      run(Effect.all([read(state, "volume")?.muted ? lifted.audio.setMuted(false) : Effect.void, lifted.audio.setVolume(payload)]));
    } else if (action === "brightness" && typeof payload === "number") {
      run(lifted.brightness.set(payload, read(state, "brightness")?.display ?? null));
    } else if (action.startsWith("join:")) {
      const network = strongest(state).find((each) => each.ssid === action.slice(5));
      if (network) join(network, null);
    } else if (action === "password" && typeof payload === "string") {
      const network = strongest(state).find((each) => each.ssid === secret);
      if (network) join(network, payload);
    } else if (action.startsWith("device:")) {
      const device = bluetooth?.devices.find((each) => each.address === action.slice(7));
      if (device) toggle(device);
    }
  },
} satisfies Gary.Menu;
