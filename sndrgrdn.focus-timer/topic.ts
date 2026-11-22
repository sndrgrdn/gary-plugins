export type Mode = "focus" | "break";
export type Session = { mode: Mode; endsAt: number; length: number };
export type Topic = { session: Session | null };
