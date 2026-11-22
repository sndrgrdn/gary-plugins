import { Effect, Schedule, Schema, Stream, fetch, host, settings, topic } from "gary:effect";
import type { Topic } from "./topic";

const conditions: [number[], string, string][] = [
  [[95, 96, 99], "cloud.bolt.rain", "Thunderstorm"],
  [[56, 57, 66, 67], "cloud.sleet", "Sleet"],
  [[71, 73, 75, 77, 85, 86], "cloud.snow", "Snow"],
  [[51, 53, 55, 61, 63, 65, 80, 81, 82], "cloud.rain", "Rain"],
  [[45, 48], "cloud.fog", "Fog"],
  [[1, 2], "cloud.sun", "Partly cloudy"],
  [[3], "cloud", "Overcast"],
  [[0], "sun.max", "Clear"],
];
const Forecast = Schema.fromJsonString(
  Schema.Struct({
    current: Schema.Struct({ temperature_2m: Schema.Number, weather_code: Schema.Number }),
    hourly: Schema.Struct({ time: Schema.Array(Schema.String), temperature_2m: Schema.Array(Schema.Number) }),
  }),
);
const latitude = Number(settings.latitude ?? 53.2);
const longitude = Number(settings.longitude ?? 5.8);
const place = String(settings.place ?? (settings.latitude === undefined ? "Leeuwarden" : `${latitude}, ${longitude}`));
const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&hourly=temperature_2m&forecast_hours=13&timezone=auto`;
let weather: Topic | null = null;

class RequestFailed extends Schema.TaggedError<RequestFailed>()("RequestFailed", { status: Schema.Number, message: Schema.String }) {}

const request = Effect.fn("Weather.request")(function* () {
  const response = yield* fetch(url);
  if (response.status !== 200) {
    return yield* new RequestFailed({ status: response.status, message: `status ${response.status}: ${response.text.trim()}` });
  }
  return yield* Schema.decodeUnknownEffect(Forecast)(response.text);
});

const refresh = Effect.gen(function* () {
  const { current, hourly } = yield* request().pipe(
    Effect.tapError((error) => host.log(`weather request failed: ${error.message}`)),
    Effect.retry({
      schedule: Schedule.exponential("10 seconds").pipe(Schedule.jittered, Schedule.upTo({ times: 5 })),
      while: (error) => error._tag === "HostError" || (error._tag === "RequestFailed" && (error.status === 429 || error.status >= 500)),
    }),
  );
  const [, icon, condition] = conditions.find(([codes]) => codes.includes(current.weather_code)) ?? [[], "cloud", "Unknown"];
  weather = {
    place,
    temperature: Math.round(current.temperature_2m),
    icon,
    condition,
    hours: hourly.time.map((time, index) => ({ hour: time.slice(11, 13), temperature: hourly.temperature_2m[index] })),
  };
  yield* host.publish(weather);
}).pipe(Effect.ignore);

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
      <row gap={8} action="forecast">
        <image key="icon" path={`icons/${weather?.icon ?? "cloud"}.png`} width={19} height={18} y={-1} />
        <text key="temperature" color={weather ? "foreground" : "dark_foreground"}>{weather ? `${weather.temperature}°C` : "--°C"}</text>
      </row>
    );
  },

  onAction() {
    Effect.runSync(host.toggle());
  },
} satisfies Gary.BarWidget;
