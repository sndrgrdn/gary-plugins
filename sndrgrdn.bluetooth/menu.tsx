import { Effect, host as lifted } from "gary:effect";
import type { HostError } from "gary:effect";

type Spacing = Gary.Theme["spacing"];
type Theme = Gary.Theme;

const width = 320;
const rowHeight = 32;
const headerHeight = 24;
const visibleRows = 8;

let busy: { address: string; doing: "Connecting…" | "Disconnecting…" | "Pairing…" } | null = null;
let problem: string | null = null;

function run(effect: Effect.Effect<unknown, HostError>) {
  problem = null;
  return effect.pipe(Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))));
}

function status(bluetooth: Gary.Bluetooth | undefined) {
  if (bluetooth?.permission === "notDetermined") return "Allow access";
  if (!bluetooth?.available) return "No adapter";
  if (!bluetooth.power) return "Turned off";
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
    <row key="switch" width={36} height={20} radius={10} padding={2} background={on ? "foreground" : "control"} action={action} tooltip={tooltip} animation="smooth">
      <row key="knob" width={16} height={16} radius={8} background={on ? "background" : "foreground"} x={on ? 16 : 0} />
    </row>
  );
}

function Header({ title, spacing }: { title: string; spacing: Spacing }) {
  return <text key={title} fontSize={11} font="strong" color="dim" height={headerHeight} padding={[0, spacing.item]}>{title.toUpperCase()}</text>;
}

function Device({ device, theme }: { device: Gary.BluetoothDevice | Gary.BluetoothNearbyDevice; theme: Theme }) {
  const { spacing } = theme;
  const paired = "connected" in device;
  const connected = paired && device.connected;
  const pending = busy?.address === device.address;
  const detail = pending ? busy?.doing : connected && device.battery !== null ? `${device.battery}%` : "";
  return (
    <row
      key={device.address}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={rowRadius(theme)}
      width={width - 2 * spacing.item}
      action={`${paired ? "device" : "pair"}:${device.address}`}
      hovered={{ background: "hover" }}
      tooltip={paired ? (connected ? "Disconnect" : "Connect") : "Pair"}
    >
      <icon
        key="icon"
        symbol={pending ? "arrow.triangle.2.circlepath" : "dot.radiowaves.left.and.right"}
        width={18}
        color={connected ? "bright" : "dim"}
        loop={pending ? { rotation: [0, 360] } : undefined}
      />
      <text key="name" color={connected ? "bright" : "foreground"}>{device.name ?? device.address}</text>
      <spacer />
      <text key="detail" color="dim">{detail}</text>
    </row>
  );
}

function devices(bluetooth: Gary.Bluetooth, theme: Theme) {
  const { spacing } = theme;
  const sorted = [...bluetooth.devices].sort((a, b) => (a.name ?? a.address).localeCompare(b.name ?? b.address));
  const connected = sorted.filter((device) => device.connected);
  const paired = sorted.filter((device) => !device.connected);
  const nearby = [...bluetooth.nearby].sort((a, b) => (a.name ?? a.address).localeCompare(b.name ?? b.address));
  return (
    <scroll key="devices" height={visibleRows * rowHeight} gap={0}>
      {connected.length > 0 && <Header title="Connected" spacing={spacing} />}
      {connected.map((device) => <Device device={device} theme={theme} />)}
      {paired.length > 0 && <Header title="Paired" spacing={spacing} />}
      {paired.map((device) => <Device device={device} theme={theme} />)}
      <Header title="Nearby" spacing={spacing} />
      {nearby.length > 0
        ? nearby.map((device) => <Device device={device} theme={theme} />)
        : <text key="searching" color="dim" height={rowHeight} padding={[0, spacing.item]}>Looking for devices…</text>}
    </scroll>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 8, right: 20 } },

  effect: lifted.bluetooth.discover(true),

  render(state) {
    const { theme } = state;
    const { spacing } = theme;
    const bluetooth = state.bluetooth;
    const on = bluetooth?.power === true;
    const label = status(bluetooth);
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" height={rowHeight + 2 * spacing.item} padding={[0, spacing.item]}>
          <icon key="icon" symbol="dot.radiowaves.left.and.right" fontSize={20} width={28} color={on ? "bright" : "dim"} />
          <column key="labels" gap={0}>
            <text key="title" style="title">Bluetooth</text>
            {label ? <text key="status" fontSize={11} color="dim">{label.toUpperCase()}</text> : null}
          </column>
          <spacer />
          {bluetooth?.available || bluetooth?.permission === "notDetermined" ? <Switch on={on} action="power" tooltip={on ? "Turn Bluetooth off" : "Turn Bluetooth on"} /> : null}
        </row>
        <Divider name="divider" theme={theme} />
        {bluetooth && on
          ? devices(bluetooth, theme)
          : <text key="off" color="dim" height={rowHeight} padding={[0, spacing.item]}>{bluetooth?.available ? "Turn Bluetooth on to see your devices" : "No Bluetooth adapter"}</text>}
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{problem}</text> : null}
      </column>
    );
  },

  onAction(action, _payload, state) {
    const bluetooth = state.bluetooth;
    if (action === "power") {
      return run(bluetooth?.permission === "notDetermined" ? lifted.bluetooth.requestAccess() : lifted.bluetooth.setPower(bluetooth?.power !== true));
    }
    if (busy) return;
    if (action.startsWith("pair:")) {
      const address = action.slice(5);
      busy = { address, doing: "Pairing…" };
      return run(lifted.bluetooth.pair(address).pipe(Effect.andThen(lifted.bluetooth.connect(address)))).pipe(Effect.ensuring(Effect.sync(() => void (busy = null))));
    }
    const device = action.startsWith("device:") ? bluetooth?.devices.find((each) => each.address === action.slice(7)) : undefined;
    if (!device) return;
    busy = { address: device.address, doing: device.connected ? "Disconnecting…" : "Connecting…" };
    const change = device.connected ? lifted.bluetooth.disconnect(device.address) : lifted.bluetooth.connect(device.address);
    return run(change).pipe(Effect.ensuring(Effect.sync(() => void (busy = null))));
  },
} satisfies Gary.Menu;
