import { Effect, Schema, host, settings } from "gary:effect";

const Settings = Schema.Struct({
  key: Schema.optional(Schema.String),
  shift: Schema.optional(Schema.Boolean),
  tap: Schema.optional(Schema.String),
});

export default {
  effect: Effect.flatMap(Schema.decodeUnknownEffect(Settings)(settings), host.hyperkey),
} satisfies Gary.Service;
