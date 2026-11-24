import { Option, Schema } from "gary:effect";
import type { Provider, Window } from "./topic";

const Text = Schema.optional(Schema.NullOr(Schema.String));
const Count = Schema.optional(Schema.NullOr(Schema.Number));

export const ClaudeCredentials = Schema.fromJsonString(
  Schema.Struct({
    claudeAiOauth: Schema.Struct({
      accessToken: Schema.String,
      refreshToken: Text,
      expiresAt: Schema.Number,
      scopes: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
      subscriptionType: Text,
    }),
  }),
);

export const OAuthToken = Schema.fromJsonString(
  Schema.Struct({ access_token: Schema.String, refresh_token: Text, expires_in: Schema.Number, refresh_token_expires_in: Count }),
);

export const OpenIdConfiguration = Schema.fromJsonString(Schema.Struct({ token_endpoint: Schema.String }));

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
  Schema.Record(
    Schema.String,
    Schema.Struct({ auth_mode: Text, key: Text, expires_at: Text, refresh_token: Text, oidc_issuer: Text, oidc_client_id: Text }),
  ),
);
export const GrokBilling = Schema.fromJsonString(
  Schema.Struct({
    config: Schema.Struct({ currentPeriod: Schema.Struct({ type: Schema.String, start: Text, end: Text }), creditUsagePercent: Schema.Number }),
  }),
);

const hour = 3_600_000;
const day = 24 * hour;
const claudeKinds = [
  { prefix: "five_hour", label: "Session", period: 5 * hour },
  { prefix: "weekly", label: "Weekly", period: 7 * day },
  { prefix: "seven_day", label: "Weekly", period: 7 * day },
];
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

export function claudeWindows(limits: typeof ClaudeUsage.Type["limits"]): Window[] {
  return limits.map((limit) => {
    const kind = claudeKinds.find((each) => limit.kind.startsWith(each.prefix));
    const label = kind?.label ?? capitalize(limit.kind.replaceAll("_", " "));
    const model = limit.scope?.model?.display_name;
    return {
      label: model ? `${model} ${label.toLowerCase()}` : label,
      percent: limit.percent,
      resetsAt: time(limit.resets_at),
      period: kind?.period ?? null,
    };
  });
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
      ? [
          {
            label: durationLabel(window.windowDurationMins),
            percent: window.usedPercent,
            resetsAt: window.resetsAt ? window.resetsAt * 1000 : null,
            period: window.windowDurationMins ? window.windowDurationMins * 60_000 : null,
          },
        ]
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

export function pace(window: Window, now: number) {
  if (window.resetsAt === null || window.period === null) return null;
  const elapsed = window.period - (window.resetsAt - now);
  if (!(elapsed > 0 && elapsed <= window.period)) return null;
  const expected = (100 * elapsed) / window.period;
  const runsOutIn = window.percent > 0 ? ((100 - window.percent) * elapsed) / window.percent : Infinity;
  return { expected, runsOutIn: runsOutIn < window.resetsAt - now ? runsOutIn : null };
}

export function alarming(percent: number) {
  return percent >= 90;
}

export function anyAlarming(providers: readonly Provider[]) {
  return providers.some((provider) => !provider.problem && provider.windows.some((window) => alarming(window.percent)));
}
