import { Effect, Option, Schedule, Schema, Stream, fetch, host } from "gary:effect";
import type { Problem, Provider, ProviderId, Window } from "./topic";
import {
  ClaudeCredentials,
  ClaudeUsage,
  GrokAuth,
  GrokBilling,
  OAuthToken,
  OpenIdConfiguration,
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
const claudeKeychainItem = "Claude Code-credentials";
const claudeClientId = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const claudeLock = ".claude/.oauth_refresh.lock";
const keychainCommandLimit = 4032;
const claudeLockedCommand = 'security -i < "$HOME/$1/keychain"; status=$?; rm -f "$HOME/$1/keychain"; exit $status';
const grokSignIn = "Run `grok login`";
const grokAuthFile = "~/.grok/auth.json";
const expiryMargin = 60_000;
const codexMessages = [
  { id: 1, method: "initialize", params: { clientInfo: { name: "gary-agents", version: "1" } } },
  { method: "initialized", params: {} },
  { id: 2, method: "account/rateLimits/read", params: {} },
];
const codexScript = `command -v codex >/dev/null || exit 127; { printf '%s\\n' ${codexMessages.map((message) => `'${JSON.stringify(message)}'`).join(" ")}; exec tail -f /dev/null; } | codex -s read-only -a on-request app-server 2>/dev/null`;

const expired = (expiresAt: number) => expiresAt <= Date.now() + expiryMargin;

const request = Effect.fn("Agents.request")(function* (url: string, options: Gary.FetchOptions, signIn: string) {
  const response = yield* fetch(url, options).pipe(Effect.mapError((error) => unavailable(error.message)));
  if (response.status === 400 || response.status === 401 || response.status === 403) return yield* Effect.fail(signedOut(signIn));
  if (response.status !== 200) return yield* Effect.fail(unavailable(`The request to ${url.split("/")[2]} failed with HTTP ${response.status}`));
  return response.text;
});

const exec = (argv: string[]) => host.exec(argv).pipe(Effect.mapError((error) => unavailable(error.message)));
const shell = (script: string, ...args: string[]) => exec(["/bin/sh", "-c", script, "sh", ...args]);

const renew = Effect.fn("Agents.renew")(function* (url: string, options: Gary.FetchOptions, signIn: string) {
  const body = yield* request(url, { ...options, method: "POST" }, signIn);
  return yield* Schema.decodeUnknownEffect(OAuthToken)(body).pipe(Effect.mapError(() => unavailable("Unexpected token response")));
});

const hex = (text: string) =>
  Array.from(unescape(encodeURIComponent(text)), (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");

const readClaude = Effect.gen(function* () {
  const result = yield* exec(["security", "find-generic-password", "-s", claudeKeychainItem, "-w"]);
  if (result.status !== 0) return yield* Effect.fail(signedOut(claudeSignIn));
  const { claudeAiOauth: credentials } = yield* Schema.decodeUnknownEffect(ClaudeCredentials)(result.stdout).pipe(
    Effect.mapError(() => unavailable("Claude Code's credentials are unreadable")),
  );
  return { text: result.stdout, credentials };
});

const writeClaude = Effect.fn("Agents.writeClaude")(function* (text: string) {
  const attributes = yield* exec(["security", "find-generic-password", "-s", claudeKeychainItem]);
  const account = /"acct"<blob>="([^"]*)"/.exec(attributes.stdout)?.[1];
  if (account === undefined) return yield* Effect.fail(unavailable("Claude Code's keychain item has no account"));
  const password = hex(text);
  const command = `add-generic-password -U -a "${account}" -s "${claudeKeychainItem}" -X "${password}"\n`;
  const result =
    command.length > keychainCommandLimit
      ? yield* exec(["security", "add-generic-password", "-U", "-a", account, "-s", claudeKeychainItem, "-X", password])
      : yield* host.writeFile(`~/${claudeLock}/keychain`, command).pipe(
          Effect.mapError((error) => unavailable(error.message)),
          Effect.andThen(shell(claudeLockedCommand, claudeLock)),
        );
  const saved = yield* readClaude;
  if (result.status !== 0 || saved.text.trim() !== text) return yield* Effect.fail(unavailable("Saving Claude Code's new token failed"));
});

const refreshClaude = Effect.gen(function* () {
  const { text, credentials } = yield* readClaude;
  if (!expired(credentials.expiresAt)) return credentials;
  if (!credentials.refreshToken) return yield* Effect.fail(signedOut(claudeSignIn));
  const token = yield* renew(
    "https://platform.claude.com/v1/oauth/token",
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
        client_id: claudeClientId,
        scope: (credentials.scopes ?? []).join(" "),
      }),
    },
    claudeSignIn,
  );
  const stored = JSON.parse(text);
  const now = Date.now();
  stored.claudeAiOauth = {
    ...stored.claudeAiOauth,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? credentials.refreshToken,
    expiresAt: now + token.expires_in * 1000,
    ...(token.refresh_token_expires_in ? { refreshTokenExpiresAt: now + token.refresh_token_expires_in * 1000 } : {}),
  };
  yield* writeClaude(JSON.stringify(stored));
  return { ...credentials, accessToken: token.access_token };
});

const claudeToken = Effect.gen(function* () {
  const { credentials } = yield* readClaude;
  if (!expired(credentials.expiresAt)) return credentials;
  return yield* Effect.acquireUseRelease(
    shell('find "$HOME/$1" -maxdepth 0 -mmin +1 -exec rm -rf {} + 2>/dev/null; mkdir -m 700 "$HOME/$1"', claudeLock),
    (locked) => (locked.status === 0 ? refreshClaude : Effect.fail(unavailable("Claude Code is refreshing its token"))),
    (locked) => (locked.status === 0 ? Effect.ignore(shell('rm -rf "$HOME/$1"', claudeLock)) : Effect.void),
  );
});

const claude = Effect.gen(function* () {
  const credentials = yield* claudeToken;
  const body = yield* request(
    "https://api.anthropic.com/api/oauth/usage",
    { headers: { Authorization: `Bearer ${credentials.accessToken}`, "anthropic-beta": "oauth-2025-04-20" } },
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

const refreshGrok = Effect.fn("Agents.refreshGrok")(function* (text: string, id: string, entry: typeof GrokAuth.Type[string]) {
  if (!entry.refresh_token || !entry.oidc_issuer || !entry.oidc_client_id) return yield* Effect.fail(signedOut(grokSignIn));
  const discovery = yield* request(`${entry.oidc_issuer}/.well-known/openid-configuration`, {}, grokSignIn);
  const configuration = yield* Schema.decodeUnknownEffect(OpenIdConfiguration)(discovery).pipe(
    Effect.mapError(() => unavailable("Unexpected sign-in configuration")),
  );
  const form = { grant_type: "refresh_token", refresh_token: entry.refresh_token, client_id: entry.oidc_client_id };
  const token = yield* renew(
    configuration.token_endpoint,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: Object.entries(form)
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join("&"),
    },
    grokSignIn,
  );
  const stored = JSON.parse(text);
  stored[id] = {
    ...stored[id],
    key: token.access_token,
    refresh_token: token.refresh_token ?? entry.refresh_token,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };
  yield* host.writeFile(grokAuthFile, JSON.stringify(stored, null, 2)).pipe(Effect.mapError((error) => unavailable(error.message)));
  return token.access_token;
});

const grok = Effect.gen(function* () {
  const text = yield* host.readFile(grokAuthFile).pipe(Effect.mapError(() => signedOut(grokSignIn)));
  const entries = Object.entries(
    yield* Schema.decodeUnknownEffect(GrokAuth)(text).pipe(Effect.mapError(() => unavailable("grok's credentials are unreadable"))),
  );
  const [id, entry] = entries.find(([, each]) => each.auth_mode === "oidc") ?? entries[0] ?? [];
  if (!id || !entry?.key) return yield* Effect.fail(signedOut(grokSignIn));
  const expires = time(entry.expires_at);
  const key = expires !== null && expired(expires) ? yield* refreshGrok(text, id, entry) : entry.key;
  const body = yield* request(
    "https://cli-chat-proxy.grok.com/v1/billing?format=credits",
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
    grokSignIn,
  );
  const { config } = yield* Schema.decodeUnknownEffect(GrokBilling)(body).pipe(Effect.mapError(() => unavailable("Unexpected billing response")));
  const start = time(config.currentPeriod.start);
  const resetsAt = time(config.currentPeriod.end);
  const window: Window = {
    label: periodLabel(config.currentPeriod.type),
    percent: config.creditUsagePercent,
    resetsAt,
    period: start !== null && resetsAt !== null ? resetsAt - start : null,
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
