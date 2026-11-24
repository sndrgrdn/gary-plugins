import { Option, Schema } from "gary:effect";
import type { Provider, Window } from "./topic";

const Text = Schema.optional(Schema.NullOr(Schema.String));
const Count = Schema.optional(Schema.NullOr(Schema.Number));

export const ClaudeCredentials = Schema.fromJsonString(
  Schema.Struct({ claudeAiOauth: Schema.Struct({ accessToken: Schema.String, expiresAt: Schema.Number, subscriptionType: Text }) }),
);

const ClaudeLimit = Schema.Struct({
  kind: Schema.String,
  percent: Schema.Number,
  resets_at: Text,
  scope: Schema.optional(Schema.NullOr(Schema.Struct({ model: Schema.optional(Schema.NullOr(Schema.Struct({ display_name: Text }))) }))),
});
export const ClaudeUsage = Schema.fromJsonString(Schema.Struct({ limits: Schema.Array(ClaudeLimit) }));

const CodexWindow = Schema.optional(Schema.NullOr(Schema.Struct({ usedPercent: Schema.Number, windowDurationMins: Count, resetsAt: Count })));
const CodexReply = Schema.fromJsonString(
  Schema.Struct({
    id: Schema.Literal(2),
    result: Schema.optional(
      Schema.Struct({
        rateLimits: Schema.optional(Schema.NullOr(Schema.Struct({ primary: CodexWindow, secondary: CodexWindow, planType: Text }))),
      }),
    ),
    error: Schema.optional(Schema.Struct({ message: Schema.String })),
  }),
);
export type CodexReply = typeof CodexReply.Type;

export const GrokAuth = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Struct({ auth_mode: Text, key: Text, expires_at: Text })),
);
export const GrokBilling = Schema.fromJsonString(
  Schema.Struct({
    config: Schema.Struct({ currentPeriod: Schema.Struct({ type: Schema.String, end: Text }), creditUsagePercent: Schema.Number }),
  }),
);

const durations: Record<number, string> = { 300: "Session", 10080: "Weekly", 43200: "Monthly" };
const periods: Record<string, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function time(text: string | null | undefined) {
  if (!text) return null;
  const value = Date.parse(text.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(value) ? null : value;
}

function claudeLabel(kind: string) {
  if (kind.startsWith("five_hour")) return "Session";
  if (kind.startsWith("weekly") || kind.startsWith("seven_day")) return "Weekly";
  return capitalize(kind.replaceAll("_", " "));
}

export function claudeWindows(limits: typeof ClaudeUsage.Type["limits"]): Window[] {
  const windows: Window[] = limits
    .filter((limit) => !limit.scope?.model?.display_name)
    .map((limit) => ({ label: claudeLabel(limit.kind), percent: limit.percent, resetsAt: time(limit.resets_at), scoped: [] }));
  for (const limit of limits) {
    const model = limit.scope?.model?.display_name;
    if (!model) continue;
    const base = claudeLabel(limit.kind);
    const parent = windows.find((window) => window.label === base);
    if (parent) parent.scoped.push({ label: model, percent: limit.percent });
    else windows.push({ label: `${model} ${base.toLowerCase()}`, percent: limit.percent, resetsAt: time(limit.resets_at), scoped: [] });
  }
  return windows;
}

export function codexReply(line: string): CodexReply | null {
  return Option.getOrNull(Schema.decodeUnknownOption(CodexReply)(line));
}

function durationLabel(minutes: number | null | undefined) {
  if (!minutes) return "Limit";
  return durations[minutes] ?? `${Math.round(minutes / 60)}h`;
}

export function codexWindows(limits: NonNullable<NonNullable<CodexReply["result"]>["rateLimits"]>): Window[] {
  return [limits.primary, limits.secondary].flatMap((window) =>
    window
      ? [{ label: durationLabel(window.windowDurationMins), percent: window.usedPercent, resetsAt: window.resetsAt ? window.resetsAt * 1000 : null, scoped: [] }]
      : [],
  );
}

export function periodLabel(type: string) {
  const period = type.replace(/^USAGE_PERIOD_TYPE_/, "");
  return periods[period] ?? capitalize(period.toLowerCase());
}

export function duration(milliseconds: number) {
  if (!(milliseconds > 0)) return "";
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

export function clock(milliseconds: number) {
  const date = new Date(milliseconds);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function alarming(percent: number) {
  return percent >= 90;
}

export function anyAlarming(providers: readonly Provider[]) {
  return providers.some((provider) => !provider.problem && provider.windows.some((window) => alarming(window.percent)));
}
