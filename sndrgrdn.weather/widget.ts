type Weather = { icon: string; temperature: string };

const icons: [RegExp, string][] = [
  [/thunder|lightning/, "cloud.bolt.rain"],
  [/sleet|freez|hail|ice/, "cloud.sleet"],
  [/snow|blizzard|flurr/, "cloud.snow"],
  [/rain|drizzle|shower/, "cloud.rain"],
  [/fog|mist|haze/, "cloud.fog"],
  [/partly/, "cloud.sun"],
  [/cloud|overcast/, "cloud"],
  [/clear|sunny/, "sun.max"],
];
const interval = 15 * 60_000;
let weather: Weather | null = null;
let attempted = 0;
let locked = false;

function parse(output: string): Weather | null {
  const match = output.replace(/−/g, "-").match(/^\s*([+-]?\d+(?:[.,]\d+)?)\s*°\s*C\s+and\s+(.*\S)\s*$/i);
  if (!match) return null;
  const condition = match[2].toLowerCase();
  return { temperature: match[1] + "°C", icon: icons.find(([pattern]) => pattern.test(condition))?.[1] ?? "cloud" };
}

function refresh() {
  attempted = Date.now();
  host.exec(["timeout", "30", "shortcuts", "run", "Current Weather", "--output-type", "public.plain-text"], (result) => {
    const parsed = result.status === 0 ? parse(result.stdout) : null;
    if (parsed) weather = parsed;
    else host.log("Current Weather failed: " + (result.stderr.trim() || result.stdout.trim()));
  });
}

refresh();

module.exports = {
  onTopic(topic, _value, state) {
    if (topic === "session") {
      if (locked && !state.session?.locked) setTimeout(refresh, 10_000);
      locked = state.session?.locked ?? false;
    } else if (Date.now() - attempted >= interval) {
      refresh();
    }
  },

  render() {
    return {
      type: "row",
      gap: 8,
      children: [
        { type: "image", key: "icon", path: "icons/" + (weather?.icon ?? "cloud") + ".png", width: 19, height: 18, offset: -1 },
        { type: "text", key: "temperature", text: weather?.temperature ?? "--°C", color: weather ? "foreground" : "dark_foreground" },
      ],
    };
  },
} satisfies Gary.BarWidget;
