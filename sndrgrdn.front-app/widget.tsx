const exact = new Map<string, string>();
const prefixes: [string, string][] = [];
let fallback = "";

for (const line of host.readFile("app_icons.tsv").split("\n")) {
  const [icon, app] = line.split("\t");
  if (!icon) continue;
  if (!app) fallback = icon;
  else if (app.endsWith("*")) prefixes.push([app.slice(0, -1), icon]);
  else if (!exact.has(app)) exact.set(app, icon);
}

function icon(app: string) {
  return exact.get(app) ?? prefixes.find(([prefix]) => app.startsWith(prefix))?.[1] ?? fallback;
}

export default {
  render(state) {
    const app = state["sndrgrdn.dinky"]?.app;
    if (!app) return <row />;
    return (
      <row gap={4} padding={[0, 0, 0, state.theme.spacing.item]} opacity={0.85}>
        <text key="icon" font="app-icon" color="foreground" width={20} align="center">{icon(app)}</text>
        <text key="name" color="foreground">{app}</text>
      </row>
    );
  },
} satisfies Gary.BarWidget;
