import type { Entry } from "./topic";

const width = 440;
const previewLength = 56;
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

function preview(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > previewLength ? line.slice(0, previewLength - 1) + "…" : line;
}

function paste(index: number) {
  const entry = entries[index];
  if (!entry) return;
  host.call("paste", entry.text).catch((error) => host.log(`paste failed: ${error}`));
  host.hide();
}

function remove(index: number) {
  const entry = entries[index];
  if (!entry) return;
  host.call("remove", entry.text).catch((error) => host.log(`remove failed: ${error}`));
}

function row(entry: Entry, index: number) {
  return (
    <row
      key={String(entry.copied)}
      gap={8}
      padding={[6, 8]}
      radius={6}
      clip
      style={index === selected ? "selected" : undefined}
      hovered={{ background: "hover" }}
      action={`paste:${index}`}
      rightAction={`remove:${index}`}
    >
      <text key="text" width={width - 76}>{preview(entry.text)}</text>
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

  render() {
    return (
      <column width={width} gap={6} padding={8}>
        <row key="header" padding={[2, 8, 0, 8]}>
          <text key="title" style="dim">Clipboard</text>
          <spacer key="gap" />
          <text key="hotkey" style="dim">⌘⇧V</text>
        </row>
        {entries.length ? (
          <scroll key="entries" height={300} reveal={String(entries[selected]?.copied)}>
            <column key="rows" gap={2}>{entries.map(row)}</column>
          </scroll>
        ) : (
          <text key="empty" style="dim" padding={[6, 8]}>Nothing copied yet</text>
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
