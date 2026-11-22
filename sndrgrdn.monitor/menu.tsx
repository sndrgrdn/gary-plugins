import { Effect, host as lifted } from "gary:effect";

type Spacing = Gary.Theme["spacing"];
type Controlled = Gary.BrightnessDisplay & { brightness: number };

const width = 320;
const rowHeight = 32;
const names: [number, string][] = [[95, "Sun blast"], [80, "Solar flare"], [65, "Golden hour"], [45, "Even day"], [30, "Soft glow"], [20, "Lamp light"], [10, "Candlelit"]];

let problem: string | null = null;

function mood(display: Controlled | undefined) {
  if (!display) return "Fixed brightness";
  const percent = Math.round(display.brightness * 100);
  return names.find(([floor]) => percent >= floor)?.[1] ?? "Night owl";
}

function Display({ display, title, spacing }: { display: Controlled; title: string; spacing: Spacing }) {
  return (
    <column key={display.id} gap={0}>
      <row key="header" height={24} padding={[0, spacing.item]} width={width - 2 * spacing.item}>
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
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 6, right: 8 } },

  render(state) {
    const { spacing } = state.theme;
    const displays = state.brightness?.displays ?? [];
    const controlled = displays.flatMap((display) => (display.brightness === null ? [] : [{ ...display, brightness: display.brightness }]));
    const main = controlled.find((display) => display.builtin) ?? controlled[0];
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" padding={spacing.item}>
          <icon key="icon" symbol={displays.length > 1 ? "display.2" : "display"} fontSize={20} width={28} color="bright" />
          <column key="labels" gap={2}>
            <text key="title" style="title">Display</text>
            <text key="status" fontSize={11} color="dim">{mood(main).toUpperCase()}</text>
          </column>
        </row>
        {controlled.length ? <row key="divider" height={1} width={width - 2 * spacing.item} background="border" /> : null}
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
