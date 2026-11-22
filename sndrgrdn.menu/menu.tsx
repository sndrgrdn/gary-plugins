import { Effect, host } from "gary:effect";
import type { Command } from "./service";
import type { Topic } from "./topic";

type Leaf = { label: string; icon: string; command: Command; confirm?: string; stay?: boolean };
type Branch = { label: string; icon: string; rows: (status: Topic) => Row[] };
type Row = Leaf | Branch;
type Spacing = Gary.Theme["spacing"];

const width = 280;
const rowHeight = 32;
const idle: Topic = { recording: false, awake: false };

const screenshot: Branch = {
  label: "Screenshot",
  icon: "camera.viewfinder",
  rows: () => [
    { label: "Region or Window", icon: "rectangle.dashed", command: "screenshot-region" },
    { label: "Display", icon: "display", command: "screenshot-display" },
  ],
};

const record: Branch = {
  label: "Record",
  icon: "record.circle",
  rows: () => [
    { label: "Region or Window", icon: "rectangle.dashed", command: "record-region" },
    { label: "Display", icon: "display", command: "record-display" },
    { label: "Display with Audio", icon: "speaker.wave.2", command: "record-display-audio" },
  ],
};

const root: Branch = {
  label: "Go",
  icon: "",
  rows: () => [
    {
      label: "Capture",
      icon: "camera",
      rows: (status) => [
        screenshot,
        status.recording ? { label: "Stop Recording", icon: "stop.circle", command: "record-stop" } : record,
        { label: "Text", icon: "text.viewfinder", command: "text" },
        { label: "QR Code", icon: "qrcode.viewfinder", command: "qr" },
        { label: "Color", icon: "eyedropper", command: "color" },
      ],
    },
    {
      label: "Style",
      icon: "paintpalette",
      rows: () => [
        { label: "Theme", icon: "swatchpalette", command: "theme" },
        { label: "Next Background", icon: "photo", command: "background-next", stay: true },
        { label: "Previous Background", icon: "photo.stack", command: "background-previous", stay: true },
      ],
    },
    {
      label: "Toggle",
      icon: "switch.2",
      rows: (status) => [
        status.awake
          ? { label: "Allow Sleep", icon: "cup.and.saucer.fill", command: "awake" }
          : { label: "Stay Awake", icon: "cup.and.saucer", command: "awake" },
      ],
    },
    {
      label: "System",
      icon: "power",
      rows: () => [
        { label: "Lock", icon: "lock", command: "lock" },
        { label: "Sleep", icon: "moon", command: "sleep" },
        { label: "Log Out", icon: "rectangle.portrait.and.arrow.right", command: "log-out", confirm: "Log out now?" },
        { label: "Restart", icon: "arrow.clockwise", command: "restart", confirm: "Restart this Mac?" },
        { label: "Shut Down", icon: "power", command: "shut-down", confirm: "Shut down this Mac?" },
      ],
    },
  ],
};

const trail: { branch: Branch; at: number }[] = [{ branch: root, at: 0 }];
let confirming: { leaf: Leaf; confirm: boolean } | null = null;

function level() {
  return trail[trail.length - 1];
}

function rows(state: Gary.State) {
  return level().branch.rows(state["sndrgrdn.menu"] ?? idle);
}

function move(count: number, step: number) {
  level().at = (level().at + step + count) % count;
}

function back() {
  if (trail.length > 1) trail.pop();
}

function run(leaf: Leaf) {
  confirming = null;
  return host.call("run", leaf.command).pipe(
    Effect.andThen(leaf.stay ? Effect.void : host.hide()),
    Effect.catchTag("HostError", (error) => host.log(`${leaf.command} failed: ${error.message}`)),
  );
}

function activate(row: Row | undefined) {
  if (!row) return;
  if ("rows" in row) trail.push({ branch: row, at: 0 });
  else if (row.confirm) confirming = { leaf: row, confirm: true };
  else return run(row);
}

function answer(confirm: boolean) {
  const leaf = confirming?.leaf;
  confirming = null;
  if (confirm && leaf) return run(leaf);
}

function Item({ row, index, chosen, spacing }: { row: Row; index: number; chosen: boolean; spacing: Spacing }) {
  return (
    <row
      key={row.label}
      height={rowHeight}
      padding={[0, spacing.item]}
      radius={6}
      style={chosen ? "selected" : undefined}
      hovered={chosen ? undefined : { background: "hover" }}
      action={`row:${index}`}
    >
      <icon symbol={row.icon} width={18} style={chosen ? "bright" : "dim"} />
      <text style={chosen ? "bright" : undefined}>{row.label}</text>
      <spacer />
      {"rows" in row && <icon symbol="chevron.right" fontSize={11} style="dim" />}
    </row>
  );
}

function Choice({ label, action, chosen, color, width }: { label: string; action: string; chosen: boolean; color: Gary.Color; width: number }) {
  return (
    <row
      key={action}
      width={width}
      height={rowHeight}
      radius={6}
      align="center"
      border={{ color: chosen ? color : "border" }}
      background={chosen ? `alpha(${color}, 0.25)` : undefined}
      hovered={{ background: "hover" }}
      action={action}
    >
      <text color={chosen ? "bright" : "foreground"} font={chosen ? "strong" : undefined}>{label}</text>
    </row>
  );
}

function body(state: Gary.State): Gary.Node {
  const { spacing } = state.theme;
  if (confirming) {
    const choice = (width - 5 * spacing.item) / 2;
    return (
      <column key="confirm" gap={spacing.section} padding={[0, spacing.item, spacing.item, spacing.item]}>
        <text key="message">{confirming.leaf.confirm ?? ""}</text>
        <row key="choices">
          <Choice label="Cancel" action="cancel" chosen={!confirming.confirm} color="accent" width={choice} />
          <Choice label={confirming.leaf.label} action="confirm" chosen={confirming.confirm} color="bad" width={choice} />
        </row>
      </column>
    );
  }
  const at = level().at;
  return (
    <column key={`rows:${trail.length}`} gap={0}>
      {rows(state).map((row, index) => <Item row={row} index={index} chosen={index === at} spacing={spacing} />)}
    </column>
  );
}

export default {
  surface: { attach: true, anchors: { top: true, left: true }, margins: { top: 6, left: 20 } },

  render(state) {
    const title = confirming ? confirming.leaf.label : level().branch.label;
    const { spacing } = state.theme;
    return (
      <column key="menu" width={width} padding={spacing.item}>
        <row key="header" height={rowHeight} padding={[0, spacing.item]}>
          {(trail.length > 1 || confirming) && <icon key="back" symbol="chevron.left" style="dim" action="back" />}
          <text key="title" style="dim" fontSize={15}>{`${title}…`}</text>
        </row>
        <row key="divider" height={1} background="border" />
        {body(state)}
      </column>
    );
  },

  onKey(key, state) {
    if (confirming) {
      if (key === "left" || key === "right" || key === "tab" || key === "shift+tab") confirming.confirm = !confirming.confirm;
      else if (key === "enter") return answer(confirming.confirm) ?? true;
      else if (key === "escape" || key === "backspace") confirming = null;
      else return false;
      return true;
    }
    const list = rows(state);
    if (key === "down" || key === "tab") move(list.length, 1);
    else if (key === "up" || key === "shift+tab") move(list.length, -1);
    else if (key === "home") level().at = 0;
    else if (key === "end") level().at = list.length - 1;
    else if (key === "enter" || key === "right") return activate(list[level().at]) ?? true;
    else if (key === "left" || key === "backspace") back();
    else return false;
    return true;
  },

  onAction(action, _payload, state) {
    if (action === "back") {
      if (confirming) confirming = null;
      else back();
    } else if (action === "confirm" || action === "cancel") {
      return answer(action === "confirm");
    } else if (action.startsWith("row:")) {
      level().at = Number(action.slice(4));
      return activate(rows(state)[level().at]);
    }
  },
} satisfies Gary.Menu;
