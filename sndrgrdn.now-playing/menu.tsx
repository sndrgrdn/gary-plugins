import { Effect, Stream, host, topic, type HostError } from "gary:effect";

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

function Control({ action, glyph, fontSize }: { action: string; glyph: string; fontSize: number }) {
  return (
    <button key={action} action={action} hover="hover" width={32} height={20} align="center">
      <text font="icon" fontSize={fontSize}>{glyph}</text>
    </button>
  );
}

function Artwork({ path, radius }: { path: string | null; radius: number }) {
  if (!path) return <text key="artwork" font="icon" fontSize={15} width={artworkSize} height={artworkSize} align="center" radius={radius} background="control" style="dim">{"\u{F0387}"}</text>;
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
      <row key="times" width={width} height={16}>
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
      <column key="playback" gap={spacing.section - 4}>
        <Seek track={track} width={width - 2 * spacing.section} />
        <row key="controls" gap={spacing.section}>
          <spacer key="start" />
          <Control action="previous" glyph={"\u{F04AE}"} fontSize={22} />
          <Control action="toggle" glyph={track.playing ? "\u{F03E4}" : "\u{F040A}"} fontSize={26} />
          <Control action="next" glyph={"\u{F04AD}"} fontSize={22} />
          <spacer key="end" />
        </row>
      </column>
    </column>
  );
}

export default {
  surface: { attach: true, margins: { top: 4, right: 4 }, anchors: { top: true, right: true } },

  effect: topic("nowplaying").pipe(
    Stream.map((nowplaying) => nowplaying.track?.playing === true),
    Stream.changes,
    Stream.switchMap((playing) => (playing ? Stream.tick("1 second") : Stream.make(undefined))),
    Stream.runForEach(() => Effect.sync(() => (now = Date.now()))),
  ),

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
} satisfies Gary.Menu;
