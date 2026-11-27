import { Effect, host as lifted } from "gary:effect";
import { bassShelf, compose, presetById } from "./presets";

type Choice = { preset: string; bass: number };

const off: Choice = { preset: "off", bass: 0 };

let output: { id: string; name: string } | null = null;
let choice = off;
let problem: string | null = null;

function choices(): Record<string, Choice> {
  const stored = host.storage.get("outputs");
  return stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, Choice>) : {};
}

function remembered(id: string): Choice {
  const stored = choices()[id];
  return stored ? { preset: presetById(stored.preset).id, bass: Number(stored.bass) || 0 } : off;
}

const publish = Effect.suspend(() => lifted.publish({ output, preset: choice.preset, bass: choice.bass, problem }));

const apply = Effect.suspend(() =>
  lifted.audio.setEqualizer(output ? compose(presetById(choice.preset), choice.bass) : null).pipe(
    Effect.andThen(() => Effect.sync(() => void (problem = null))),
    Effect.catchTag("HostError", (error) => Effect.sync(() => void (problem = error.message))),
    Effect.andThen(publish),
  ),
);

function choose(next: Choice) {
  if (!output) return Effect.fail(new Error("there is no output device"));
  choice = next;
  host.storage.set("outputs", { ...choices(), [output.id]: choice });
  return apply;
}

export default {
  onTopic({ topic, value }) {
    if (topic !== "audio") return;
    const next = value.output ? { id: value.output.id, name: value.output.name } : null;
    if (next?.id === output?.id) return;
    output = next;
    choice = next ? remembered(next.id) : off;
    return apply;
  },

  methods: {
    select: (preset: string) => choose({ ...choice, preset: presetById(preset).id }),
    bass: (gain: string) => choose({ ...choice, bass: Math.min(bassShelf.maxGain, Math.max(0, Math.round((Number(gain) || 0) * 2) / 2)) }),
  },
} satisfies Gary.Service;
