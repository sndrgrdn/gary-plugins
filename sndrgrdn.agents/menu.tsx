import { Effect, Stream, host } from "gary:effect";
import type { Provider, Window } from "./topic";
import { alarming, clock, duration, pace } from "./usage";

type Theme = Gary.Theme;

const width = 380;
const heroHeight = 48;
const headHeight = 24;
const captionHeight = 16;
const rowHeight = 20;
const markSize = 16;
const buttonSize = 32;
const thickness = 4;
const tickWidth = 2;
const tickHeight = thickness * 3;
const meterGap = 20;
const valueWidth = 48;
const grey = "mix(foreground, #000000, 0.35)";

function percent(value: number) {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function caption(providers: readonly Provider[]) {
  const failed = providers.find((provider) => provider.problem);
  if (failed?.problem && providers.every((provider) => provider.problem)) return failed.problem.message;
  const latest = Math.max(0, ...providers.map((provider) => provider.fetchedAt ?? 0));
  return latest ? `Updated ${clock(latest)}` : "Checking…";
}

function tooltip(window: Window, provider: Provider, now: number) {
  const left = window.resetsAt === null ? 0 : window.resetsAt - now;
  const lines = [left > 0 ? `${window.label}: ${percent(window.percent)}% used · resets in ${duration(left)}` : `${window.label}: ${percent(window.percent)}% used`];
  const paced = pace(window, now);
  if (paced) {
    const difference = Math.round(window.percent - paced.expected);
    const verdict = difference > 0 ? `${difference}% over pace` : difference < 0 ? `${-difference}% under pace` : "On pace";
    lines.push(paced.runsOutIn === null ? `${verdict} · lasts until reset` : `${verdict} · runs out in ${duration(paced.runsOutIn)}`);
  }
  if (provider.problem && provider.fetchedAt) lines.push(`Last updated ${clock(provider.fetchedAt)}`);
  return lines.join("\n");
}

function Divider({ name, theme }: { name: string; theme: Theme }) {
  return (
    <row key={name} height={0}>
      <row key="line" height={1} width={width - 2 * theme.spacing.item} background="border" />
    </row>
  );
}

function Meter({ window, length, now }: { window: Window; length: number; now: number }) {
  const color = alarming(window.percent) ? "bad" : "foreground";
  const top = (tickHeight - thickness) / 2;
  const paced = pace(window, now);
  return (
    <stack key="meter" width={length} height={tickHeight}>
      <row key="track" y={top} width={length} height={thickness} radius={thickness / 2} background="selected" />
      <row key="fill" y={top} width={(length * percent(window.percent)) / 100} height={thickness} radius={thickness / 2} background={color} />
      {paced && (
        <row
          key="pace"
          x={Math.min(length - tickWidth, Math.max(0, (length * paced.expected) / 100 - tickWidth / 2))}
          width={tickWidth}
          height={tickHeight}
          radius={tickWidth / 2}
          background="dim"
        />
      )}
    </stack>
  );
}

function WindowRow({ window, provider, spacing, now }: { window: Window; provider: Provider; spacing: Theme["spacing"]; now: number }) {
  const inner = width - 4 * spacing.item;
  const title = Math.round((inner * 0.3) / 4) * 4;
  const left = window.resetsAt === null ? 0 : window.resetsAt - now;
  return (
    <row key={window.label} height={rowHeight} gap={0} padding={[0, spacing.item]} tooltip={tooltip(window, provider, now)}>
      <text key="title" width={title} fontSize={12} color="foreground" truncate="tail">{window.label}</text>
      <Meter window={window} length={inner - title - meterGap - valueWidth} now={now} />
      <text key="value" width={meterGap + valueWidth} align="trailing" fontSize={12} color="dim">{duration(left)}</text>
    </row>
  );
}

function Section({ provider, theme, now }: { provider: Provider; theme: Theme; now: number }) {
  const { spacing } = theme;
  const { problem } = provider;
  const empty = provider.fetchedAt === null ? "Checking…" : "No limits reported";
  return (
    <column key={provider.id} gap={spacing.item}>
      <row key="head" height={headHeight} padding={[0, spacing.item]} gap={spacing.item}>
        <image key="mark" path={`assets/${provider.id}.svg`} width={markSize} height={markSize} color="foreground" />
        <text key="name" font="strong" color="foreground">{provider.name}</text>
        <spacer />
        {provider.plan !== null && <text key="plan" fontSize={11} color="dim">{provider.plan}</text>}
      </row>
      {problem?.kind === "signed-out" && (
        <text key="problem" height={captionHeight} padding={[0, spacing.item]} fontSize={11} color="bad" tooltip={problem.message}>Sign-in required</text>
      )}
      {problem?.kind === "unavailable" && (
        <text key="problem" height={captionHeight} padding={[0, spacing.item]} fontSize={11} color="dim">{problem.message}</text>
      )}
      {provider.windows.map((window) => <WindowRow window={window} provider={provider} spacing={spacing} now={now} />)}
      {!problem && provider.windows.length === 0 && (
        <text key="empty" height={captionHeight} padding={[0, spacing.item]} fontSize={11} color="dim">{empty}</text>
      )}
    </column>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 4, right: 4 } },

  effect: Effect.all([Effect.ignore(host.call("refresh")), Stream.runDrain(Stream.tick("1 minute"))], { concurrency: "unbounded", discard: true }),

  render(state) {
    const { theme } = state;
    const { spacing, radius } = theme;
    const providers = state["sndrgrdn.agents"]?.providers ?? [];
    const now = Date.now();
    return (
      <column width={width} padding={[spacing.item, spacing.item, spacing.section, spacing.item]} gap={spacing.section}>
        <row key="hero" height={heroHeight} padding={[0, spacing.item]} gap={spacing.item}>
          <text key="glyph" fontSize={24} width={32} align="center" color="foreground">{"\u{F16A3}"}</text>
          <column key="labels" gap={0}>
            <text key="title" style="title">Agents</text>
            <text key="caption" fontSize={11} color="dim">{caption(providers)}</text>
          </column>
          <spacer />
          <text
            key="refresh"
            action="refresh"
            tooltip="Refresh"
            width={buttonSize}
            height={buttonSize}
            align="center"
            radius={radius.control}
            fontSize={16}
            color={grey}
            background={`alpha(${grey}, 0.12)`}
            hovered={{ color: "accent", border: { color: "accent" } }}
          >
            {"\u{F0450}"}
          </text>
        </row>
        {providers.flatMap((provider) => [
          <Divider name={`divider-${provider.id}`} theme={theme} />,
          <Section provider={provider} theme={theme} now={now} />,
        ])}
      </column>
    );
  },

  onAction(action) {
    if (action === "refresh") return Effect.ignore(host.call("refresh"));
  },
} satisfies Gary.Menu;
