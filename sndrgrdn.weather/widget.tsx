import { Effect, Schedule, Schema, Stream, fetch, host, settings, topic } from "gary:effect";
import type { Topic } from "./topic";

const conditions: [number[], string][] = [
  [[95, 96, 99], "Thunderstorm"],
  [[56, 57, 66, 67], "Sleet"],
  [[71, 73, 75, 77, 85, 86], "Snow"],
  [[51, 53, 55, 61, 63, 65, 80, 81, 82], "Rain"],
  [[45, 48], "Fog"],
  [[1, 2], "Partly cloudy"],
  [[3], "Overcast"],
  [[0], "Clear"],
];
const glyphs: [number[], string, string][] = [
  [[0], "\u{E30D}", "\u{E32B}"],
  [[1, 2], "\u{E302}", "\u{E32E}"],
  [[45, 48], "\u{E313}", "\u{E346}"],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], "\u{E318}", "\u{E318}"],
  [[71, 73, 75, 77, 85, 86], "\u{E31A}", "\u{E31A}"],
  [[95, 96, 99], "\u{E31D}", "\u{E31D}"],
];
const Forecast = Schema.fromJsonString(
  Schema.Struct({
    current: Schema.Struct({ temperature_2m: Schema.Number, weather_code: Schema.Number, is_day: Schema.Number }),
    hourly: Schema.Struct({ time: Schema.Array(Schema.String), temperature_2m: Schema.Array(Schema.Number) }),
  }),
);
const latitude = Number(settings.latitude ?? 53.2);
const longitude = Number(settings.longitude ?? 5.8);
const place = String(settings.place ?? (settings.latitude === undefined ? "Leeuwarden" : `${latitude}, ${longitude}`));
const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m&forecast_hours=13&timezone=auto`;
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
  const [, condition] = conditions.find(([codes]) => codes.includes(current.weather_code)) ?? [[], "Unknown"];
  const [, day, night] = glyphs.find(([codes]) => codes.includes(current.weather_code)) ?? [[], "\u{E33D}", "\u{E33D}"];
  weather = {
    place,
    temperature: Math.round(current.temperature_2m),
    glyph: current.is_day ? day : night,
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
      <row gap={4} action="forecast">
        <text key="glyph" fontSize={13} width={20} align="center" color="foreground">{weather?.glyph ?? "\u{E33D}"}</text>
        <text key="temperature" minWidth={36} color={weather ? "foreground" : "dim"}>{weather ? `${weather.temperature}°C` : "--°C"}</text>
      </row>
    );
  },

  onAction() {
    return host.toggle();
  },
} satisfies Gary.BarWidget;
