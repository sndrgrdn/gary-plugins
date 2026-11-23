import { Effect, Stream, host, settings } from "gary:effect";

const trigger = typeof settings.key === "string" ? settings.key : "alt+space";
const menu = (method: string) => host.call({ kind: "menu" }, method);

export default {
  effect: host.hotkeys([trigger]).pipe(
    Stream.runForEach(() => menu("open")),
    Effect.catchTag("HostError", (error) => host.log(`opening the launcher with ${trigger} failed: ${error.message}`)),
  ),
  methods: {
    open: () => menu("open"),
    state: () => menu("state"),
  },
} satisfies Gary.Service;
