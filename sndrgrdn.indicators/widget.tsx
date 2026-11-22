import { Stream, host, topic } from "gary:effect";
import type { Effect, HostError } from "gary:effect";

type Indicator = { key: string; glyph: string; tooltip: string; text?: string; click?: Effect.Effect<unknown, HostError> };

const pad = (n: number) => String(n).padStart(2, "0");

function remaining(endsAt: number) {
  const seconds = Math.ceil(Math.max(0, endsAt - Date.now()) / 1000);
  const hours = Math.floor(seconds / 3600);
  const clock = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return hours ? `${hours}:${clock}` : clock;
}

const menuCommand = (command: string) => host.call({ plugin: "sndrgrdn.menu" }, "run", command);

function active(state: Gary.State): Indicator[] {
  const menu = state["sndrgrdn.menu"];
  const session = state["sndrgrdn.focus-timer"]?.session;
  const focus = state.focus;
  return [
    menu?.recording && { key: "recording", glyph: "\u{F0EC2}", tooltip: "Stop recording", click: menuCommand("record-stop") },
    session && {
      key: "timer",
      glyph: session.mode === "focus" ? "\u{F13AB}" : "\u{F0176}",
      tooltip: session.mode === "focus" ? "Focus session" : "Break",
      text: remaining(session.endsAt),
      click: host.toggle("sndrgrdn.focus-timer"),
    },
    focus?.active && { key: "focus", glyph: "\u{F009B}", tooltip: focus.name ?? "Do Not Disturb" },
    menu?.awake && { key: "awake", glyph: "\u{EF59}", tooltip: "Staying awake; click to allow sleep", click: menuCommand("awake") },
  ].filter((indicator) => !!indicator);
}

export default {
  effect: topic("sndrgrdn.focus-timer").pipe(
    Stream.switchMap(({ session }) => (session ? Stream.tick("1 second") : Stream.empty)),
    Stream.runDrain,
  ),

  render(state) {
    const indicators = active(state);
    if (!indicators.length) return null;
    return (
      <row gap={0} padding={[0, 4]}>
        {indicators.map(({ key, glyph, tooltip, text, click }) => (
          <row key={key} gap={4} tooltip={tooltip} action={click && key}>
            <text key="glyph" fontSize={13} width={20} align="center" color="foreground">{glyph}</text>
            {text !== undefined && <text key="text" color="foreground">{text}</text>}
          </row>
        ))}
      </row>
    );
  },

  onAction(action, _payload, state) {
    return active(state).find(({ key }) => key === action)?.click;
  },
} satisfies Gary.BarWidget;
