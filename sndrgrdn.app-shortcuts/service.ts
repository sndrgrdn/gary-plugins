import { Effect, Schema, Stream, host, settings } from "gary:effect";

const Settings = Schema.Struct({ shortcuts: Schema.Record(Schema.String, Schema.String) });

export default {
  effect: Effect.gen(function* () {
    const { shortcuts } = yield* Schema.decodeUnknownEffect(Settings)(settings);
    const open = (keys: string) =>
      host.apps.activate(shortcuts[keys]).pipe(Effect.catchTag("HostError", (error) => host.log(`${keys}: ${error.message}`)));
    yield* host.hotkeys(Object.keys(shortcuts)).pipe(Stream.mapEffect(open, { concurrency: "unbounded" }), Stream.runDrain);
  }),
} satisfies Gary.Service;
