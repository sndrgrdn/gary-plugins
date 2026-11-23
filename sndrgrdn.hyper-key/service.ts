import { Effect, Schema, host, settings } from "gary:effect";

const Settings = Schema.Struct({ shift: Schema.optional(Schema.Boolean) });

export default {
  effect: Effect.flatMap(Schema.decodeUnknownEffect(Settings)(settings), ({ shift = false }) => host.hyperkey({ shift })),
} satisfies Gary.Service;
