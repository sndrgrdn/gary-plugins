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

function Control({ action, symbol, size }: { action: string; symbol: string; size: number }) {
  return (
    <button key={action} action={action} hover="hover" padding={6} radius={6}>
      <icon symbol={symbol} fontSize={size} />
    </button>
  );
}

function Artwork({ path }: { path: string | null }) {
  if (!path) return <icon key="artwork" symbol="music.note" width={artworkSize} height={artworkSize} radius={6} background="control" style="dim" />;
  return <image key="artwork" path={path} width={artworkSize} height={artworkSize} radius={6} clip fit="fill" />;
}

function Seek({ track }: { track: Gary.Track }) {
  if (!track.duration) return null;
  return (
    <row key="seek" gap={8}>
      <text key="elapsed" style="dim" font="mono">{clock(position(track))}</text>
      <slider
        key="slider"
        value={(track.elapsed ?? 0) / track.duration}
        rate={track.playing ? (track.rate ?? 1) / track.duration : 0}
        at={track.elapsedAt ?? undefined}
        release="seek"
        color="foreground"
      />
      <text key="duration" style="dim" font="mono">{clock(track.duration)}</text>
    </row>
  );
}

function Player({ track }: { track: Gary.Track }) {
  const detail = [track.artist, track.album].filter(Boolean).join(" · ");
  return (
    <column style="panel" width={width} gap={12}>
      <row key="track" gap={12}>
        <Artwork path={track.artwork} />
        <column key="text" gap={2} width={width - 28 - artworkSize - 12}>
          <text key="title" style="title">{track.title}</text>
          {detail ? <text key="detail" style="dim">{detail}</text> : null}
        </column>
      </row>
      <Seek track={track} />
      <row key="controls" gap={20}>
        <spacer key="start" />
        <Control action="previous" symbol="backward.fill" size={16} />
        <Control action="toggle" symbol={track.playing ? "pause.fill" : "play.fill"} size={22} />
        <Control action="next" symbol="forward.fill" size={16} />
        <spacer key="end" />
      </row>
    </column>
  );
}

export default {
  surface: { attach: true, margins: { top: 6 }, anchors: { top: true, right: true } },

  effect: Effect.repeat(Effect.sync(() => (now = Date.now())), Schedule.spaced("1 second")),

  render(state) {
    const nowplaying = state.nowplaying;
    if (nowplaying?.track) return <Player track={nowplaying.track} />;
    const message = nowplaying && !nowplaying.available ? nowplaying.reason ?? "Now playing is unavailable" : "Nothing playing";
    return (
      <column style="panel" width={width}>
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
