import { Effect, host as lifted } from "gary:effect";

type Spacing = Gary.Theme["spacing"];
type Theme = Gary.Theme;
type Controlled = Gary.BrightnessDisplay & { brightness: number };

const width = 320;
const rowHeight = 32;
const headerHeight = 24;

let problem: string | null = null;

function Divider({ name, theme }: { name: string; theme: Theme }) {
  return (
    <row key={name} height={0}>
      <row key="line" height={1} width={width - 2 * theme.spacing.item} background="border" />
    </row>
  );
}

function Display({ display, title, spacing }: { display: Controlled; title: string; spacing: Spacing }) {
  return (
    <column key={display.id} gap={0}>
      <row key="header" height={headerHeight} padding={[0, spacing.item]} width={width - 2 * spacing.item}>
        <text key="title" fontSize={11} font="strong" color="dim">{title.toUpperCase()}</text>
        <spacer />
        <text key="percent" fontSize={11} font="strong" color="dim">{`${Math.round(display.brightness * 100)}%`}</text>
      </row>
      <row key="slider" height={rowHeight} padding={[0, spacing.item]}>
        <slider value={display.brightness} action={`brightness:${display.id}`} width={width - 4 * spacing.item} color="foreground" />
      </row>
    </column>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 8, right: 20 } },

  render(state) {
    const { theme } = state;
    const { spacing } = theme;
    const displays = state.brightness?.displays ?? [];
    const controlled = displays.flatMap((display) => (display.brightness === null ? [] : [{ ...display, brightness: display.brightness }]));
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" height={rowHeight + 2 * spacing.item} padding={[0, spacing.item]}>
          <icon key="icon" symbol={displays.length > 1 ? "display.2" : "display"} fontSize={20} width={28} color="bright" />
          <column key="labels" gap={0}>
            <text key="title" style="title">Display</text>
            {controlled.length ? null : <text key="status" fontSize={11} color="dim">FIXED BRIGHTNESS</text>}
          </column>
        </row>
        {controlled.length ? <Divider name="divider" theme={theme} /> : null}
        {controlled.map((display) => (
          <Display display={display} title={controlled.length > 1 ? display.name ?? (display.builtin ? "Built-in display" : "Display") : "Brightness"} spacing={spacing} />
        ))}
        {problem ? <text key="problem" style="bad" fontSize={11} padding={[0, spacing.item]}>{problem}</text> : null}
      </column>
    );
  },

  onAction(action, payload) {
    if (!action.startsWith("brightness:") || typeof payload !== "number") return;
    problem = null;
    return lifted.brightness.set(Math.max(0.01, payload), action.slice(11)).pipe(
      Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))),
    );
  },
} satisfies Gary.Menu;
