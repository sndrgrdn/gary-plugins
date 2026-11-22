import { Effect, host as lifted } from "gary:effect";
import type { HostError } from "gary:effect";

type Theme = Gary.Theme;
type Scope = Gary.AudioScope;

const width = 320;
const rowHeight = 32;
const headerHeight = 24;
const headphones = /headphone|headset|earbud|earphone|airpod/i;

let problem: string | null = null;

function run(effect: Effect.Effect<unknown, HostError>) {
  problem = null;
  return effect.pipe(Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))));
}

function level(device: Gary.AudioDeviceState | null | undefined) {
  return device?.muted ? 0 : device?.volume ?? 0;
}

function status(output: Gary.AudioDeviceState | null | undefined) {
  if (!output) return "No output";
  return output.muted ? "Muted" : null;
}

function outputSymbol(output: Gary.AudioDeviceState | null | undefined) {
  if (output && headphones.test(output.name)) return "headphones";
  const volume = level(output);
  return volume === 0 ? "speaker.slash.fill" : volume < 0.34 ? "speaker.wave.1.fill" : volume < 0.67 ? "speaker.wave.2.fill" : "speaker.wave.3.fill";
}

function deviceSymbol(device: Gary.AudioDeviceSummary, scope: Scope) {
  if (headphones.test(device.name)) return "headphones";
  if (device.transport === "bluetooth") return "dot.radiowaves.left.and.right";
  if (device.transport === "airplay") return "airplayaudio";
  if (device.transport === "hdmi" || device.transport === "displayport") return "display";
  if (device.transport === "continuity" || /camera|webcam/i.test(device.name)) return "web.camera";
  return scope === "output" ? "hifispeaker" : "mic";
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

function Device({ device, scope, current, theme }: { device: Gary.AudioDeviceSummary; scope: Scope; current: boolean; theme: Theme }) {
  const { spacing } = theme;
  return (
    <row
      key={device.id}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={rowRadius(theme)}
      width={width - 2 * spacing.item}
      action={`${scope}:device:${device.id}`}
      background={current ? "selected" : undefined}
      hovered={{ background: "hover" }}
    >
      <icon key="icon" symbol={deviceSymbol(device, scope)} width={18} color={current ? "bright" : "dim"} />
      <text key="name" color={current ? "bright" : "foreground"}>{device.name}</text>
    </row>
  );
}

function Channel({ scope, state }: { scope: Scope; state: Gary.State }) {
  const { spacing } = state.theme;
  const now = state.audio?.[scope];
  const devices = (state.audio?.devices ?? []).filter((device) => device[scope]);
  if (!now && !devices.length) return null;
  return (
    <column key={scope} gap={0}>
      <row key="header" height={headerHeight} padding={[0, spacing.item]} width={width - 2 * spacing.item}>
        <text key="title" fontSize={11} font="strong" color="dim">{scope.toUpperCase()}</text>
        <spacer />
        <text key="percent" fontSize={11} font="strong" color="dim">{now?.volume == null ? "–" : `${Math.round(level(now) * 100)}%`}</text>
      </row>
      {now?.volume != null ? (
        <row key="slider" height={rowHeight} padding={[0, spacing.item]}>
          <slider value={level(now)} action={`${scope}:volume`} rightAction={`${scope}:mute`} width={width - 4 * spacing.item} color="foreground" />
        </row>
      ) : null}
      {devices.map((device) => <Device device={device} scope={scope} current={device.id === now?.id} theme={state.theme} />)}
    </column>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 8, right: 20 } },

  render(state) {
    const { theme } = state;
    const { spacing } = theme;
    const { output, input } = state.audio ?? {};
    const audible = (output != null && !output.muted) || (input != null && !input.muted);
    const label = status(output);
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" height={rowHeight + 2 * spacing.item} padding={[0, spacing.item]}>
          <icon key="icon" symbol={outputSymbol(output)} fontSize={20} width={28} color={audible ? "bright" : "dim"} />
          <column key="labels" gap={0}>
            <text key="title" style="title">Audio</text>
            {label ? <text key="status" fontSize={11} color="dim">{label.toUpperCase()}</text> : null}
          </column>
          <spacer />
          <Switch on={audible} action="mute" tooltip={audible ? "Mute" : "Unmute"} />
        </row>
        <Divider name="divider-output" theme={theme} />
        <Channel scope="output" state={state} />
        {input || state.audio?.devices.some((device) => device.input) ? <Divider name="divider-input" theme={theme} /> : null}
        <Channel scope="input" state={state} />
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{problem}</text> : null}
      </column>
    );
  },

  onAction(action, payload, state) {
    const audio = state.audio;
    if (!audio) return;
    if (action === "mute") {
      const mute = (audio.output != null && !audio.output.muted) || (audio.input != null && !audio.input.muted);
      return run(Effect.all([
        audio.output ? lifted.audio.setMuted(mute) : Effect.void,
        audio.input ? lifted.audio.setMuted(mute, "input") : Effect.void,
      ]));
    }
    const [scope, verb] = action.split(":") as [Scope, string];
    const now = audio[scope];
    if (verb === "volume" && typeof payload === "number") {
      return run(Effect.all([now?.muted ? lifted.audio.setMuted(false, scope) : Effect.void, lifted.audio.setVolume(payload, scope)]));
    }
    if (verb === "mute" && now) return run(lifted.audio.setMuted(!now.muted, scope));
    if (verb === "device") return run(lifted.audio.setDefaultDevice(action.slice(`${scope}:device:`.length), scope));
  },
} satisfies Gary.Menu;
