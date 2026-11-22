import { Effect, Schema, host } from "gary:effect";
import type { HostError } from "gary:effect";
import type { Topic } from "./topic";

class MenuError extends Schema.TaggedError<MenuError>()("MenuError", { message: Schema.String }) {}

const ThemeReply = Schema.fromJsonString(Schema.Struct({ error: Schema.optional(Schema.String) }));

let status: Topic = { recording: false, awake: false };

function publish(next: Partial<Topic>) {
  return Effect.suspend(() => {
    status = { ...status, ...next };
    return host.publish(status);
  });
}

function desktop(name: string, extension: string) {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  return `~/Desktop/${name} ${date} at ${two(now.getHours())}.${two(now.getMinutes())}.${two(now.getSeconds())}.${extension}`;
}

function preview(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

function open(target: string) {
  return Effect.asVoid(host.exec(["/usr/bin/open", target]));
}

function toast(card: Gary.Toast, onClick: Effect.Effect<void, unknown> = Effect.void) {
  return host.toast(card).pipe(
    Effect.flatMap((outcome) => (outcome === "clicked" ? onClick : Effect.void)),
    Effect.catch(() => Effect.void),
    Effect.forkDetach,
    Effect.asVoid,
  );
}

const clear = host.hide().pipe(Effect.andThen(Effect.sleep("250 millis")));

const select = clear.pipe(Effect.andThen(host.screen.select()));

const mainDisplay: Gary.ScreenArea = { display: null };

const screenshot = Effect.fn("Menu.screenshot")(function* (area: Gary.ScreenArea | null) {
  if (!area) return;
  const path = yield* host.screen.capture(area, { path: desktop("Screenshot", "png"), clipboard: true });
  yield* toast({ title: "Screenshot copied", body: "Saved to the Desktop", icon: "camera.viewfinder" }, open(path));
});

const record = Effect.fn("Menu.record")(function* (area: Gary.ScreenArea | null, audio: boolean) {
  if (!area) return;
  yield* host.screen.record(area, desktop("Screen Recording", "mov"), { audio });
  yield* publish({ recording: true });
  yield* toast({ title: "Recording", body: "Stop it from the menu", icon: "record.circle" });
});

const stopRecording = Effect.gen(function* () {
  const path = yield* host.screen.stopRecording();
  yield* publish({ recording: false });
  if (path) yield* toast({ title: "Recording saved", body: "Saved to the Desktop", icon: "film" }, open(path));
});

const pickColor = Effect.gen(function* () {
  yield* clear;
  const color = yield* host.colorpicker.pick();
  if (!color) return;
  yield* host.clipboard.writeText(color);
  yield* toast({ title: "Color copied", body: color, icon: "eyedropper" });
});

const readText = Effect.gen(function* () {
  const area = yield* select;
  if (!area) return;
  const text = (yield* host.vision.readText(area)).trim();
  if (!text) return yield* toast({ title: "No text found", icon: "text.viewfinder" });
  yield* host.clipboard.writeText(text);
  yield* toast({ title: "Text copied", body: preview(text), icon: "text.viewfinder" });
});

const readCode = Effect.gen(function* () {
  const area = yield* select;
  if (!area) return;
  const payloads = (yield* host.vision.readCodes(area)).flatMap((code) => (code.symbology === "qr" && code.payload ? [code.payload] : []));
  if (!payloads.length) return yield* toast({ title: "No QR code found", icon: "qrcode.viewfinder" });
  yield* host.clipboard.writeText(payloads.join("\n"), true);
  yield* toast({ title: "QR code copied", icon: "qrcode.viewfinder" });
});

const theme = Effect.fn("Menu.theme")(function* (...args: string[]) {
  const result = yield* host.exec(["gary", "call", "sndrgrdn.theme", ...args]);
  if (result.status !== 0) return yield* new MenuError({ message: (result.stderr || result.stdout).trim() });
  const reply = yield* Schema.decodeUnknownEffect(ThemeReply)(result.stdout).pipe(
    Effect.mapError(() => new MenuError({ message: `Theme replied ${result.stdout.trim()}` })),
  );
  if (reply.error) return yield* new MenuError({ message: reply.error });
});

const toggleAwake = Effect.gen(function* () {
  const awake = !status.awake;
  yield* host.power.stayAwake(awake ? "display" : "off");
  yield* publish({ awake });
  yield* toast(awake
    ? { title: "Staying awake", body: "The Mac and its display won't sleep", icon: "cup.and.saucer.fill" }
    : { title: "Sleep allowed", icon: "cup.and.saucer" });
});

const commands = {
  "screenshot-region": select.pipe(Effect.flatMap(screenshot)),
  "screenshot-display": clear.pipe(Effect.andThen(screenshot(mainDisplay))),
  "record-region": select.pipe(Effect.flatMap((area) => record(area, false))),
  "record-display": clear.pipe(Effect.andThen(record(mainDisplay, false))),
  "record-display-audio": clear.pipe(Effect.andThen(record(mainDisplay, true))),
  "record-stop": stopRecording,
  color: pickColor,
  text: readText,
  qr: readCode,
  theme: Effect.andThen(host.hide(), theme("picker")),
  "background-next": theme("background", "next"),
  "background-previous": theme("background", "previous"),
  awake: toggleAwake,
  lock: clear.pipe(Effect.andThen(host.power.lock())),
  sleep: clear.pipe(Effect.andThen(host.power.sleep())),
  "log-out": clear.pipe(Effect.andThen(host.power.logOut())),
  restart: clear.pipe(Effect.andThen(host.power.restart())),
  "shut-down": clear.pipe(Effect.andThen(host.power.shutDown())),
} satisfies Record<string, Effect.Effect<unknown, HostError | MenuError>>;

export type Command = keyof typeof commands;

function isCommand(name: string): name is Command {
  return Object.hasOwn(commands, name);
}

function perform(name: Command) {
  const command: Effect.Effect<unknown, HostError | MenuError> = commands[name];
  return command.pipe(
    Effect.catch((error) => Effect.andThen(
      host.log(`${name} failed: ${error.message}`),
      toast({ title: "Menu action failed", body: error.message, icon: "exclamationmark.triangle" }),
    )),
  );
}

export default {
  effect: publish({}),

  onHotkey(id) {
    if (id === "open") return host.toggle();
  },

  methods: {
    run(name = "") {
      if (!isCommand(name)) return Effect.fail(new MenuError({ message: `usage: run <${Object.keys(commands).join(" | ")}>` }));
      Effect.runFork(perform(name));
      return name;
    },
    state: () => status,
  },
} satisfies Gary.Service;
