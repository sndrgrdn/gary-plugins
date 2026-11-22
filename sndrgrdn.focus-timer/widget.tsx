import { Effect, host } from "gary:effect";
import { format, left, ring, ticking } from "./countdown";

const pointsPerStep = 24;

let travel = 0;

export default {
  effect: ticking,

  render(state) {
    const session = state["sndrgrdn.focus-timer"]?.session;
    const now = Date.now();
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
    if (action === "open") return host.toggle();
  },

  onScroll(event) {
    if (event.action !== "adjust" || event.phase === "momentum") return;
    if (event.phase === "began") travel = 0;
    travel += event.precise ? event.y / pointsPerStep : Math.sign(event.y);
    const steps = Math.trunc(travel);
    travel -= steps;
    if (steps) return host.call("add", String(steps * 5)).pipe(Effect.catch((error) => host.log(`add failed: ${error.message}`)));
  },
} satisfies Gary.BarWidget;
