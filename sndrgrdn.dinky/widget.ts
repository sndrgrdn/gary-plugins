type Workspace = { number: number; focused: boolean; empty: boolean; layout: string };
type Dinky = { displays: { uuid: string; workspaces: Workspace[] }[]; app: string | null };

function label(workspace: Workspace): Gary.Node {
  const glyph = workspace.layout === "scrolling" ? "󰝥" : "󱓻";
  return {
    type: "text",
    key: String(workspace.number),
    action: String(workspace.number),
    text: workspace.focused ? glyph : workspace.number,
    color: !workspace.focused && workspace.empty ? "alpha(foreground, 0.5)" : "foreground",
    width: 20,
    align: "center",
  };
}

module.exports = {
  render(state) {
    const dinky = state["sndrgrdn.dinky"] as Dinky | undefined;
    const workspaces = dinky?.displays.find((display) => display.uuid === state.display?.id)?.workspaces ?? [];
    return { type: "row", gap: 1, children: workspaces.map(label) };
  },

  onAction(action) {
    host.exec(["dinky", "workspace", action], () => {});
  },
} satisfies Gary.BarWidget;
