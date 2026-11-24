import type { Entry } from "./topic";

type Theme = Gary.Theme;

const width = 440;
const rowHeight = 32;
const visibleRows = 9;
const opened = Date.now();

let entries: Entry[] = [];
let selected = 0;

function age(copied: number) {
  const minutes = Math.floor((opened - copied) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

function rowRadius({ radius, spacing }: Theme) {
  return Math.max(0, radius.surface - spacing.item);
}

function Preview({ entry, chosen, theme }: { entry: Entry; chosen: boolean; theme: Theme }) {
  if ("image" in entry) return <image key="image" path={entry.image} width={48} height={24} fit="fill" radius={rowRadius(theme)} clip />;
  const text = "text" in entry ? entry.text.replace(/\s+/g, " ").trim() : entry.files.map((path) => path.slice(path.lastIndexOf("/") + 1)).join(", ");
  return (
    <row key="text">
      {"files" in entry && <text key="icon" font="icon" fontSize={15} y={0.5} color={chosen ? "accent" : "dim"}>{"\u{F0224}"}</text>}
      <text key="text" lines={1} color={chosen ? "accent" : "foreground"}>{text}</text>
    </row>
  );
}

function paste(index: number) {
  const entry = entries[index];
  if (!entry) return;
  host.call("paste", String(entry.copied)).catch((error) => host.log(`paste failed: ${error}`));
  host.hide();
}

function remove(index: number) {
  const entry = entries[index];
  if (!entry) return;
  host.call("remove", String(entry.copied)).catch((error) => host.log(`remove failed: ${error}`));
}

function row(entry: Entry, index: number, theme: Theme) {
  const chosen = index === selected;
  return (
    <row
      key={String(entry.copied)}
      height={rowHeight}
      padding={[0, theme.spacing.item]}
      radius={rowRadius(theme)}
      style={chosen ? "highlight" : undefined}
      action={`paste:${index}`}
      rightAction={`remove:${index}`}
      hoverAction={`hover:${index}`}
    >
      <Preview entry={entry} chosen={chosen} theme={theme} />
      <spacer key="gap" />
      <text key="age" style="dim">{age(entry.copied)}</text>
    </row>
  );
}

export default {
  surface: { anchors: { top: true, bottom: true, left: true, right: true }, exclusionMode: "ignore", background: "backdrop" },

  onTopic({ topic, value }) {
    if (topic !== "sndrgrdn.clipboard") return;
    entries = value;
    selected = Math.max(0, Math.min(selected, entries.length - 1));
  },

  render(state) {
    const { spacing } = state.theme;
    const screen = { width: state.display?.width ?? 1728, height: state.display?.height ?? 1117 };
    const listHeight = Math.min(Math.max(entries.length, 1), visibleRows) * rowHeight;
    const height = 3 * spacing.item + rowHeight + listHeight;
    return (
      <stack key="backdrop" width={screen.width} height={screen.height}>
        <row key="scrim" width={screen.width} height={screen.height} background="scrim" action="close" />
        <column
          key="card"
          x={(screen.width - width) / 2}
          y={Math.round((screen.height - height) / 2)}
          width={width}
          height={height}
          gap={0}
          padding={spacing.item}
          style="picker"
        >
          <row key="header" height={rowHeight} padding={[0, spacing.item]}>
            <text key="title" style="dim" fontSize={15}>Clipboard</text>
            <spacer key="gap" />
            <text key="hotkey" style="dim">⌘⇧V</text>
          </row>
          <row key="divider" height={0}>
            <row key="line" height={1} width={width - 2 * spacing.item} background="border" />
          </row>
          <column key="list" height={listHeight + spacing.item} padding={[spacing.item, 0, 0, 0]}>
            {entries.length ? (
              <scroll key="entries" height={listHeight} reveal={String(entries[selected]?.copied)}>
                <column key="rows" gap={0}>{entries.map((entry, index) => row(entry, index, state.theme))}</column>
              </scroll>
            ) : (
              <text key="empty" style="dim" height={rowHeight} padding={[0, spacing.item]}>Nothing copied yet</text>
            )}
          </column>
        </column>
      </stack>
    );
  },

  onKey(key) {
    if (key === "up") selected = Math.max(0, selected - 1);
    else if (key === "down") selected = Math.max(0, Math.min(entries.length - 1, selected + 1));
    else if (key === "enter") paste(selected);
    else if (key === "backspace" || key === "delete") remove(selected);
    else return false;
    return true;
  },

  onAction(action, payload) {
    const [verb, index] = action.split(":");
    if (verb === "close") host.hide();
    else if (verb === "hover" && payload === true) selected = Number(index);
    else if (verb === "paste") paste(Number(index));
    else if (verb === "remove") remove(Number(index));
  },
} satisfies Gary.Menu;
