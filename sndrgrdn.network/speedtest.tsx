import { Effect, Stream, host } from "gary:effect";

type Direction = "download" | "upload";

const diameter = 208;
const center = diameter / 2;
const arcWidth = 4;
const arcRadius = center - arcWidth;
const dialStart = 135;
const dialSweep = 270;
const tickCount = 46;
const needleWidth = 4;
const needleTop = 20;
const needleLength = 64;
const dialGap = 48;
const captionHeight = 12;
const titleHeight = 16;
const buttonWidth = 80;
const buttonHeight = 24;
const scrim = "alpha(background, 0.78)";
const stops = [100, 250, 500, 1000, 2500, 5000, 10000];

const directions: Record<Direction, { label: string; flag: string; pattern: RegExp }> = {
  download: { label: "DOWNLOAD", flag: "-u", pattern: /Downlink(?: capacity)?: ([\d.]+) Mbps/ },
  upload: { label: "UPLOAD", flag: "-d", pattern: /Uplink(?: capacity)?: ([\d.]+) Mbps/ },
};


let speeds: Record<Direction, number> = { download: 0, upload: 0 };
let live: Direction | null = "download";
let failed = false;
let fullScale = stops[0];
let sweep: number | null = 0;

function point(degrees: number, radius: number) {
  const angle = (degrees * Math.PI) / 180;
  return `${(center + radius * Math.cos(angle)).toFixed(2)} ${(center + radius * Math.sin(angle)).toFixed(2)}`;
}

function ticks(major: boolean) {
  const [outer, inner] = major ? [95, 87] : [93.5, 88.5];
  return Array.from({ length: tickCount }, (_, index) => index)
    .filter((index) => (index % 5 === 0) === major)
    .map((index) => {
      const degrees = dialStart + (index / (tickCount - 1)) * dialSweep;
      return `M ${point(degrees, outer)} L ${point(degrees, inner)}`;
    })
    .join(" ");
}

const scale = `M ${point(dialStart, arcRadius)} A ${arcRadius} ${arcRadius} 0 1 1 ${point(dialStart + dialSweep, arcRadius)}`;
const majorTicks = ticks(true);
const minorTicks = ticks(false);

function expand(value: number) {
  const stop = stops.find((each) => value <= each * 0.92) ?? stops[stops.length - 1];
  fullScale = Math.max(fullScale, stop);
}

function record(direction: Direction, line: string) {
  const match = directions[direction].pattern.exec(line);
  if (!match) return;
  speeds = { ...speeds, [direction]: Number(match[1]) };
  expand(speeds[direction]);
}

const measure = (direction: Direction) =>
  Effect.suspend(() => {
    live = direction;
    return host.spawn(["script", "-q", "/dev/null", "networkQuality", directions[direction].flag, "-M", "10"]).pipe(
      Stream.runForEach((line) => Effect.sync(() => record(direction, line))),
      Effect.timeout("20 seconds"),
    );
  });

const run = Effect.suspend(() => {
  speeds = { download: 0, upload: 0 };
  failed = false;
  fullScale = stops[0];
  return measure("download").pipe(Effect.andThen(measure("upload")));
}).pipe(
  Effect.catch((error) => Effect.sync(() => void (failed = true)).pipe(Effect.andThen(Effect.ignore(host.log(`Speed test: ${error.message}`))))),
  Effect.ensuring(Effect.sync(() => void (live = null))),
);

const ignition = Effect.gen(function* () {
  yield* Effect.sleep("50 millis");
  sweep = 1;
  yield* Effect.sleep("600 millis");
  sweep = 0;
  yield* Effect.sleep("600 millis");
  sweep = null;
});

function reading(value: number) {
  return value.toFixed(value < 10 ? 1 : 0);
}

function Dial({ direction }: { direction: Direction }) {
  const value = speeds[direction];
  const fraction = sweep ?? Math.max(0, Math.min(1, value / fullScale));
  const lit = fraction > 0.004;
  return (
    <stack key={direction} width={diameter} height={diameter} opacity={live === direction || value > 0 ? 1 : 0.5} animation="smooth" duration={0.6}>
      <shape
        key="scale"
        width={diameter}
        height={diameter}
        paths={[
          { d: scale, stroke: "alpha(foreground, 0.14)", lineWidth: arcWidth, cap: "round" },
          { d: scale, stroke: lit ? "alpha(accent, 0.18)" : "alpha(accent, 0)", lineWidth: arcWidth * 3, cap: "round", trim: [0, fraction] },
          { d: scale, stroke: lit ? "accent" : "alpha(accent, 0)", lineWidth: arcWidth, cap: "round", trim: [0, fraction] },
          { d: minorTicks, stroke: "alpha(foreground, 0.12)", lineWidth: 1, cap: "round" },
          { d: majorTicks, stroke: "alpha(foreground, 0.3)", lineWidth: 2, cap: "round" },
        ]}
      />
      <stack key="needle" x={center - needleWidth / 2} width={needleWidth} height={diameter} rotation={dialStart + fraction * dialSweep - 270}>
        <row
          key="sliver"
          y={needleTop}
          width={needleWidth}
          height={needleLength}
          radius={needleWidth / 2}
          background={{ gradient: "linear", colors: ["accent", "accent", "alpha(accent, 0)"], angle: 90 }}
        />
      </stack>
      <column key="readout" y={center + 8} width={diameter} gap={0} animation="none">
        <text key="value" width={diameter} height={32} align="center" fontSize={24} font="strong" color="foreground">{reading(value)}</text>
        <text key="unit" width={diameter} height={captionHeight} align="center" fontSize={10} color="dim">Mbps</text>
      </column>
      <text key="label" y={diameter - captionHeight} width={diameter} height={captionHeight} align="center" fontSize={10} font="strong" color="dim">
        {directions[direction].label}
      </text>
    </stack>
  );
}

export default {
  surfaces: { speedtest: { focusable: true, background: "none" } },

  effect: Effect.all([ignition, run], { concurrency: "unbounded", discard: true }),

  render(state) {
    const { spacing } = state.theme;
    const screen = { width: state.display?.width ?? 1728, height: state.display?.height ?? 1117 };
    const wifi = state.wifi;
    const title = wifi?.connected ? (wifi.ssid ?? "Wi‑Fi") : "";
    const width = 2 * diameter + dialGap;
    const height = titleHeight + diameter + buttonHeight + 2 * spacing.section + (failed ? spacing.section + titleHeight : 0);
    return (
      <stack key="backdrop" width={screen.width} height={screen.height}>
        <row key="scrim" width={screen.width} height={screen.height} background={scrim} action="close" />
        <column key="cluster" x={(screen.width - width) / 2} y={Math.round((screen.height - height) / 2 / 4) * 4} width={width} height={height} gap={spacing.section} action="cluster">
          <text key="title" width={width} height={titleHeight} align="center" fontSize={10} font="strong" color="dim">{title.toUpperCase()}</text>
          <row key="dials" gap={dialGap}>
            <Dial direction="download" />
            <Dial direction="upload" />
          </row>
          <row key="again" width={width} height={buttonHeight}>
            <spacer key="leading" />
            <button
              key="button"
              style="button"
              hover="button-hover"
              width={buttonWidth}
              height={buttonHeight}
              action={live ? undefined : "again"}
              tooltip="Measure again"
              opacity={live ? 0 : 1}
              animation="smooth"
            >
              <text key="text" fontSize={11} color="foreground">Run Again</text>
            </button>
            <spacer key="trailing" />
          </row>
          {failed && <text key="error" width={width} height={titleHeight} align="center" fontSize={11} color="bad">Speed test failed</text>}
        </column>
      </stack>
    );
  },

  onKey(key) {
    if (key !== "enter") return false;
    return live ? true : run;
  },

  onAction(action) {
    if (action === "close") return host.hide("speedtest");
    if (action === "again" && !live) return run;
  },
} satisfies Gary.Overlay;
