import type { Entry } from "./topic";

type Spacing = Gary.Theme["spacing"];

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

function Preview({ entry }: { entry: Entry }) {
  if ("image" in entry) return <image key="image" path={entry.image} width={48} height={24} fit="fill" radius={4} clip />;
  const text = "text" in entry ? entry.text.replace(/\s+/g, " ").trim() : entry.files.map((path) => path.slice(path.lastIndexOf("/") + 1)).join(", ");
  return (
    <row key="text">
      {"files" in entry && <icon key="icon" symbol="doc" style="dim" />}
      <text key="text" lines={1}>{text}</text>
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

function row(entry: Entry, index: number, spacing: Spacing) {
  return (
    <row
      key={String(entry.copied)}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={6}
      style={index === selected ? "selected" : undefined}
      hovered={{ background: "hover" }}
      action={`paste:${index}`}
      rightAction={`remove:${index}`}
    >
      <Preview entry={entry} />
      <spacer key="gap" />
      <text key="age" style="dim">{age(entry.copied)}</text>
    </row>
  );
}

export default {
  surface: { anchors: { top: true }, margins: { top: 8 } },

  onTopic({ topic, value }) {
    if (topic !== "sndrgrdn.clipboard") return;
    entries = value;
    selected = Math.max(0, Math.min(selected, entries.length - 1));
  },

  render(state) {
    const { spacing } = state.theme;
    return (
      <column width={width} padding={spacing.item}>
        <row key="header" height={rowHeight} padding={[0, spacing.item]}>
          <text key="title" style="dim" fontSize={15}>Clipboard</text>
          <spacer key="gap" />
          <text key="hotkey" style="dim">⌘⇧V</text>
        </row>
        <row key="divider" height={1} background="border" />
        {entries.length ? (
          <scroll key="entries" height={visibleRows * rowHeight} reveal={String(entries[selected]?.copied)}>
            <column key="rows" gap={0}>{entries.map((entry, index) => row(entry, index, spacing))}</column>
          </scroll>
        ) : (
          <text key="empty" style="dim" height={rowHeight} padding={[0, spacing.item]}>Nothing copied yet</text>
        )}
      </column>
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

  onAction(action) {
    const [verb, index] = action.split(":");
    if (verb === "paste") paste(Number(index));
    else if (verb === "remove") remove(Number(index));
  },
} satisfies Gary.Menu;
