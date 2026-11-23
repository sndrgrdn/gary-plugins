import { Effect, host } from "gary:effect";
import { format, left, ring, ticking } from "./countdown";
import type { Mode } from "./topic";

const size = 128;
const modes: [Mode, string][] = [
  ["focus", "Focus"],
  ["break", "Break"],
];

function call(method: string, ...args: string[]) {
  return host.call(method, ...args).pipe(Effect.catch((error) => host.log(`${method} failed: ${error.message}`)));
}

export default {
  surface: { attach: true, margins: { top: 8, right: 20 }, anchors: { top: true, right: true } },

  effect: ticking,

  render(state) {
    const session = state["sndrgrdn.focus-timer"]?.session;
    const remaining = session ? left(session, Date.now()) : 0;
    const { spacing } = state.theme;
    return (
      <column padding={spacing.section} gap={spacing.section}>
        <stack key="ring" width={size} height={size}>
          <shape
            key="shape"
            width={size}
            height={size}
            viewBox={[24, 24]}
            animation="smooth"
            paths={[
              { d: ring, stroke: "alpha(foreground, 0.15)", lineWidth: 1.5 },
              { d: ring, stroke: "foreground", lineWidth: 1.5, cap: "round", trim: [0, session ? remaining / session.length : 0] },
            ]}
          />
          <text key="left" width={size} height={size} align="center" font="mono" fontSize={18} color={session ? "foreground" : "dim"}>
            {format(remaining)}
          </text>
        </stack>
        <row key="modes" width={size} align="center">
          {modes.map(([mode, label]) => {
            const active = session?.mode === mode;
            return (
              <button key={mode} action={mode} style="button" hover={active ? undefined : "button-hover"} background={active ? "selected" : undefined}>
                <text color="foreground" font={active ? "strong" : undefined}>{label}</text>
              </button>
            );
          })}
        </row>
      </column>
    );
  },

  onAction(action, _, state) {
    if (action !== "focus" && action !== "break") return;
    return state["sndrgrdn.focus-timer"]?.session?.mode === action ? call("stop") : call("start", action);
  },
} satisfies Gary.Menu;
