import { Effect, Schedule, host as lifted } from "gary:effect";

type Spacing = Gary.Theme["spacing"];
type Details = { health: number | null; cycles: number | null; toFull: number | null; toEmpty: number | null; watts: number | null };

const width = 320;
const gigabyte = 1024 ** 3;
const phrases = {
  charging: ["Pumping power", "Injecting electrons", "Pouring juice", "Amassing watts", "Hoarding joules", "Sucking volts", "Topping reserves", "Soaking amps", "Inhaling kilowatts"],
  draining: ["Slurping power", "Spending joules", "Draining watts", "Burning electrons", "Sipping juice", "Spending coulombs", "Bleeding amps", "Guzzling volts", "Munching reserves"],
};

let details: Details | null = null;
let phrase = 0;

function field(report: string, key: string) {
  return new RegExp(`"${key}"\\s*=\\s*(\\d+)`).exec(report)?.[1] ?? null;
}

function parse(report: string): Details {
  const number = (key: string) => {
    const value = field(report, key);
    return value === null ? null : Number(value);
  };
  const minutes = (key: string) => {
    const value = number(key);
    return value === null || value >= 65535 ? null : value;
  };
  const [raw, design, volts] = [number("AppleRawMaxCapacity"), number("DesignCapacity"), number("Voltage")];
  const amperage = field(report, "InstantAmperage");
  const milliamps = amperage === null ? null : Number(BigInt.asIntN(64, BigInt(amperage)));
  return {
    health: raw && design ? Math.min(100, Math.round((raw / design) * 100)) : null,
    cycles: number("CycleCount"),
    toFull: minutes("AvgTimeToFull"),
    toEmpty: minutes("AvgTimeToEmpty"),
    watts: volts && milliamps ? Math.abs((volts * milliamps) / 1e6) : null,
  };
}

const refresh = lifted.exec(["/usr/sbin/ioreg", "-rn", "AppleSmartBattery"]).pipe(
  Effect.map((result) => void (details = parse(result.stdout))),
  Effect.catchTag("HostError", (error) => lifted.log(`ioreg failed: ${error.message}`)),
);

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function mode(battery: Gary.Battery) {
  if (battery.source === "battery") return "draining";
  if (battery.charging) return "charging";
  return (battery.percent ?? 0) >= 99 ? "full" : "holding";
}

function status(battery: Gary.Battery) {
  const now = mode(battery);
  if (now === "full") return "Fully charged";
  if (now === "holding") return "On power, not charging";
  return phrases[now][phrase % phrases[now].length];
}

function symbol(battery: Gary.Battery) {
  const percent = battery.percent ?? 0;
  const level = percent >= 88 ? 100 : percent >= 63 ? 75 : percent >= 38 ? 50 : percent >= 13 ? 25 : 0;
  return battery.charging ? "battery.100percent.bolt" : `battery.${level}percent`;
}

function Detail({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <column key={label} gap={0} width={width}>
      <text key="label" fontSize={11} color="dim">{label}</text>
      <text key="value" color="bright">{value}</text>
    </column>
  );
}

function Grid({ name, rows, spacing }: { name: string; rows: [string, string][]; spacing: Spacing }) {
  const cell = (width - 4 * spacing.item - spacing.section) / 2;
  return (
    <grid key={name} columns={2} gap={spacing.item} padding={[0, spacing.item]}>
      {rows.map(([label, value]) => <Detail label={label} value={value} width={cell} />)}
    </grid>
  );
}

function batteryRows(battery: Gary.Battery): [string, string][] {
  const now = mode(battery);
  return [
    ["Health", details?.health == null ? "—" : `${details.health}%`],
    ["Charge cycles", details?.cycles == null ? "—" : String(details.cycles)],
    [now === "charging" ? "Time to full" : "Time left", now === "full" || now === "holding" ? "—" : duration((now === "charging" ? details?.toFull : details?.toEmpty) ?? null)],
    [now === "charging" ? "Charging" : "Discharging", details?.watts ? `${details.watts.toFixed(1)} W` : "—"],
  ];
}

function systemRows(system: Gary.System | undefined): [string, string][] {
  if (!system) return [["CPU", "—"], ["Memory", "—"]];
  const { used, total, pressure } = system.memory;
  return [
    ["CPU", `${Math.round((1 - system.cpu.idle) * 100)}%`],
    ["Memory", `${(used / gigabyte).toFixed(1)} / ${Math.round(total / gigabyte)} GB`],
    ["Memory pressure", pressure[0].toUpperCase() + pressure.slice(1)],
  ];
}

export default {
  surface: { attach: true, anchors: { top: true, right: true }, margins: { top: 6, right: 8 } },

  effect: Effect.all([
    Effect.repeat(Effect.sync(() => void phrase++), Schedule.spaced("2800 millis")),
    Effect.repeat(refresh, Schedule.spaced("5 seconds")),
  ], { concurrency: "unbounded" }),

  render(state) {
    const { spacing } = state.theme;
    const battery = state.battery;
    if (!battery?.present || battery.percent === null) {
      return <text color="dim" padding={spacing.section}>No battery</text>;
    }
    return (
      <column width={width} padding={spacing.item} gap={spacing.item}>
        <row key="hero" padding={spacing.item}>
          <icon key="icon" symbol={symbol(battery)} fontSize={20} width={28} color="bright" />
          <column key="labels" gap={2}>
            <text key="title" style="title">Battery</text>
            <text key="status" fontSize={11} color="dim">{status(battery).toUpperCase()}</text>
          </column>
          <spacer />
          <text key="percent" style="title" fontSize={20}>{battery.percent}%</text>
        </row>
        <row key="level" padding={[0, spacing.item]}>
          <progress value={battery.percent / 100} width={width - 4 * spacing.item} color="foreground" />
        </row>
        <Grid name="battery" rows={batteryRows(battery)} spacing={spacing} />
        <row key="divider" height={1} width={width - 2 * spacing.item} background="border" />
        <text key="system" fontSize={11} font="strong" color="dim" height={24} padding={[0, spacing.item]}>SYSTEM</text>
        <Grid name="stats" rows={systemRows(state.system)} spacing={spacing} />
      </column>
    );
  },
} satisfies Gary.Menu;
