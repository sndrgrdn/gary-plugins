import { Stream, topic } from "gary:effect";

type Menu = { recording: boolean; awake: boolean };
type Indicator = { key: string; symbol: string; tooltip: string; text?: string };

const pad = (n: number) => String(n).padStart(2, "0");

function remaining(endsAt: number) {
  const seconds = Math.ceil(Math.max(0, endsAt - Date.now()) / 1000);
  const hours = Math.floor(seconds / 3600);
  const clock = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return hours ? `${hours}:${clock}` : clock;
}

function active(state: Gary.State): Indicator[] {
  const menu = state["sndrgrdn.menu"] as Menu | undefined;
  const session = state["sndrgrdn.focus-timer"]?.session;
  const focus = state.focus;
  return [
    menu?.recording && { key: "recording", symbol: "record.circle", tooltip: "Screen recording" },
    session && {
      key: "timer",
      symbol: session.mode === "focus" ? "timer" : "cup.and.saucer",
      tooltip: session.mode === "focus" ? "Focus session" : "Break",
      text: remaining(session.endsAt),
    },
    focus?.active && { key: "focus", symbol: focus.symbol ?? "moon.fill", tooltip: focus.name ?? "Do Not Disturb" },
    menu?.awake && { key: "awake", symbol: "mug", tooltip: "Staying awake" },
  ].filter((indicator) => !!indicator);
}

export default {
  effect: topic("sndrgrdn.focus-timer").pipe(
    Stream.switchMap(({ session }) => (session ? Stream.tick("1 second") : Stream.empty)),
    Stream.runDrain,
  ),

  render(state) {
    return (
      <row gap={10}>
        {active(state).map(({ key, symbol, tooltip, text }) => (
          <row key={key} gap={5} tooltip={tooltip}>
            <icon symbol={symbol} color="foreground" />
            {text !== undefined && <text color="foreground">{text}</text>}
          </row>
        ))}
      </row>
    );
  },
} satisfies Gary.BarWidget;
