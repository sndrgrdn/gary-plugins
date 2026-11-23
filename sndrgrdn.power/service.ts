import { Effect, host } from "gary:effect";

const threshold = 10;

const low = (battery: Gary.Battery) =>
  battery.present && battery.percent !== null && battery.source === "battery" && !battery.charging && battery.percent <= threshold;

const check = Effect.fn("Power.check")(function* (battery: Gary.Battery) {
  const warned = (yield* host.storage.get("warnedLowBattery")) === true;
  const now = low(battery);
  if (now !== warned) yield* host.storage.set("warnedLowBattery", now);
  if (now && !warned) yield* host.notify.post({ title: "Time to recharge!", body: `Battery is down to ${battery.percent}%`, sound: true });
});

export default {
  onTopic({ topic, value }) {
    if (topic !== "battery") return;
    return check(value).pipe(Effect.catchTag("HostError", (error) => host.log(error.message)));
  },
} satisfies Gary.Service;
