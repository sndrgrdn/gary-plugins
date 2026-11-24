import { Stream, topic } from "gary:effect";
import type { Session } from "./topic";

export const ring = "M12 2 A10 10 0 1 1 11.99 2";

export function left(session: Session, now: number) {
  return Math.max(0, session.endsAt - now);
}

export function format(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const clock = `${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${clock}` : clock;
}

export const ticking = Stream.zipLatestAll(topic("sndrgrdn.focus-timer"), topic("session")).pipe(
  Stream.switchMap(([{ session }, { locked }]) => (session && !locked ? Stream.tick("1 second") : Stream.empty)),
  Stream.runDrain,
);
