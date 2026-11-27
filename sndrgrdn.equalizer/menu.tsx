import { Effect, host as lifted } from "gary:effect";
import { bassShelf, presets } from "./presets";

type Theme = Gary.Theme;

const width = 300;
const rowHeight = 32;
const headerHeight = 24;

let problem: string | null = null;

function call(method: string, argument: string) {
  problem = null;
  return lifted.call({ kind: "service" }, method, argument).pipe(
    Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))),
  );
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

function Header({ name, detail, theme }: { name: string; detail?: string; theme: Theme }) {
  return (
    <row key={`header-${name}`} height={headerHeight} padding={[0, theme.spacing.item]} width={width - 2 * theme.spacing.item}>
      <text key="title" fontSize={11} font="strong" color="dim">{name.toUpperCase()}</text>
      <spacer />
      {detail ? <text key="detail" fontSize={11} font="strong" color="dim">{detail}</text> : null}
    </row>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 4, right: 4 } },

  render(state) {
    const { theme } = state;
    const { spacing } = theme;
    const equalizer = state["sndrgrdn.equalizer"];
    const preset = equalizer?.preset ?? "off";
    const bass = equalizer?.bass ?? 0;
    const stalled = equalizer != null && (preset !== "off" || bass > 0) && state.audio?.equalizer == null;
    const issue = problem ?? equalizer?.problem ?? (stalled ? "The equalizer stopped. Pick a preset to start it again." : null);
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" height={rowHeight + 2 * spacing.item} padding={[0, spacing.item]} gap={spacing.item}>
          <text key="icon" font="icon" fontSize={22} width={28} align="center" y={0.5} color="foreground">{"\u{F0EA2}"}</text>
          <column key="labels" gap={0}>
            <text key="title" style="title">Equalizer</text>
            <text key="output" fontSize={11} color="dim" lines={1} truncate="tail">{equalizer?.output?.name ?? "No output"}</text>
          </column>
        </row>
        <Divider name="divider-presets" theme={theme} />
        <column key="presets" gap={0}>
          <Header name="Presets" theme={theme} />
          {presets.map((each) => {
            const current = each.id === preset;
            return (
              <row
                key={each.id}
                height={rowHeight + 8}
                padding={[0, spacing.item]}
                radius={rowRadius(theme)}
                width={width - 2 * spacing.item}
                action={`preset:${each.id}`}
                background={current ? "selected" : undefined}
                hovered={current ? undefined : { background: "hover" }}
              >
                <column key="labels" gap={0}>
                  <text key="name" color="foreground" font={current ? "strong" : undefined}>{each.name}</text>
                  <text key="summary" fontSize={11} color="dim">{each.summary}</text>
                </column>
              </row>
            );
          })}
        </column>
        <Divider name="divider-bass" theme={theme} />
        <column key="bass" gap={0}>
          <Header name="Extra bass" detail={bass > 0 ? `+${bass} dB` : "Off"} theme={theme} />
          <row key="slider" height={rowHeight} padding={[0, spacing.item]}>
            <slider value={bass / bassShelf.maxGain} action="bass" width={width - 4 * spacing.item} color="foreground" />
          </row>
        </column>
        {issue ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{issue}</text> : null}
      </column>
    );
  },

  onAction(action, payload) {
    if (action.startsWith("preset:")) return call("select", action.slice("preset:".length));
    if (action === "bass" && typeof payload === "number") return call("bass", String(payload * bassShelf.maxGain));
  },
} satisfies Gary.Menu;
