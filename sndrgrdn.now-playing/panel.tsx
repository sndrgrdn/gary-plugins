import { Effect, Schedule, host, type HostError } from "gary:effect";

const width = 300;
const artworkSize = 56;
let now = Date.now();

function run(effect: Effect.Effect<unknown, HostError>) {
  Effect.runSync(effect.pipe(Effect.tapError((error) => host.log(error.message)), Effect.ignore));
}

function position(track: Gary.Track) {
  if (track.elapsed === null) return 0;
  const drift = track.playing && track.elapsedAt !== null ? ((now - track.elapsedAt) / 1000) * (track.rate ?? 1) : 0;
  return Math.min(track.duration ?? Infinity, track.elapsed + drift);
}

function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

function Control({ action, symbol, size, fontSize }: { action: string; symbol: string; size: number; fontSize: number }) {
  return (
    <button key={action} action={action} hover="hover" width={size} height={size} align="center">
      <icon symbol={symbol} fontSize={fontSize} />
    </button>
  );
}

function Artwork({ path, radius }: { path: string | null; radius: number }) {
  if (!path) return <icon key="artwork" symbol="music.note" width={artworkSize} height={artworkSize} radius={radius} background="control" style="dim" />;
  return <image key="artwork" path={path} width={artworkSize} height={artworkSize} radius={radius} clip fit="fill" />;
}

function Seek({ track, width }: { track: Gary.Track; width: number }) {
  if (!track.duration) return null;
  return (
    <column key="seek" gap={0}>
      <slider
        key="slider"
        value={(track.elapsed ?? 0) / track.duration}
        rate={track.playing ? (track.rate ?? 1) / track.duration : 0}
        at={track.elapsedAt ?? undefined}
        release="seek"
        color="foreground"
        width={width}
      />
      <row key="times" width={width}>
        <text key="elapsed" style="dim" font="mono">{clock(position(track))}</text>
        <spacer />
        <text key="duration" style="dim" font="mono">{clock(track.duration)}</text>
      </row>
    </column>
  );
}

function Player({ track, theme }: { track: Gary.Track; theme: Gary.Theme }) {
  const { spacing, radius } = theme;
  const detail = [...new Set([track.artist, track.album].filter(Boolean))].join(" · ");
  return (
    <column width={width} padding={spacing.section} gap={spacing.section}>
      <row key="track">
        <Artwork path={track.artwork} radius={radius.control} />
        <column key="text" gap={0} width={width - 2 * spacing.section - artworkSize - spacing.item}>
          <text key="title" style="title" lines={1}>{track.title}</text>
          {detail ? <text key="detail" style="dim" lines={1}>{detail}</text> : null}
        </column>
      </row>
      <Seek track={track} width={width - 2 * spacing.section} />
      <row key="controls" gap={spacing.section}>
        <spacer key="start" />
        <Control action="previous" symbol="backward.fill" size={32} fontSize={16} />
        <Control action="toggle" symbol={track.playing ? "pause.fill" : "play.fill"} size={40} fontSize={22} />
        <Control action="next" symbol="forward.fill" size={32} fontSize={16} />
        <spacer key="end" />
      </row>
    </column>
  );
}

export default {
  surface: { attach: true, margins: { top: 8, right: 20 }, anchors: { top: true, right: true } },

  effect: Effect.repeat(Effect.sync(() => (now = Date.now())), Schedule.spaced("1 second")),

  render(state) {
    const nowplaying = state.nowplaying;
    const { spacing } = state.theme;
    if (nowplaying?.track) return <Player track={nowplaying.track} theme={state.theme} />;
    const message = nowplaying && !nowplaying.available ? nowplaying.reason ?? "Now playing is unavailable" : "Nothing playing";
    return (
      <column width={width} padding={spacing.section}>
        <text style="dim">{message}</text>
      </column>
    );
  },

  onAction(action, payload, state) {
    const duration = state.nowplaying?.track?.duration;
    if (action === "seek" && typeof payload === "number" && duration) run(host.nowplaying.seek(payload * duration));
    if (action === "previous") run(host.nowplaying.previous());
    if (action === "toggle") run(host.nowplaying.toggle());
    if (action === "next") run(host.nowplaying.next());
  },
} satisfies Gary.Panel;
