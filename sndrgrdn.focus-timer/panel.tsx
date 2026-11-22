import { Effect, host } from "gary:effect";
import { type View, follow, format, left, ring } from "./countdown";
import type { Mode } from "./topic";

const size = 120;
const modes: [Mode, string][] = [
  ["focus", "Focus"],
  ["break", "Break"],
];

let view: View = { session: null, now: 0 };

function call(method: string, ...args: string[]) {
  Effect.runFork(host.call(method, ...args).pipe(Effect.catch((error) => host.log(`${method} failed: ${error.message}`))));
}

export default {
  surface: { attach: true, margins: { top: 6 }, anchors: { top: true, right: true } },

  effect: follow((next) => {
    view = next;
  }),

  render() {
    const { session, now } = view;
    const remaining = session ? left(session, now) : 0;
    return (
      <column style="panel" gap={12}>
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
          <text key="left" width={size} y={size / 2 - 11} align="center" font="mono" fontSize={18} style={session ? "bright" : "dim"}>
            {format(remaining)}
          </text>
        </stack>
        <row key="modes" width={size} align="center" gap={6}>
          {modes.map(([mode, label]) => {
            const active = session?.mode === mode;
            return (
              <button key={mode} action={mode} style="button" hover={active ? undefined : "button-hover"} background={active ? "foreground" : undefined}>
                <text color={active ? "background" : "foreground"}>{label}</text>
              </button>
            );
          })}
        </row>
      </column>
    );
  },

  onAction(action) {
    if (action !== "focus" && action !== "break") return;
    if (view.session?.mode === action) call("stop");
    else call("start", action);
  },
} satisfies Gary.Panel;
