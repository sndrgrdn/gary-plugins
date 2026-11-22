type Weather = { icon: string; temperature: string };

const icons: [number[], string][] = [
  [[95, 96, 99], "cloud.bolt.rain"],
  [[56, 57, 66, 67], "cloud.sleet"],
  [[71, 73, 75, 77, 85, 86], "cloud.snow"],
  [[51, 53, 55, 61, 63, 65, 80, 81, 82], "cloud.rain"],
  [[45, 48], "cloud.fog"],
  [[1, 2], "cloud.sun"],
  [[3], "cloud"],
  [[0], "sun.max"],
];
const interval = 15 * 60_000;
let weather: Weather | null = null;
let attempted = 0;
let locked = false;

function parse(output: string): Weather | null {
  try {
    const current = JSON.parse(output)?.current;
    if (typeof current?.temperature_2m !== "number" || typeof current?.weather_code !== "number") return null;
    return {
      temperature: Math.round(current.temperature_2m) + "°C",
      icon: icons.find(([codes]) => codes.includes(current.weather_code))?.[1] ?? "cloud",
    };
  } catch {
    return null;
  }
}

function refresh(state?: Gary.State) {
  attempted = Date.now();
  const latitude = Number(state?.settings.latitude ?? 53.2);
  const longitude = Number(state?.settings.longitude ?? 5.8);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
  fetch(url)
    .then((response) => {
      const parsed = response.status === 200 ? parse(response.text) : null;
      if (parsed) weather = parsed;
      else host.log(`weather request failed with status ${response.status}: ${response.text.trim()}`);
    })
    .catch((error) => host.log("weather request failed: " + String(error)));
}

export default {
  onTopic({ topic, value }, state) {
    if (topic === "session") {
      if (locked && !value.locked) setTimeout(() => refresh(state), 10_000);
      locked = value.locked;
    } else if (Date.now() - attempted >= interval) {
      refresh(state);
    }
  },

  render() {
    return (
      <row gap={8}>
        <image key="icon" path={`icons/${weather?.icon ?? "cloud"}.png`} width={19} height={18} offset={-1} />
        <text key="temperature" color={weather ? "foreground" : "dark_foreground"}>{weather?.temperature ?? "--°C"}</text>
      </row>
    );
  },
} satisfies Gary.BarWidget;
