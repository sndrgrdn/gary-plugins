import { Effect, host } from "gary:effect";
import type { Workspace } from "./topic";

function label(workspace: Workspace): Gary.Node {
  const glyph = workspace.layout === "scrolling" ? "󰝥" : "󱓻";
  return (
    <text
      key={String(workspace.number)}
      action={String(workspace.number)}
      color={!workspace.focused && workspace.empty ? "alpha(foreground, 0.5)" : "foreground"}
      width={20}
      align="center"
    >
      {workspace.focused ? glyph : workspace.number}
    </text>
  );
}

export default {
  render(state) {
    const workspaces = state["sndrgrdn.dinky"]?.displays.find((display) => display.uuid === state.display?.id)?.workspaces ?? [];
    return <row gap={0}>{workspaces.map(label)}</row>;
  },

  onAction(action) {
    Effect.runFork(host.exec(["dinky", "workspace", action]));
  },
} satisfies Gary.BarWidget;
