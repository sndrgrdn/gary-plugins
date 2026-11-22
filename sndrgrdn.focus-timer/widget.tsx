import { Effect, host } from "gary:effect";
import { type View, follow, format, left, ring } from "./countdown";

const pointsPerStep = 24;

let view: View = { session: null, now: 0 };
let travel = 0;

function add(steps: number) {
  Effect.runFork(host.call("add", String(steps * 5)).pipe(Effect.catch((error) => host.log(`add failed: ${error.message}`))));
}

export default {
  effect: follow((next) => {
    view = next;
  }),

  render() {
    const { session, now } = view;
    const paths: Gary.Shape["paths"] = [{ d: ring, stroke: "alpha(foreground, 0.25)", lineWidth: 4 }];
    if (session) paths.push({ d: ring, stroke: "foreground", lineWidth: 4, cap: "round", trim: [0, left(session, now) / session.length] });
    return (
      <row
        gap={6}
        action="open"
        scrollAction="adjust"
        tooltip={session ? `${session.mode === "focus" ? "Focus" : "Break"}, scroll to add or remove 5 minutes` : "Scroll to focus for 5 minutes"}
      >
        <shape key="ring" width={13} height={13} viewBox={[24, 24]} paths={paths} />
        {session && <text key="left">{format(left(session, now))}</text>}
      </row>
    );
  },

  onAction(action) {
    if (action === "open") Effect.runSync(host.toggle());
  },

  onScroll(event) {
    if (event.action !== "adjust" || event.phase === "momentum") return;
    if (event.phase === "began") travel = 0;
    travel += event.precise ? event.y / pointsPerStep : Math.sign(event.y);
    const steps = Math.trunc(travel);
    travel -= steps;
    if (steps) add(steps);
  },
} satisfies Gary.BarWidget;
