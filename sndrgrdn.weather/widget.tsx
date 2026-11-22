import { Effect, Schedule, Schema, Stream, fetch, host, settings, topic } from "gary:effect";

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
const Forecast = Schema.fromJsonString(
  Schema.Struct({ current: Schema.Struct({ temperature_2m: Schema.Number, weather_code: Schema.Number }) }),
);
const latitude = Number(settings.latitude ?? 53.2);
const longitude = Number(settings.longitude ?? 5.8);
const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
let weather: Weather | null = null;

const refresh = Effect.gen(function* () {
  const response = yield* fetch(url);
  if (response.status !== 200) {
    return yield* host.log(`weather request failed with status ${response.status}: ${response.text.trim()}`);
  }
  const { current } = yield* Schema.decodeUnknownEffect(Forecast)(response.text);
  weather = {
    temperature: Math.round(current.temperature_2m) + "°C",
    icon: icons.find(([codes]) => codes.includes(current.weather_code))?.[1] ?? "cloud",
  };
}).pipe(Effect.catch((error) => host.log(`weather request failed: ${error.message}`)));

export default {
  effect: Effect.gen(function* () {
    yield* Effect.forkScoped(Effect.repeat(refresh, Schedule.spaced("15 minutes")));
    yield* topic("session").pipe(
      Stream.map((session) => session.locked),
      Stream.changes,
      Stream.drop(1),
      Stream.filter((locked) => !locked),
      Stream.runForEach(() => Effect.delay(refresh, "10 seconds")),
    );
  }),

  render() {
    return (
      <row gap={8}>
        <image key="icon" path={`icons/${weather?.icon ?? "cloud"}.png`} width={19} height={18} y={-1} />
        <text key="temperature" color={weather ? "foreground" : "dark_foreground"}>{weather?.temperature ?? "--°C"}</text>
      </row>
    );
  },
} satisfies Gary.BarWidget;
