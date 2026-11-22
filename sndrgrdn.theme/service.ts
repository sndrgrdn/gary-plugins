import { Effect, Exit, Option, Schema, Scope, Semaphore, Stream, host as lifted, topic } from "gary:effect";
import type { HostError } from "gary:effect";

type Palette = Record<string, string>;
type Mode = "light" | "dark";
type Theme = { id: string; name: string; files: Record<string, string>; palette: Palette; mode: Mode; backgrounds: string[] };
type ThemeState = { backgrounds: Record<string, number>; theme?: string };
type TargetResult = { message?: string; status: "applied" | "skipped" | "failed"; target: string };
type ApplyReport = { background?: string; results: TargetResult[]; theme: string };
type Applied = { theme: Theme; background: string | null; notes: string[] };
type Failed = ThemeError | HostError;
type Target = { name: string; installed: Effect.Effect<boolean, HostError>; apply(applied: Applied): Effect.Effect<void, Failed> };

class ThemeError extends Schema.TaggedError<ThemeError>()("ThemeError", { message: Schema.String }) {}

const StateFile = Schema.Struct({
  backgrounds: Schema.Record(Schema.String, Schema.Int),
  theme: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
const isObject = Schema.is(JsonObject);
const parseState = Schema.decodeUnknownOption(Schema.fromJsonString(StateFile));
const parseObject = Schema.decodeUnknownOption(Schema.fromJsonString(JsonObject));
const parseRegistry = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(JsonObject)));

const { exec, log, mkdir, readFile, remove, wallpaper, watchFile, writeFile } = lifted;
const lock = Semaphore.makeUnsafe(1);
const lifetime = Effect.runSync(Scope.make());

let home = "";
let paths = makePaths("");
let searchPath: string[] = [];
let templates: { name: string; text: string }[] = [];
let themes: Theme[] = [];
let busy: string | null = null;
const previews: Record<string, string> = {};
const failedInstalls = new Set<string>();

function makePaths(home: string) {
  const support = `${home}/Library/Application Support/Theme Switcher`;
  return {
    support,
    omarchy: `${support}/omarchy`,
    officialThemes: `${support}/omarchy/themes`,
    userThemes: `${home}/.config/theme-switcher/themes`,
    current: `${support}/current`,
    next: `${support}/next`,
    state: `${support}/state.json`,
    backups: `${support}/backups`,
    log: `${support}/apply.log`,
    palette: `${home}/.config/gary/palette.toml`,
    previews: `${home}/Library/Caches/sndrgrdn.theme/previews`,
  };
}

function detach<A, E>(effect: Effect.Effect<A, E>) {
  return Effect.asVoid(Effect.forkIn(effect, lifetime));
}

function field(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}

function dirname(path: string) {
  return path.slice(0, path.lastIndexOf("/")) || "/";
}

function basename(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function list(path: string): Gary.FileEntry[] | null {
  try {
    return host.list(path);
  } catch {
    return null;
  }
}

function exists(path: string) {
  return list(dirname(path))?.some((entry) => entry.name === basename(path)) ?? false;
}

function read(path: string): string | null {
  try {
    return host.readFile(path);
  } catch {
    return null;
  }
}

const which = Effect.fn("Theme.which")(function* (command: string) {
  if (command.startsWith("/")) return (yield* exec(["/bin/test", "-x", command])).status === 0 ? command : null;
  const found = yield* exec(["/bin/sh", "-c", 'for d in "$@"; do [ -f "$d/$0" ] && [ -x "$d/$0" ] && { echo "$d/$0"; exit 0; }; done; exit 1', command, ...searchPath]);
  return found.status === 0 ? found.stdout.trim() : null;
});

function onPath(command: string) {
  return Effect.map(which(command), (found) => found !== null);
}

const run = Effect.fn("Theme.run")(function* (command: string, args: string[]) {
  const executable = yield* which(command);
  if (!executable) return yield* new ThemeError({ message: `${command} not found` });
  const result = yield* exec(["/usr/bin/env", `PATH=${searchPath.join(":")}`, executable, ...args]);
  const text = (result.stdout + result.stderr).trim();
  if (result.status !== 0) return yield* new ThemeError({ message: `${command} ${args[0] ?? ""} exited ${result.status}: ${text}` });
  return text;
});

const signal = Effect.fn("Theme.signal")(function* (name: string, process: string, onlyWithTerminal = false) {
  const ps = yield* exec(["/bin/ps", "-axo", "pid=,tty=,ucomm="]);
  const pids = ps.stdout.split("\n").map((line) => line.trim().split(/\s+/)).filter(([pid, tty, comm]) =>
    pid && comm === process && (!onlyWithTerminal || tty !== "??")).map(([pid]) => pid);
  if (pids.length) yield* exec(["/bin/kill", `-${name}`, ...pids]);
});

function timestamp() {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " +0000");
}

function appendLog(lines: string[]) {
  return exec(["/bin/sh", "-c", 'printf "%s" "$1" >> "$2"', "sh", lines.map((line) => line + "\n").join(""), paths.log]);
}

const Palettes = {
  parse(text: string): Palette {
    const colors: Palette = {};
    for (const line of text.split("\n")) {
      const equals = line.indexOf("=");
      const key = (equals < 0 ? line : line.slice(0, equals)).replace(/["' ]/g, "");
      if (!key || key.startsWith("#")) continue;
      let value = equals < 0 ? "" : line.slice(equals + 1);
      const open = value.search(/["']/);
      if (open >= 0) {
        value = value.slice(open + 1);
        const close = value.search(/["']/);
        if (close >= 0) value = value.slice(0, close);
      } else {
        value = value.replace(/^[ \t]+|[ \t]+$/g, "");
      }
      if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
      if (!/^[A-Za-z0-9#(),._+/% -]*$/.test(value)) continue;
      colors[key] = value;
    }
    return colors;
  },

  resolve(c: Palette, lightModeFile: boolean) {
    const has = (key: string) => !!c[key];
    const get = (key: string) => c[key] ?? "";
    const firstSet = (...keys: string[]) => { const key = keys.find(has); return key ? get(key) : ""; };
    const alias = (key: string, fallback: string) => { if (!has(key)) c[key] = get(fallback); };
    const derive = (key: string, value: () => string) => { if (!has(key)) c[key] = value(); };

    const legacyPaletteAlias: Record<string, string> = {
      background: "bg", dark_background: "dark_bg", darker_background: "darker_bg", lighter_background: "lighter_bg",
      foreground: "fg", dark_foreground: "dark_fg", light_foreground: "light_fg", bright_foreground: "bright_fg",
    };
    for (const [key, short] of Object.entries(legacyPaletteAlias)) alias(key, short);

    derive("background", () => get("color0"));
    derive("foreground", () => get("color7"));
    if (has("background")) c.color0 = get("background");
    if (has("foreground")) c.color7 = get("foreground");

    const legacyAlias: Record<string, string> = {
      red: "color1", green: "color2", yellow: "color3", blue: "color4", magenta: "color5", cyan: "color6",
      bright_red: "color9", bright_green: "color10", bright_yellow: "color11", bright_blue: "color12",
      bright_magenta: "color13", bright_cyan: "color14",
    };
    for (const [key, ansi] of Object.entries(legacyAlias)) alias(key, ansi);
    alias("magenta", "purple");
    alias("bright_magenta", "bright_purple");

    derive("light_foreground", () => firstSet("color7", "foreground"));
    derive("bright_foreground", () => firstSet("color15", "foreground"));
    c.cursor = get("bright_foreground");
    derive("lighter_background", () => firstSet("color0", "background"));
    derive("dark_foreground", () => firstSet("color8", "foreground"));
    derive("muted", () => firstSet("color8", "dark_foreground"));
    derive("selection", () => firstSet("selection_background", "color8", "color0", "background"));
    derive("selection_background", () => get("selection"));
    derive("selection_foreground", () => get("bright_foreground"));
    derive("orange", () => get("yellow"));
    derive("brown", () => Palettes.mix(get("orange"), "#000000", "50%"));

    derive("dark_background", () => Palettes.mix(get("background"), "#000000", "25%"));
    derive("darker_background", () => Palettes.mix(get("background"), "#000000", "50%"));
    for (const key of ["red", "yellow", "green", "cyan", "blue", "magenta"]) {
      derive(`bright_${key}`, () => Palettes.mix(get(key), "#ffffff", "20%"));
    }
    alias("purple", "magenta");
    alias("bright_purple", "bright_magenta");

    const ansiAlias: Record<string, string> = {
      color0: "background", color1: "red", color2: "green", color3: "yellow", color4: "blue", color5: "magenta",
      color6: "cyan", color7: "foreground", color8: "muted", color9: "bright_red", color10: "bright_green",
      color11: "bright_yellow", color12: "bright_blue", color13: "bright_magenta", color14: "bright_cyan",
      color15: "bright_foreground",
    };
    for (const [key, semantic] of Object.entries(ansiAlias)) alias(key, semantic);
    alias("accent", "color4");

    for (const [key, short] of Object.entries(legacyPaletteAlias)) if (has(key)) c[short] = get(key);

    if (!has("mode")) c.mode = get("theme_type");
    if (!has("mode")) {
      const rgb = Palettes.rgb(get("background"));
      c.mode = lightModeFile ? "light" : rgb ? (rgb[0] + rgb[1] + rgb[2] > 382 ? "light" : "dark") : "dark";
    }
    c.theme_type = get("mode");
  },

  isHex(value: string) {
    return /^#[0-9a-fA-F]{6}$/.test(value);
  },

  rgb(hex: string): [number, number, number] | null {
    if (!Palettes.isHex(hex)) return null;
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  },

  mix(start: string, end: string, amount: string) {
    const number = (text: string) => (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? Number(text) : 0);
    let fraction: number;
    if (amount.endsWith("%")) {
      fraction = number(amount.slice(0, -1)) / 100;
    } else {
      fraction = number(amount);
      if (fraction > 1) fraction /= 100;
    }
    fraction = Math.min(Math.max(fraction, 0), 1);
    const a = Palettes.channels(start), b = Palettes.channels(end);
    const mixed = a.map((value, i) => Math.trunc(value * (1 - fraction) + b[i] * fraction + 0.5));
    return "#" + mixed.map((value) => (value >>> 0).toString(16).padStart(2, "0")).join("");
  },

  channels(color: string) {
    const hex = (color.startsWith("#") ? color.slice(1) : color).toLowerCase();
    const digit = (i: number) => (i < hex.length && /[0-9a-f]/.test(hex[i]) ? parseInt(hex[i], 16) : -1);
    return [0, 2, 4].map((i) => digit(i) * 16 + digit(i + 1));
  },
};

function renderer(palette: Palette) {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(palette)) {
    values.set(`{{ ${key} }}`, value);
    values.set(`{{ ${key}_strip }}`, value.startsWith("#") ? value.slice(1) : value);
    const rgb = Palettes.rgb(value);
    if (rgb) values.set(`{{ ${key}_rgb }}`, rgb.join(","));
  }
  const mixPattern = /^\{\{\s*(mix|mix_strip|mix_rgb)\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)\s+([0-9]+(?:\.[0-9]+)?%?)\s*\}\}$/;
  const mixValue = (token: string) => {
    const match = mixPattern.exec(token);
    if (!match) return undefined;
    const start = palette[match[2]], end = palette[match[3]];
    if (start === undefined || end === undefined || !Palettes.isHex(start) || !Palettes.isHex(end)) return undefined;
    const mixed = Palettes.mix(start, end, match[4]);
    if (match[1] === "mix_strip") return mixed.slice(1);
    if (match[1] === "mix_rgb") return Palettes.rgb(mixed)!.join(",");
    return mixed;
  };
  return (template: string) => {
    let out = "";
    let index = 0;
    for (;;) {
      const open = template.indexOf("{{", index);
      if (open < 0) break;
      const close = template.indexOf("}}", open + 2);
      if (close < 0) break;
      const token = template.slice(open, close + 2);
      const value = values.get(token) ?? mixValue(token);
      if (value !== undefined) {
        out += template.slice(index, open) + value;
        index = close + 2;
      } else {
        out += template.slice(index, open + 1);
        index = open + 1;
      }
    }
    return out + template.slice(index);
  };
}

const Library = {
  imageExtensions: new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic"]),

  load(): Theme[] {
    const ids = new Set([...Library.subdirectories(paths.officialThemes), ...Library.subdirectories(paths.userThemes)]);
    return [...ids].sort().map(Library.theme).filter((theme): theme is Theme => theme !== null);
  },

  theme(id: string): Theme | null {
    const directories = [paths.officialThemes, paths.userThemes].map((root) => `${root}/${id}`)
      .map((directory) => ({ directory, entries: list(directory) }))
      .filter((each): each is { directory: string; entries: Gary.FileEntry[] } => each.entries !== null);
    const files: Record<string, string> = {};
    for (const { directory, entries } of directories) for (const entry of entries) files[entry.name] = `${directory}/${entry.name}`;
    const colors = files["colors.toml"] && read(files["colors.toml"]);
    if (colors == null) return null;
    const lightMode = directories.some(({ entries }) => entries.some((entry) => entry.name === "light.mode"));
    const palette = Palettes.parse(colors);
    Palettes.resolve(palette, lightMode);

    const backgrounds: Record<string, string> = {};
    for (const { directory } of directories) {
      for (const entry of list(`${directory}/backgrounds`) ?? []) {
        const dot = entry.name.lastIndexOf(".");
        if (dot > 0 && Library.imageExtensions.has(entry.name.slice(dot + 1).toLowerCase())) {
          backgrounds[entry.name] = `${directory}/backgrounds/${entry.name}`;
        }
      }
    }
    return {
      id, name: Library.displayName(id), files, palette, mode: palette.mode === "light" ? "light" : "dark",
      backgrounds: Object.keys(backgrounds).sort().map((name) => backgrounds[name]),
    };
  },

  displayName(id: string) {
    return id.split("-").map((word) => (word && word[0] !== word[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word)).join(" ");
  },

  normalize(name: string) {
    const stripped = name.replace(/<[^>]+>/g, "");
    if (themes.some((theme) => theme.id === stripped)) return stripped;
    return stripped.toLowerCase().replace(/ /g, "-");
  },

  subdirectories(path: string) {
    return (list(path) ?? [])
      .filter((entry) => entry.type === "directory" || (entry.type === "link" && list(`${path}/${entry.name}`) !== null))
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."));
  },
};

const syncLibrary = Effect.fn("Theme.syncLibrary")(function* () {
  if (exists(`${paths.omarchy}/.git`)) {
    yield* run("git", ["-C", paths.omarchy, "fetch", "--depth", "1", "--filter=blob:none", "origin", "HEAD"]);
    yield* run("git", ["-C", paths.omarchy, "reset", "--hard", "FETCH_HEAD"]);
  } else {
    const staging = `${paths.support}/omarchy.clone`;
    yield* mkdir(paths.support);
    yield* remove(staging);
    yield* run("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "https://github.com/basecamp/omarchy.git", staging]);
    yield* run("git", ["-C", staging, "sparse-checkout", "set", "themes"]);
    yield* run("mv", [staging, paths.omarchy]);
  }
});

const State = {
  load(): ThemeState {
    const parsed = parseState(read(paths.state) ?? "");
    if (Option.isNone(parsed)) return { backgrounds: {} };
    const { backgrounds, theme } = parsed.value;
    return theme ? { backgrounds: { ...backgrounds }, theme } : { backgrounds: { ...backgrounds } };
  },

  save(state: ThemeState) {
    return Effect.andThen(mkdir(paths.support), writeFile(paths.state, JSON.stringify(state)));
  },
};

const realpath = Effect.fn("Theme.realpath")(function* (path: string) {
  const result = yield* exec(["/usr/bin/realpath", path]);
  return result.status === 0 ? result.stdout.trim() : path;
});

const backUp = Effect.fn("Theme.backUp")(function* (path: string) {
  const backup = `${paths.backups}/${path.replace(/\//g, "%")}`;
  if (!exists(path) || exists(backup)) return;
  yield* mkdir(paths.backups);
  const copied = yield* exec(["/bin/cp", path, backup]);
  if (copied.status !== 0) return yield* new ThemeError({ message: copied.stderr.trim() });
});

const write = Effect.fn("Theme.write")(function* (text: string, path: string) {
  const target = exists(path) ? yield* realpath(path) : path;
  yield* mkdir(dirname(target));
  yield* backUp(target);
  yield* writeFile(target, text);
});

function setJSONString(key: string, value: string, text: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`("${escaped}"\\s*:\\s*")[^"]*(")`);
  if (pattern.test(text)) return text.replace(pattern, (_, before, after) => before + value + after);

  const brace = text.indexOf("{");
  if (brace < 0) return `{\n  "${key}": "${value}"\n}\n`;
  const head = text.slice(0, brace + 1), rest = text.slice(brace + 1);
  if (rest.trim().startsWith("}")) return `${head}\n  "${key}": "${value}"\n` + rest.replace(/^\s+/, "");
  const second = rest.split("\n")[1];
  const indent = second === undefined ? "  " : second.match(/^[ \t]*/)![0];
  return `${head}\n${indent}"${key}": "${value}",` + rest;
}

function pretty(value: unknown, indent = ""): string {
  const inner = indent + "  ";
  if (Array.isArray(value)) {
    return `[\n${value.map((each) => inner + pretty(each, inner)).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const object = value as Record<string, unknown>;
    return `{\n${keys.map((key) => `${inner}${JSON.stringify(key)} : ${pretty(object[key], inner)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

const setTheme = Effect.fn("Theme.setTheme")(function* (theme: string, settings: string) {
  const text = read(settings) ?? "{\n}\n";
  const updated = setJSONString("theme", theme, text);
  if (Option.getOrUndefined(parseObject(updated))?.theme !== theme) return yield* new ThemeError({ message: `could not set theme in ${settings}` });
  if (updated !== text) yield* write(updated, settings);
});

function currentFile(name: string) {
  return `${paths.current}/${name}`;
}

function copyCurrent(name: string, path: string) {
  return readFile(currentFile(name)).pipe(Effect.flatMap((text) => write(text, path)));
}

const heliumBundle = "net.imput.helium";
const heliumHelper = "/Library/PrivilegedHelperTools/garden.sander.theme-switcher.helium";

function jxa(script: string) {
  return exec(["/usr/bin/osascript", "-l", "JavaScript", "-e", script]);
}

const targets: Target[] = [
  {
    name: "macOS appearance",
    installed: Effect.succeed(true),
    apply: Effect.fn("Theme.macOSAppearance")(function* ({ theme }: Applied) {
      const source = `tell application "System Events" to tell appearance preferences to set dark mode to ${theme.mode === "dark"}`;
      const result = yield* exec(["/usr/bin/osascript", "-e", source]);
      if (result.status === 0) return;
      if (/\(-1743\)/.test(result.stderr)) {
        return yield* new ThemeError({ message: "Allow Gary to control System Events in System Settings › Privacy & Security › Automation" });
      }
      return yield* new ThemeError({
        message: result.stderr.trim().replace(/^\d+:\d+: execution error: /, "").replace(/ \(-?\d+\)$/, "") || "AppleScript failed",
      });
    }),
  },
  {
    name: "Wallpaper",
    installed: Effect.succeed(true),
    apply: Effect.fn("Theme.wallpaper")(function* ({ theme, background }: Applied) {
      if (!background) return yield* new ThemeError({ message: `${theme.name} has no backgrounds` });
      yield* wallpaper.set(background);
    }),
  },
  {
    name: "dinky",
    installed: Effect.sync(() => exists(`${home}/.config/dinky/dinky.toml`)),
    apply: Effect.fn("Theme.dinky")(function* ({ theme }: Applied) {
      const config = `${home}/.config/dinky/dinky.toml`;
      const strip = (color?: string) => (color ?? "").replace(/^#+/, "");
      const colors: Record<string, string> = {
        "active-color": `#${strip(theme.palette.accent)}ff`,
        "inactive-color": `#${strip(theme.palette.muted)}aa`,
      };
      const text = yield* readFile(config);
      let section = "";
      const replaced = new Set<string>();
      const lines = text.split("\n").map((line) => {
        const trimmed = line.replace(/^[ \t]+|[ \t]+$/g, "");
        if (trimmed.startsWith("[")) {
          section = trimmed.replace(/^[[\]]+|[[\]]+$/g, "");
          return line;
        }
        const key = section === "borders" ? Object.keys(colors).find((each) => new RegExp(`^${each}\\s*=`).test(trimmed)) : undefined;
        if (!key) return line;
        replaced.add(key);
        return line.match(/^[ \t]*/)![0] + `${key} = '${colors[key]}'`;
      });
      if (replaced.size !== Object.keys(colors).length) return yield* new ThemeError({ message: "dinky.toml [borders] lacks active-color or inactive-color" });
      const updated = lines.join("\n");
      if (updated !== text) yield* write(updated, config);
    }),
  },
  {
    name: "Rex",
    installed: onPath("rex"),
    apply: Effect.fn("Theme.rex")(function* ({ theme }: Applied) {
      const backup = `${paths.backups}/com.superlogical.rex.plist`;
      if (!exists(backup)) {
        yield* mkdir(paths.backups);
        yield* run("defaults", ["export", "com.superlogical.rex", backup]);
      }
      const file = `${paths.support}/rex/Omarchy ${theme.name}`;
      yield* mkdir(dirname(file));
      yield* remove(file);
      yield* writeFile(file, yield* readFile(currentFile("ghostty.conf")));
      yield* run("rex", ["do", "client.theme.import", `path=${file}`]);
      yield* run("rex", ["do", "client.setting.interface.appearance.scheme", `value=${theme.mode}`]);
    }),
  },
  cursorTarget(),
  {
    name: "pi",
    installed: Effect.sync(() => exists(`${home}/.pi/agent`)),
    apply: Effect.fn("Theme.pi")(function* () {
      const agent = `${home}/.pi/agent`;
      yield* copyCurrent("pi.json", `${agent}/themes/omarchy-system.json`);
      yield* setTheme("omarchy-system", `${agent}/settings.json`);
    }),
  },
  {
    name: "Claude Code",
    installed: Effect.sync(() => exists(`${home}/.claude`)),
    apply: Effect.fn("Theme.claudeCode")(function* () {
      const config = `${home}/.claude`;
      yield* copyCurrent("claude.json", `${config}/themes/omarchy.json`);
      yield* setTheme("custom:omarchy", `${config}/settings.json`);
    }),
  },
  {
    name: "OpenCode",
    installed: Effect.sync(() => exists(`${home}/.config/opencode`)),
    apply: Effect.fn("Theme.openCode")(function* () {
      const config = `${home}/.config/opencode`;
      yield* copyCurrent("opencode.json", `${config}/themes/omarchy.json`);
      const cli = `${config}/cli.json`;
      const text = read(cli);
      const parsed = text === null ? Option.some({}) : parseObject(text);
      if (Option.isNone(parsed)) return yield* new ThemeError({ message: `could not parse ${cli}` });
      const settings: Record<string, unknown> = { ...parsed.value };
      const current = settings.theme;
      const theme: Record<string, unknown> = isObject(current) ? { ...current } : {};
      if (theme.name !== "omarchy") {
        theme.name = "omarchy";
        settings.theme = theme;
        yield* write(pretty(settings) + "\n", cli);
      }
      yield* signal("USR2", "opencode", true);
    }),
  },
  {
    name: "Herdr",
    installed: Effect.sync(() => exists(`${home}/.config/herdr-app`)),
    apply: Effect.fn("Theme.herdr")(function* () {
      const app = `${home}/.config/herdr-app`;
      yield* copyCurrent("herdr-app.json", `${app}/themes/omarchy.json`);
      yield* setTheme("omarchy", `${app}/settings.json`);
    }),
  },
  {
    name: "Ghostty",
    installed: Effect.sync(() => ["/Applications", `${home}/Applications`].some((folder) => exists(`${folder}/Ghostty.app`))),
    apply: Effect.fn("Theme.ghostty")(function* () {
      const directories = [`${home}/.config/ghostty`, `${home}/Library/Application Support/com.mitchellh.ghostty`];
      const config = directories.flatMap((directory) => [`${directory}/config.ghostty`, `${directory}/config`]).find(exists)
        ?? `${home}/.config/ghostty/config`;
      const line = `theme = "${currentFile("ghostty.conf")}"`;
      const text = read(config) ?? "";
      const lines = text.split("\n");
      let replaced = false;
      lines.forEach((existing, index) => {
        if (/^\s*theme\s*=/.test(existing)) {
          lines[index] = line;
          replaced = true;
        }
      });
      if (!replaced) {
        if (lines[lines.length - 1] === "") lines.pop();
        lines.push(line, "");
      }
      const updated = lines.join("\n");
      if (updated !== text) yield* write(updated, config);
      yield* signal("USR2", "ghostty");
    }),
  },
  {
    name: "Hunk",
    installed: onPath("hunk"),
    apply: Effect.fn("Theme.hunk")(function* () {
      yield* signal("WINCH", "hunk");
      yield* detach(Effect.delay(signal("WINCH", "hunk"), "1 second"));
    }),
  },
  {
    name: "Helium",
    installed: Effect.map(
      jxa(`ObjC.import("AppKit"); var url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier("${heliumBundle}"); url.isNil() ? "" : url.path.js`),
      (found) => found.status === 0 && found.stdout.trim() !== "",
    ),
    apply: Effect.fn("Theme.helium")(function* ({ theme }: Applied) {
      const sudoers = list("/etc/sudoers.d")?.some((entry) => entry.name === "theme-switcher-helium") ?? false;
      const installed = read(heliumHelper);
      if (!sudoers || installed === null) return yield* new ThemeError({ message: "Run theme-switcher helium setup to let Theme Switcher colour Helium" });
      if (installed !== (yield* readFile("helium-helper.sh"))) {
        return yield* new ThemeError({ message: "Run theme-switcher helium setup again to update the Helium helper" });
      }
      yield* run("sudo", ["-n", heliumHelper, heliumColor(theme)]);
      const running = yield* jxa(`ObjC.import("AppKit");
        ObjC.bindFunction("_CFPreferencesManagementStatusChangedForDomains", ["void", ["id"]]);
        $._CFPreferencesManagementStatusChangedForDomains($(["${heliumBundle}"]));
        var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("${heliumBundle}"), out = [];
        for (var i = 0; i < apps.count; i++) { var url = apps.objectAtIndex(i).executableURL; if (!url.isNil()) out.push(url.path.js); }
        out.join("\\n")`);
      for (const executable of running.stdout.split("\n").filter(Boolean)) {
        yield* Effect.ignore(run(executable, ["--refresh-platform-policy", "--no-startup-window"]));
      }
    }),
  },
];

function heliumColor(theme: Theme) {
  const file = theme.files["chromium.theme"] && read(theme.files["chromium.theme"]);
  if (file != null) {
    const channels = file.split(",").map((each) => each.trim());
    if (channels.length === 3 && channels.every((each) => /^[+-]?\d+$/.test(each))) {
      return "#" + channels.map((each) => (Number(each) >>> 0).toString(16).padStart(2, "0")).join("");
    }
  }
  const background = theme.palette.background;
  return background && Palettes.isHex(background) ? background.toLowerCase() : "#1c2027";
}

function cursorTarget(): Target {
  const settings = () => `${home}/Library/Application Support/Cursor/User/settings.json`;
  const extensions = () => `${home}/.cursor/extensions`;
  const generatedName = "omarchy-theme";
  const generatedID = "local.omarchy-theme";
  const registry = () => Option.getOrElse(parseRegistry(read(`${extensions()}/extensions.json`) ?? ""), () => []);
  const obsolete = () => ({ ...Option.getOrElse(parseObject(read(`${extensions()}/.obsolete`) ?? ""), () => ({})) });

  const isInstalled = (id: string) => {
    const gone = obsolete();
    return registry().some((entry) => {
      const entryID = field(entry.identifier, "id");
      if (typeof entryID !== "string" || entryID.toLowerCase() !== id.toLowerCase()) return false;
      const locationPath = field(entry.location, "path") ?? field(entry.location, "fsPath");
      const relative = typeof entry.relativeLocation === "string" ? entry.relativeLocation
        : typeof locationPath === "string" ? basename(locationPath.replace(/\/+$/, "")) : "";
      return relative !== "" && !(relative in gone) && exists(`${extensions()}/${relative}`);
    });
  };

  const extensionTheme = Effect.fn("Theme.cursorExtension")(function* (applied: Applied) {
    const descriptor = applied.theme.files["vscode.json"];
    if (!descriptor) return null;
    const text = yield* readFile(descriptor);
    const json: unknown = yield* Effect.try({
      try: () => JSON.parse(text),
      catch: (cause) => new ThemeError({ message: cause instanceof Error ? cause.message : String(cause) }),
    });
    const name = field(json, "name");
    if (typeof name !== "string" || !/^[^\p{Cc}"\\]+$/u.test(name)) return yield* new ThemeError({ message: "vscode.json has no usable theme name" });
    const id = field(json, "extension");
    if (typeof id !== "string" || !/^[a-zA-Z0-9._-]+$/.test(id) || isInstalled(id)) return name;
    if (failedInstalls.has(id)) return null;
    return yield* run("cursor", ["--install-extension", id]).pipe(
      Effect.as(name),
      Effect.catch((error) => Effect.sync(() => {
        failedInstalls.add(id);
        applied.notes.push(`  note   Cursor: ${id} failed to install, using the generated Omarchy theme. ${error.message}`);
        return null;
      })),
    );
  });

  const installGenerated = Effect.fn("Theme.cursorGenerated")(function* (theme: string) {
    const data = yield* readFile(theme);
    const type = Option.getOrUndefined(parseObject(data))?.type;
    const bytes = unescape(encodeURIComponent(data));
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes.charCodeAt(i), 16777619) >>> 0;
    const version = `1.0.${hash}`;
    const directory = `${extensions()}/${generatedName}`;
    const manifest = {
      name: generatedName, displayName: "Omarchy", description: "Omarchy color theme",
      publisher: "local", version, engines: { vscode: "^1.70.0" }, categories: ["Themes"],
      contributes: { themes: [{ label: "Omarchy", uiTheme: type === "light" ? "vs" : "vs-dark", path: "./themes/omarchy-color-theme.json", _watch: true }] },
    };
    yield* mkdir(`${directory}/themes`);
    yield* writeFile(`${directory}/themes/omarchy-color-theme.json`, data);
    yield* writeFile(`${directory}/package.json`, pretty(manifest));

    const obsoleteFile = `${extensions()}/.obsolete`;
    const gone = obsolete();
    const key = `${generatedID}-${version}`;
    if (key in gone) {
      delete gone[key];
      yield* backUp(obsoleteFile);
      yield* Object.keys(gone).length === 0 ? remove(obsoleteFile) : writeFile(obsoleteFile, JSON.stringify(gone).replace(/\//g, "\\/"));
    }

    const entry = {
      identifier: { id: generatedID },
      version,
      location: { $mid: 1, fsPath: directory, external: `file://${encodeURI(directory)}/`, path: directory, scheme: "file" },
      relativeLocation: generatedName,
    };
    const entries = [...registry().filter((each) => field(each.identifier, "id") !== generatedID), entry];
    const registryFile = `${extensions()}/extensions.json`;
    yield* backUp(registryFile);
    yield* writeFile(registryFile, JSON.stringify(entries));
  });

  return {
    name: "Cursor",
    installed: onPath("cursor"),
    apply: Effect.fn("Theme.cursor")(function* (applied: Applied) {
      const extension = yield* extensionTheme(applied);
      if (extension === null) yield* installGenerated(currentFile("vscode-theme.json"));
      const colorTheme = extension ?? "Omarchy";
      const preferred = applied.theme.mode === "dark" ? "workbench.preferredDarkColorTheme" : "workbench.preferredLightColorTheme";
      const text = yield* readFile(settings());
      const updated = [preferred, "workbench.colorTheme"].reduce((each, key) => setJSONString(key, colorTheme, each), text);
      if (updated !== text) yield* write(updated, settings());
    }),
  };
}

const stage = Effect.fn("Theme.stage")(function* (theme: Theme) {
  yield* remove(paths.next);
  yield* mkdir(paths.next);
  const render = renderer(theme.palette);
  for (const template of templates) {
    const shipped = theme.files[template.name];
    yield* writeFile(`${paths.next}/${template.name}`, shipped ? yield* readFile(shipped) : render(template.text));
  }
});

const swapStaged = Effect.fn("Theme.swapStaged")(function* () {
  const result = yield* exec(["/bin/sh", "-c", 'rm -rf "$1" && mv "$2" "$1"', "sh", paths.current, paths.next]);
  if (result.status !== 0) return yield* new ThemeError({ message: result.stderr.trim() || "could not move the staged theme into place" });
});

function applyTarget(target: Target, applied: Applied): Effect.Effect<TargetResult> {
  return Effect.gen(function* () {
    const installed = yield* Effect.orElseSucceed(target.installed, () => false);
    if (!installed) return { status: "skipped", target: target.name };
    return yield* Effect.match(target.apply(applied), {
      onSuccess: (): TargetResult => ({ status: "applied", target: target.name }),
      onFailure: (error): TargetResult => ({ message: error.message, status: "failed", target: target.name }),
    });
  });
}

const apply = Effect.fn("Theme.apply")(function* (theme: Theme) {
  const state = State.load();
  let background: string | null = null;
  if (theme.backgrounds.length) {
    const remembered = state.backgrounds[theme.id];
    const index = state.theme === theme.id ? ((remembered ?? -1) + 1) % theme.backgrounds.length
      : Math.min(remembered ?? 0, theme.backgrounds.length - 1);
    state.backgrounds[theme.id] = index;
    background = theme.backgrounds[index];
  }

  yield* stage(theme);
  yield* swapStaged();
  yield* State.save({ backgrounds: state.backgrounds, theme: theme.id });

  const applied: Applied = { theme, background, notes: [] };
  const results = yield* Effect.forEach(targets, (target) => applyTarget(target, applied), { concurrency: "unbounded" });

  yield* appendLog([
    `${timestamp()} ${theme.id} background=${background ? basename(background) : "none"}`,
    ...applied.notes,
    ...results.map((result) => result.status === "skipped" ? `  skip   ${result.target}: not installed`
      : result.status === "failed" ? `  FAILED ${result.target}: ${result.message}` : `  ok     ${result.target}`),
  ]);
  for (const result of results) if (result.status === "failed") yield* log(`${result.target} failed: ${result.message}`);
  const report: ApplyReport = background ? { background: basename(background), results, theme: theme.id } : { results, theme: theme.id };
  return report;
});

const showBackground = Effect.fn("Theme.showBackground")(function* (step: number) {
  const state = State.load();
  const id = state.theme;
  const theme = id ? Library.theme(id) : null;
  if (!id || !theme) return yield* new ThemeError({ message: "no theme applied yet" });
  if (!theme.backgrounds.length) return yield* new ThemeError({ message: `${theme.name} has no backgrounds` });
  const count = theme.backgrounds.length;
  const index = (((state.backgrounds[id] ?? 0) + step) % count + count) % count;
  const background = theme.backgrounds[index];
  state.backgrounds[id] = index;
  yield* State.save({ backgrounds: state.backgrounds, theme: id });
  yield* detach(appendLog([`${timestamp()} ${id} background=${basename(background)}`]));
  yield* detach(wallpaper.set(background).pipe(Effect.catch((error) => log(`Background failed: ${error.message}`))));
  return { background: basename(background), current: id };
});

const followWorkspace = Effect.fn("Theme.followWorkspace")(function* () {
  const state = State.load();
  const id = state.theme;
  const index = id === undefined ? undefined : state.backgrounds[id];
  const background = index === undefined ? undefined : themes.find((each) => each.id === id)?.backgrounds[index];
  if (!background) return;
  const wallpapers = yield* wallpaper.get();
  if (wallpapers.some((each) => each.path !== background)) yield* wallpaper.set(background);
}, Effect.catch((error) => log(`wallpaper follow failed: ${error.message}`)));

function syncPalette(state: string | null) {
  if (!state) return;
  const parsed = parseObject(state);
  if (Option.isNone(parsed)) return;
  const id = parsed.value.theme;
  const theme = typeof id === "string" && id ? themes.find((each) => each.id === id) ?? Library.theme(id) : null;
  const source = theme?.files["colors.toml"] && read(theme.files["colors.toml"]);
  if (!theme || source == null) return host.log(`no colors.toml for ${id}`);
  const colors = source.split("\n").filter((line) => /^\s*[a-z0-9_]+\s*=\s*"(light|dark|#[0-9a-fA-F]{3,8})"\s*$/.test(line)).join("\n") + "\n";
  if (colors === read(paths.palette)) return;
  host.writeFile(paths.palette, colors);
  host.log(`palette.toml follows ${id}`);
  publish();
}

function enqueue<A, E>(label: string, job: Effect.Effect<A, E>) {
  return lock.withPermit(Effect.sync(() => {
    busy = label;
    publish();
  }).pipe(
    Effect.andThen(job),
    Effect.ensuring(Effect.sync(() => {
      busy = null;
      publish();
    })),
  ));
}

function reload() {
  themes = Library.load();
  publish();
}

const warmPreviews = Effect.fn("Theme.warmPreviews")(function* () {
  yield* mkdir(paths.previews);
  const cached = new Set((list(paths.previews) ?? []).map((entry) => entry.name));
  const pending = themes.map((theme) => {
    const source = theme.files["preview.png"] ?? theme.backgrounds[0];
    if (!source) return null;
    const size = list(dirname(source))?.find((entry) => entry.name === basename(source))?.size ?? 0;
    let hash = 2166136261;
    for (const char of `${source}|${size}|${previewSize}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return { id: theme.id, source, file: `${theme.id}-${hash.toString(16)}.jpg` };
  }).filter((each): each is { id: string; source: string; file: string } => each !== null);

  const make = Effect.fnUntraced(function* (each: { id: string; source: string; file: string }) {
    if (!cached.has(each.file)) {
      for (const stale of cached) if (stale.startsWith(`${each.id}-`) && /^[0-9a-f]+\.jpg$/.test(stale.slice(each.id.length + 1))) yield* remove(`${paths.previews}/${stale}`);
      const result = yield* exec(["/usr/bin/sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", "-Z", String(previewSize), each.source, "--out", `${paths.previews}/${each.file}`]);
      if (result.status !== 0) return yield* log(`preview for ${each.id} failed: ${result.stderr.trim()}`);
    }
    previews[each.id] = `${paths.previews}/${each.file}`;
  });
  yield* Effect.forEach(pending, (each) => Effect.andThen(make(each), Effect.sync(publish)), { discard: true });
});

const previewSize = 1536;
const colorKeys = ["background", "foreground", "accent", "red", "yellow", "green", "cyan", "blue", "magenta"];

function publish() {
  const current = State.load().theme ?? null;
  host.publish({
    themes: themes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      mode: theme.mode,
      current: theme.id === current,
      preview: previews[theme.id] ?? null,
      colors: Object.fromEntries(colorKeys.map((key) => [key, theme.palette[key]]).filter(([, value]) => !!value && Palettes.isHex(value))),
    })),
    current,
  });
}

const choose = Effect.fn("Theme.choose")(function* (name: string) {
  reload();
  const id = Library.normalize(name);
  const theme = themes.find((each) => each.id === id);
  if (!theme) return yield* new ThemeError({ message: `no theme named ${name}` });
  const report = yield* enqueue(`Applying ${theme.name}…`, Effect.suspend(() => apply(Library.theme(theme.id) ?? theme))).pipe(
    Effect.tapError((error) => log(`Apply failed: ${error.message}`)),
  );
  return { report };
});

const update = Effect.fn("Theme.update")(function* () {
  yield* enqueue("Updating themes…", syncLibrary()).pipe(
    Effect.tapError((error) => log(`Update failed: ${error.message}`)),
    Effect.ensuring(Effect.suspend(() => {
      reload();
      return detach(warmPreviews());
    })),
  );
  return { themes: themes.length };
});

function background(step: number): Gary.Json {
  if (busy) {
    Effect.runFork(enqueue("Changing background…", showBackground(step)).pipe(Effect.catch((error) => log(`Background failed: ${error.message}`))));
    return { queued: step > 0 ? "next" : "previous" };
  }
  return Effect.runSync(showBackground(step).pipe(Effect.catch((error) => Effect.succeed({ error: error.message }))));
}

const initialize = Effect.fn("Theme.initialize")(function* (path: string) {
  home = path;
  paths = makePaths(home);
  searchPath = [
    "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", `${home}/.local/bin`, `${home}/.hunk/bin`,
    `${home}/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS`,
  ];
  templates = yield* Effect.forEach((list("templates") ?? []).filter((entry) => entry.name.endsWith(".tpl")),
    (entry) => Effect.map(readFile(`templates/${entry.name}`), (text) => ({ name: entry.name.slice(0, -4), text })));
  const started = Date.now();
  reload();
  yield* log(`loaded ${themes.length} themes in ${Date.now() - started} ms`);
});

const start = Effect.gen(function* () {
  yield* Effect.addFinalizer(() => Scope.close(lifetime, Exit.void));
  const printenv = yield* exec(["/usr/bin/printenv", "HOME"]);
  yield* initialize(printenv.stdout.trim());
  if (!themes.length) yield* detach(update());
  syncPalette(read(paths.state));
  yield* watchFile(paths.state, (text) => {
    syncPalette(text);
    publish();
  });
  yield* detach(warmPreviews());
  yield* topic("sndrgrdn.dinky").pipe(
    Stream.map((value) => value.displays.map((display) => display.workspaces.find((each) => each.focused)?.number ?? "").join(",")),
    Stream.changes,
    Stream.drop(1),
    Stream.runForEach(() => followWorkspace()),
  );
}).pipe(Effect.catch((error) => log(`start failed: ${error.message}`)));

function whenReady(body: () => Gary.Json): Gary.Json {
  if (!home) return { error: "Theme is starting" };
  return body();
}

function whenStarted<A>(effect: Effect.Effect<A, Failed>): Promise<A> {
  return home ? Effect.runPromise(effect) : Promise.reject(new ThemeError({ message: "Theme is starting" }));
}

export default {
  effect: start,

  onHotkey(id) {
    if (!home) return;
    if (id === "picker") {
      reload();
      host.toggle();
    }
    if (id === "background") background(1);
  },

  methods: {
    list: () => whenReady(() => {
      reload();
      const current = State.load().theme;
      return { themes: themes.map((theme) => ({ current: theme.id === current, id: theme.id, mode: theme.mode, name: theme.name })) };
    }),
    current: () => whenReady((): Gary.Json => {
      const state = State.load();
      const id = state.theme;
      if (!id) return { error: "no theme applied yet" };
      const backgrounds = themes.find((theme) => theme.id === id)?.backgrounds ?? [];
      const index = state.backgrounds[id];
      const shown = index !== undefined ? backgrounds[index] : undefined;
      return shown ? { background: basename(shown), current: id } : { current: id };
    }),
    set: (...words: string[]) => whenStarted(words.length ? choose(words.join(" ")) : Effect.fail(new ThemeError({ message: "usage: set <theme>" }))),
    background: (direction = "next") => whenReady(() => {
      if (direction !== "next" && direction !== "previous") return { error: "usage: background [next | previous]" };
      return background(direction === "next" ? 1 : -1);
    }),
    update: () => whenStarted(update()),
    picker: () => whenReady(() => {
      reload();
      host.show();
      return {};
    }),
  },
} satisfies Gary.Service;
