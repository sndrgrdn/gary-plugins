export type ProviderId = "claude" | "codex" | "grok";
export type Window = { label: string; percent: number; resetsAt: number | null; period: number | null };
export type Problem = { kind: "signed-out" | "unavailable"; message: string };
export type Provider = { id: ProviderId; name: string; plan: string | null; windows: Window[]; fetchedAt: number | null; problem: Problem | null };
export type Topic = { providers: Provider[] };
