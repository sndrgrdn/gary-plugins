type Dinky = { app: string | null };

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
    const app = (state["sndrgrdn.dinky"] as Dinky | undefined)?.app;
    if (!app) return { type: "row" };
    return {
      type: "row",
      gap: 8,
      padding: [0, 0, 0, 5],
      children: [
        { type: "text", key: "icon", text: icon(app), font: "app-icon", color: "accent", width: 14 },
        { type: "text", key: "name", text: app, color: "foreground" },
      ],
    };
  },
} satisfies Gary.BarWidget;
