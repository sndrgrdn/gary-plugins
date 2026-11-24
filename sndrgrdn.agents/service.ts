import { Effect, Option, Schedule, Schema, Stream, fetch, host } from "gary:effect";
import type { Problem, Provider, ProviderId, Window } from "./topic";
import {
  ClaudeCredentials,
  ClaudeUsage,
  GrokAuth,
  GrokBilling,
  capitalize,
  claudeWindows,
  codexReply,
  codexWindows,
  periodLabel,
  time,
} from "./usage";

type Usage = { plan: string | null; windows: Window[] };
type Collector = { id: ProviderId; name: string; collect: Effect.Effect<Usage, Problem> };

const signedOut = (message: string): Problem => ({ kind: "signed-out", message });
const unavailable = (message: string): Problem => ({ kind: "unavailable", message });

const claudeSignIn = "Run `claude auth login`";
const grokSignIn = "Run `grok login`";
const codexMessages = [
  { id: 1, method: "initialize", params: { clientInfo: { name: "gary-agents", version: "1" } } },
  { method: "initialized", params: {} },
  { id: 2, method: "account/rateLimits/read", params: {} },
];
const codexScript = `command -v codex >/dev/null || exit 127; { printf '%s\\n' ${codexMessages.map((message) => `'${JSON.stringify(message)}'`).join(" ")}; exec tail -f /dev/null; } | codex -s read-only -a on-request app-server 2>/dev/null`;

const request = Effect.fn("Agents.request")(function* (url: string, headers: Record<string, string>, signIn: string) {
  const response = yield* fetch(url, { headers }).pipe(Effect.mapError((error) => unavailable(error.message)));
  if (response.status === 401 || response.status === 403) return yield* Effect.fail(signedOut(signIn));
  if (response.status !== 200) return yield* Effect.fail(unavailable(`The usage request failed with HTTP ${response.status}`));
  return response.text;
});

const claude = Effect.gen(function* () {
  const result = yield* host
    .exec(["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"])
    .pipe(Effect.mapError((error) => unavailable(error.message)));
  if (result.status !== 0) return yield* Effect.fail(signedOut(claudeSignIn));
  const { claudeAiOauth: credentials } = yield* Schema.decodeUnknownEffect(ClaudeCredentials)(result.stdout).pipe(
    Effect.mapError(() => unavailable("Claude Code's credentials are unreadable")),
  );
  if (credentials.expiresAt <= Date.now()) return yield* Effect.fail(unavailable("Token expired; open Claude Code to refresh it"));
  const body = yield* request(
    "https://api.anthropic.com/api/oauth/usage",
    { Authorization: `Bearer ${credentials.accessToken}`, "anthropic-beta": "oauth-2025-04-20" },
    claudeSignIn,
  );
  const usage = yield* Schema.decodeUnknownEffect(ClaudeUsage)(body).pipe(Effect.mapError(() => unavailable("Unexpected usage response")));
  return { plan: credentials.subscriptionType ? capitalize(credentials.subscriptionType) : null, windows: claudeWindows(usage.limits) };
});

const codex = Effect.gen(function* () {
  const found = yield* host.spawn(["/bin/sh", "-c", codexScript]).pipe(
    Stream.map(codexReply),
    Stream.filter((reply) => reply !== null),
    Stream.runHead,
    Effect.timeoutOption("10 seconds"),
    Effect.mapError((error) => (error.message.endsWith("status 127") ? signedOut("Install the codex CLI") : unavailable(error.message))),
  );
  const reply = Option.getOrNull(Option.flatten(found));
  if (!reply) return yield* Effect.fail(unavailable("Codex did not report its limits"));
  if (reply.error) return yield* Effect.fail(unavailable(reply.error.message));
  const limits = reply.result?.rateLimits;
  return { plan: limits?.planType ? capitalize(limits.planType) : null, windows: limits ? codexWindows(limits) : [] };
});

const grok = Effect.gen(function* () {
  const text = yield* host.readFile("~/.grok/auth.json").pipe(Effect.mapError(() => signedOut(grokSignIn)));
  const entries = Object.values(
    yield* Schema.decodeUnknownEffect(GrokAuth)(text).pipe(Effect.mapError(() => unavailable("grok's credentials are unreadable"))),
  );
  const entry = entries.find((each) => each.auth_mode === "oidc") ?? entries[0];
  if (!entry?.key) return yield* Effect.fail(signedOut(grokSignIn));
  const expires = time(entry.expires_at);
  if (expires !== null && expires <= Date.now()) return yield* Effect.fail(unavailable("Token expired; start grok to refresh it"));
  const body = yield* request(
    "https://cli-chat-proxy.grok.com/v1/billing?format=credits",
    { Authorization: `Bearer ${entry.key}`, Accept: "application/json" },
    grokSignIn,
  );
  const { config } = yield* Schema.decodeUnknownEffect(GrokBilling)(body).pipe(Effect.mapError(() => unavailable("Unexpected billing response")));
  const window: Window = {
    label: periodLabel(config.currentPeriod.type),
    percent: config.creditUsagePercent,
    resetsAt: time(config.currentPeriod.end),
    scoped: [],
  };
  return { plan: null, windows: [window] };
});

const collectors: Collector[] = [
  { id: "claude", name: "Claude", collect: claude },
  { id: "codex", name: "Codex", collect: codex },
  { id: "grok", name: "Grok", collect: grok },
];

let providers: Provider[] = collectors.map(({ id, name }) => ({ id, name, plan: null, windows: [], fetchedAt: null, problem: null }));
let refreshing = false;

const publish = Effect.suspend(() => host.publish({ providers }));

const collect = ({ id, name, collect }: Collector) =>
  collect.pipe(
    Effect.tapError((problem) => Effect.ignore(host.log(`${name}: ${problem.message}`))),
    Effect.match({
      onSuccess: (usage) => (provider: Provider): Provider => ({ ...provider, ...usage, fetchedAt: Date.now(), problem: null }),
      onFailure: (problem) => (provider: Provider): Provider => ({ ...provider, problem }),
    }),
    Effect.flatMap((change) => {
      providers = providers.map((provider) => (provider.id === id ? change(provider) : provider));
      return publish;
    }),
    Effect.catch((error) => Effect.ignore(host.log(`publishing ${name} failed: ${error.message}`))),
  );

const refresh = Effect.suspend(() => {
  if (refreshing) return Effect.void;
  refreshing = true;
  return Effect.forEach(collectors, collect, { concurrency: "unbounded", discard: true }).pipe(
    Effect.ensuring(Effect.sync(() => void (refreshing = false))),
  );
});

export default {
  effect: Effect.andThen(Effect.ignore(publish), Effect.repeat(refresh, Schedule.spaced("5 minutes"))),

  methods: {
    refresh: () => Effect.map(refresh, () => ({ providers })),
    state: () => ({ providers }),
  },
} satisfies Gary.Service;
