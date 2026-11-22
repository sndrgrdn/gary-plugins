export type Level = "volume" | "brightness";
export type Reading = { value: number; muted: boolean; display: string | null };

const steps = 16;

export function read(state: Gary.State, level: Level): Reading | null {
  if (level === "volume") {
    const output = state.audio?.output;
    if (output?.volume == null) return null;
    return { value: output.volume, muted: output.muted === true, display: null };
  }
  const displays = (state.brightness?.displays ?? []).flatMap((display) =>
    display.brightness === null ? [] : [{ ...display, brightness: display.brightness }],
  );
  const display = displays.find((each) => each.builtin) ?? displays[0];
  return display ? { value: display.brightness, muted: false, display: display.id } : null;
}

export function shown(reading: Reading) {
  return reading.muted ? 0 : reading.value;
}

export function stepped(value: number, direction: number) {
  return Math.min(steps, Math.max(0, Math.round(value * steps) + direction)) / steps;
}

export function symbol(level: Level, reading: Reading) {
  const value = shown(reading);
  if (level === "brightness") return value < 0.5 ? "sun.min.fill" : "sun.max.fill";
  if (value === 0) return "speaker.slash.fill";
  return value < 0.34 ? "speaker.wave.1.fill" : value < 0.67 ? "speaker.wave.2.fill" : "speaker.wave.3.fill";
}
