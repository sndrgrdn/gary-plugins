type Palette = Record<string, string>;
type Mode = "light" | "dark";
type Theme = { id: string; name: string; files: Record<string, string>; palette: Palette; mode: Mode; backgrounds: string[] };
type ThemeState = { backgrounds: Record<string, number>; theme?: string };
type TargetResult = { message?: string; status: "applied" | "skipped" | "failed"; target: string };
type ApplyReport = { background?: string; results: TargetResult[]; theme: string };
type Applied = { theme: Theme; background: string | null; notes: string[] };
type Target = { name: string; installed(): boolean | Promise<boolean>; apply(applied: Applied): Promise<void> };
type Workspaces = { displays: { uuid: string; workspaces: { number: number; focused: boolean }[] }[] };

let home = "";
let paths = makePaths("");
let searchPath: string[] = [];
let templates: { name: string; text: string }[] = [];
let themes: Theme[] = [];
let queue: Promise<unknown> = Promise.resolve();
let busy: string | null = null;
let focusedWorkspaces = "";
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

class Failure extends Error {}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

function exec(argv: string[]): Promise<Gary.ExecResult> {
  return new Promise((resolve) => host.exec(argv, resolve));
}

async function which(command: string): Promise<string | null> {
  if (command.startsWith("/")) return (await exec(["/bin/test", "-x", command])).status === 0 ? command : null;
  const found = await exec(["/bin/sh", "-c", 'for d in "$@"; do [ -f "$d/$0" ] && [ -x "$d/$0" ] && { echo "$d/$0"; exit 0; }; done; exit 1', command, ...searchPath]);
  return found.status === 0 ? found.stdout.trim() : null;
}

async function run(command: string, args: string[]): Promise<string> {
  const executable = await which(command);
  if (!executable) throw new Failure(`${command} not found`);
  const result = await exec(["/usr/bin/env", `PATH=${searchPath.join(":")}`, executable, ...args]);
  const text = (result.stdout + result.stderr).trim();
  if (result.status !== 0) throw new Failure(`${command} ${args[0] ?? ""} exited ${result.status}: ${text}`);
  return text;
}

async function signal(name: string, process: string, onlyWithTerminal = false) {
  const ps = await exec(["/bin/ps", "-axo", "pid=,tty=,ucomm="]);
  const pids = ps.stdout.split("\n").map((line) => line.trim().split(/\s+/)).filter(([pid, tty, comm]) =>
    pid && comm === process && (!onlyWithTerminal || tty !== "??")).map(([pid]) => pid);
  if (pids.length) await exec(["/bin/kill", `-${name}`, ...pids]);
}

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

  async sync() {
    if (exists(`${paths.omarchy}/.git`)) {
      await run("git", ["-C", paths.omarchy, "fetch", "--depth", "1", "--filter=blob:none", "origin", "HEAD"]);
      await run("git", ["-C", paths.omarchy, "reset", "--hard", "FETCH_HEAD"]);
    } else {
      host.mkdir(paths.support);
      const staging = `${paths.support}/omarchy.clone`;
      host.remove(staging);
      await run("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "https://github.com/basecamp/omarchy.git", staging]);
      await run("git", ["-C", staging, "sparse-checkout", "set", "themes"]);
      await run("mv", [staging, paths.omarchy]);
    }
  },
};

const State = {
  load(): ThemeState {
    try {
      const parsed = JSON.parse(host.readFile(paths.state));
      const backgrounds = parsed?.backgrounds;
      if (typeof backgrounds !== "object" || backgrounds === null || Array.isArray(backgrounds)) return { backgrounds: {} };
      if (!Object.values(backgrounds).every((value) => Number.isInteger(value))) return { backgrounds: {} };
      if (parsed.theme !== undefined && parsed.theme !== null && typeof parsed.theme !== "string") return { backgrounds: {} };
      return parsed.theme ? { backgrounds, theme: parsed.theme } : { backgrounds };
    } catch {
      return { backgrounds: {} };
    }
  },

  save(state: ThemeState) {
    host.mkdir(paths.support);
    host.writeFile(paths.state, JSON.stringify(state));
  },
};

const Files = {
  async write(text: string, path: string) {
    const target = exists(path) ? await Files.resolve(path) : path;
    host.mkdir(dirname(target));
    await Files.backUp(target);
    host.writeFile(target, text);
  },

  async resolve(path: string) {
    const result = await exec(["/usr/bin/realpath", path]);
    return result.status === 0 ? result.stdout.trim() : path;
  },

  async backUp(path: string) {
    const backup = `${paths.backups}/${path.replace(/\//g, "%")}`;
    if (!exists(path) || exists(backup)) return;
    host.mkdir(paths.backups);
    const copied = await exec(["/bin/cp", path, backup]);
    if (copied.status !== 0) throw new Failure(copied.stderr.trim());
  },

  setJSONString(key: string, value: string, text: string) {
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
  },

  pretty(value: unknown, indent = ""): string {
    const inner = indent + "  ";
    if (Array.isArray(value)) {
      return `[\n${value.map((each) => inner + Files.pretty(each, inner)).join(",\n")}\n${indent}]`;
    }
    if (value !== null && typeof value === "object") {
      const keys = Object.keys(value).sort();
      const object = value as Record<string, unknown>;
      return `{\n${keys.map((key) => `${inner}${JSON.stringify(key)} : ${Files.pretty(object[key], inner)}`).join(",\n")}\n${indent}}`;
    }
    return JSON.stringify(value);
  },
};

async function setTheme(theme: string, settings: string) {
  const text = read(settings) ?? "{\n}\n";
  const updated = Files.setJSONString("theme", theme, text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(updated);
  } catch {}
  if ((parsed as { theme?: unknown } | undefined)?.theme !== theme) throw new Failure(`could not set theme in ${settings}`);
  if (updated !== text) await Files.write(updated, settings);
}

function currentFile(name: string) {
  return `${paths.current}/${name}`;
}

const heliumBundle = "net.imput.helium";
const heliumHelper = "/Library/PrivilegedHelperTools/garden.sander.theme-switcher.helium";

function jxa(script: string) {
  return exec(["/usr/bin/osascript", "-l", "JavaScript", "-e", script]);
}

const targets: Target[] = [
  {
    name: "macOS appearance",
    installed: () => true,
    async apply({ theme }) {
      const source = `tell application "System Events" to tell appearance preferences to set dark mode to ${theme.mode === "dark"}`;
      const result = await exec(["/usr/bin/osascript", "-e", source]);
      if (result.status === 0) return;
      if (/\(-1743\)/.test(result.stderr)) {
        throw new Failure("Allow Gary to control System Events in System Settings › Privacy & Security › Automation");
      }
      throw new Failure(result.stderr.trim().replace(/^\d+:\d+: execution error: /, "").replace(/ \(-?\d+\)$/, "") || "AppleScript failed");
    },
  },
  {
    name: "Wallpaper",
    installed: () => true,
    async apply({ theme, background }) {
      if (!background) throw new Failure(`${theme.name} has no backgrounds`);
      await host.wallpaper.set(background);
    },
  },
  {
    name: "dinky",
    installed: () => exists(`${home}/.config/dinky/dinky.toml`),
    async apply({ theme }) {
      const config = `${home}/.config/dinky/dinky.toml`;
      const strip = (color?: string) => (color ?? "").replace(/^#+/, "");
      const colors: Record<string, string> = {
        "active-color": `#${strip(theme.palette.accent)}ff`,
        "inactive-color": `#${strip(theme.palette.muted)}aa`,
      };
      const text = host.readFile(config);
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
      if (replaced.size !== Object.keys(colors).length) throw new Failure("dinky.toml [borders] lacks active-color or inactive-color");
      const updated = lines.join("\n");
      if (updated !== text) await Files.write(updated, config);
    },
  },
  {
    name: "Rex",
    installed: async () => (await which("rex")) !== null,
    async apply({ theme }) {
      const backup = `${paths.backups}/com.superlogical.rex.plist`;
      if (!exists(backup)) {
        host.mkdir(paths.backups);
        await run("defaults", ["export", "com.superlogical.rex", backup]);
      }
      const file = `${paths.support}/rex/Omarchy ${theme.name}`;
      host.mkdir(dirname(file));
      host.remove(file);
      host.writeFile(file, host.readFile(currentFile("ghostty.conf")));
      await run("rex", ["do", "client.theme.import", `path=${file}`]);
      await run("rex", ["do", "client.setting.interface.appearance.scheme", `value=${theme.mode}`]);
    },
  },
  cursorTarget(),
  {
    name: "pi",
    installed: () => exists(`${home}/.pi/agent`),
    async apply() {
      const agent = `${home}/.pi/agent`;
      await Files.write(host.readFile(currentFile("pi.json")), `${agent}/themes/omarchy-system.json`);
      await setTheme("omarchy-system", `${agent}/settings.json`);
    },
  },
  {
    name: "Claude Code",
    installed: () => exists(`${home}/.claude`),
    async apply() {
      const config = `${home}/.claude`;
      await Files.write(host.readFile(currentFile("claude.json")), `${config}/themes/omarchy.json`);
      await setTheme("custom:omarchy", `${config}/settings.json`);
    },
  },
  {
    name: "OpenCode",
    installed: () => exists(`${home}/.config/opencode`),
    async apply() {
      const config = `${home}/.config/opencode`;
      await Files.write(host.readFile(currentFile("opencode.json")), `${config}/themes/omarchy.json`);
      const cli = `${config}/cli.json`;
      let settings: Record<string, unknown> = {};
      const text = read(cli);
      if (text !== null) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {}
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Failure(`could not parse ${cli}`);
        settings = parsed as Record<string, unknown>;
      }
      const current = settings.theme;
      const theme = typeof current === "object" && current !== null && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
      if (theme.name !== "omarchy") {
        theme.name = "omarchy";
        settings.theme = theme;
        await Files.write(Files.pretty(settings) + "\n", cli);
      }
      await signal("USR2", "opencode", true);
    },
  },
  {
    name: "Herdr",
    installed: () => exists(`${home}/.config/herdr-app`),
    async apply() {
      const app = `${home}/.config/herdr-app`;
      await Files.write(host.readFile(currentFile("herdr-app.json")), `${app}/themes/omarchy.json`);
      await setTheme("omarchy", `${app}/settings.json`);
    },
  },
  {
    name: "Ghostty",
    installed: () => ["/Applications", `${home}/Applications`].some((folder) => exists(`${folder}/Ghostty.app`)),
    async apply() {
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
      if (updated !== text) await Files.write(updated, config);
      await signal("USR2", "ghostty");
    },
  },
  {
    name: "Hunk",
    installed: async () => (await which("hunk")) !== null,
    async apply() {
      await signal("WINCH", "hunk");
      setTimeout(() => void signal("WINCH", "hunk"), 1000);
    },
  },
  {
    name: "Helium",
    async installed() {
      const found = await jxa(`ObjC.import("AppKit"); var url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier("${heliumBundle}"); url.isNil() ? "" : url.path.js`);
      return found.status === 0 && found.stdout.trim() !== "";
    },
    async apply({ theme }) {
      const sudoers = list("/etc/sudoers.d")?.some((entry) => entry.name === "theme-switcher-helium") ?? false;
      const installed = read(heliumHelper);
      if (!sudoers || installed === null) throw new Failure("Run theme-switcher helium setup to let Theme Switcher colour Helium");
      if (installed !== host.readFile("helium-helper.sh")) throw new Failure("Run theme-switcher helium setup again to update the Helium helper");
      await run("sudo", ["-n", heliumHelper, heliumColor(theme)]);
      const running = await jxa(`ObjC.import("AppKit");
        ObjC.bindFunction("_CFPreferencesManagementStatusChangedForDomains", ["void", ["id"]]);
        $._CFPreferencesManagementStatusChangedForDomains($(["${heliumBundle}"]));
        var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("${heliumBundle}"), out = [];
        for (var i = 0; i < apps.count; i++) { var url = apps.objectAtIndex(i).executableURL; if (!url.isNil()) out.push(url.path.js); }
        out.join("\\n")`);
      for (const executable of running.stdout.split("\n").filter(Boolean)) {
        await run(executable, ["--refresh-platform-policy", "--no-startup-window"]).catch(() => {});
      }
    },
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
  const parse = <T>(path: string, fallback: T, valid: (value: unknown) => boolean): T => {
    try {
      const value = JSON.parse(host.readFile(path));
      return valid(value) ? value : fallback;
    } catch {
      return fallback;
    }
  };
  const isObject = (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value);
  const registry = () => parse<Record<string, any>[]>(`${extensions()}/extensions.json`, [], (value) => Array.isArray(value) && value.every(isObject));
  const obsolete = () => parse<Record<string, unknown>>(`${extensions()}/.obsolete`, {}, isObject);

  const isInstalled = (id: string) => {
    const gone = obsolete();
    return registry().some((entry) => {
      const entryID = entry.identifier?.id;
      if (typeof entryID !== "string" || entryID.toLowerCase() !== id.toLowerCase()) return false;
      const location = entry.location;
      const locationPath = location?.path ?? location?.fsPath;
      const relative = typeof entry.relativeLocation === "string" ? entry.relativeLocation
        : typeof locationPath === "string" ? basename(locationPath.replace(/\/+$/, "")) : "";
      return relative !== "" && !(relative in gone) && exists(`${extensions()}/${relative}`);
    });
  };

  const extensionTheme = async (applied: Applied): Promise<string | null> => {
    const descriptor = applied.theme.files["vscode.json"];
    if (!descriptor) return null;
    const parsed = JSON.parse(host.readFile(descriptor));
    const json = isObject(parsed) ? parsed : {};
    const name = json.name;
    if (typeof name !== "string" || !/^[^\p{Cc}"\\]+$/u.test(name)) throw new Failure("vscode.json has no usable theme name");
    const id = json.extension;
    if (typeof id !== "string" || !/^[a-zA-Z0-9._-]+$/.test(id) || isInstalled(id)) return name;
    if (failedInstalls.has(id)) return null;
    try {
      await run("cursor", ["--install-extension", id]);
      return name;
    } catch (error) {
      failedInstalls.add(id);
      applied.notes.push(`  note   Cursor: ${id} failed to install, using the generated Omarchy theme. ${message(error)}`);
      return null;
    }
  };

  const installGenerated = async (theme: string) => {
    const data = host.readFile(theme);
    let type: unknown;
    try {
      type = JSON.parse(data)?.type;
    } catch {}
    const bytes = unescape(encodeURIComponent(data));
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes.charCodeAt(i), 16777619) >>> 0;
    const version = `1.0.${hash}`;
    const directory = `${extensions()}/${generatedName}`;

    host.mkdir(`${directory}/themes`);
    host.writeFile(`${directory}/themes/omarchy-color-theme.json`, data);
    const manifest = {
      name: generatedName, displayName: "Omarchy", description: "Omarchy color theme",
      publisher: "local", version, engines: { vscode: "^1.70.0" }, categories: ["Themes"],
      contributes: { themes: [{ label: "Omarchy", uiTheme: type === "light" ? "vs" : "vs-dark", path: "./themes/omarchy-color-theme.json", _watch: true }] },
    };
    host.writeFile(`${directory}/package.json`, Files.pretty(manifest));

    const obsoleteFile = `${extensions()}/.obsolete`;
    const gone = obsolete();
    const key = `${generatedID}-${version}`;
    if (key in gone) {
      delete gone[key];
      await Files.backUp(obsoleteFile);
      if (Object.keys(gone).length === 0) host.remove(obsoleteFile);
      else host.writeFile(obsoleteFile, JSON.stringify(gone).replace(/\//g, "\\/"));
    }

    const entry = {
      identifier: { id: generatedID },
      version,
      location: { $mid: 1, fsPath: directory, external: `file://${encodeURI(directory)}/`, path: directory, scheme: "file" },
      relativeLocation: generatedName,
    };
    const entries = [...registry().filter((each) => each.identifier?.id !== generatedID), entry];
    const registryFile = `${extensions()}/extensions.json`;
    await Files.backUp(registryFile);
    host.writeFile(registryFile, JSON.stringify(entries));
  };

  return {
    name: "Cursor",
    installed: async () => (await which("cursor")) !== null,
    async apply(applied) {
      let colorTheme = await extensionTheme(applied);
      if (colorTheme === null) {
        await installGenerated(currentFile("vscode-theme.json"));
        colorTheme = "Omarchy";
      }
      const preferred = applied.theme.mode === "dark" ? "workbench.preferredDarkColorTheme" : "workbench.preferredLightColorTheme";
      const text = host.readFile(settings());
      const updated = [preferred, "workbench.colorTheme"].reduce((each, key) => Files.setJSONString(key, colorTheme!, each), text);
      if (updated !== text) await Files.write(updated, settings());
    },
  };
}

function stage(theme: Theme) {
  host.remove(paths.next);
  host.mkdir(paths.next);
  const render = renderer(theme.palette);
  for (const template of templates) {
    const shipped = theme.files[template.name];
    host.writeFile(`${paths.next}/${template.name}`, shipped ? host.readFile(shipped) : render(template.text));
  }
}

async function swapStaged() {
  const result = await exec(["/bin/sh", "-c", 'rm -rf "$1" && mv "$2" "$1"', "sh", paths.current, paths.next]);
  if (result.status !== 0) throw new Failure(result.stderr.trim() || "could not move the staged theme into place");
}

async function apply(theme: Theme): Promise<ApplyReport> {
  const state = State.load();
  let background: string | null = null;
  if (theme.backgrounds.length) {
    const remembered = state.backgrounds[theme.id];
    const index = state.theme === theme.id ? ((remembered ?? -1) + 1) % theme.backgrounds.length
      : Math.min(remembered ?? 0, theme.backgrounds.length - 1);
    state.backgrounds[theme.id] = index;
    background = theme.backgrounds[index];
  }

  stage(theme);
  await swapStaged();
  state.theme = theme.id;
  State.save({ backgrounds: state.backgrounds, theme: state.theme });

  const applied: Applied = { theme, background, notes: [] };
  const results = await Promise.all(targets.map(async (target): Promise<TargetResult> => {
    let installed: boolean;
    try {
      installed = await target.installed();
    } catch {
      installed = false;
    }
    if (!installed) return { status: "skipped", target: target.name };
    try {
      await target.apply(applied);
      return { status: "applied", target: target.name };
    } catch (error) {
      return { message: message(error), status: "failed", target: target.name };
    }
  }));

  await appendLog([
    `${timestamp()} ${theme.id} background=${background ? basename(background) : "none"}`,
    ...applied.notes,
    ...results.map((result) => result.status === "skipped" ? `  skip   ${result.target}: not installed`
      : result.status === "failed" ? `  FAILED ${result.target}: ${result.message}` : `  ok     ${result.target}`),
  ]);
  for (const result of results) if (result.status === "failed") host.log(`${result.target} failed: ${result.message}`);
  return background ? { background: basename(background), results, theme: theme.id } : { results, theme: theme.id };
}

function showBackground(step: number): Gary.Json {
  const state = State.load();
  const id = state.theme;
  const theme = id ? Library.theme(id) : null;
  if (!id || !theme) throw new Failure("no theme applied yet");
  if (!theme.backgrounds.length) throw new Failure(`${theme.name} has no backgrounds`);
  const count = theme.backgrounds.length;
  const index = (((state.backgrounds[id] ?? 0) + step) % count + count) % count;
  const background = theme.backgrounds[index];
  state.backgrounds[id] = index;
  State.save({ backgrounds: state.backgrounds, theme: id });
  void appendLog([`${timestamp()} ${id} background=${basename(background)}`]);
  host.wallpaper.set(background).catch((error) => host.log(`Background failed: ${message(error)}`));
  return { background: basename(background), current: id };
}

function followWorkspace() {
  const state = State.load();
  const id = state.theme;
  const index = id === undefined ? undefined : state.backgrounds[id];
  const theme = id && index !== undefined ? themes.find((each) => each.id === id) : undefined;
  const background = theme?.backgrounds[index!];
  if (!background) return;
  host.wallpaper.get().then((wallpapers) => {
    if (wallpapers.some((each) => each.path !== background)) return host.wallpaper.set(background);
  }).catch((error) => host.log(`wallpaper follow failed: ${message(error)}`));
}

function syncPalette(state: string | null) {
  if (!state) return;
  let id: string | undefined;
  try {
    id = JSON.parse(state).theme;
  } catch {
    return;
  }
  const theme = id ? themes.find((each) => each.id === id) ?? Library.theme(id) : null;
  const source = theme?.files["colors.toml"] && read(theme.files["colors.toml"]);
  if (!theme || source == null) return host.log(`no colors.toml for ${id}`);
  const colors = source.split("\n").filter((line) => /^\s*[a-z0-9_]+\s*=\s*"(light|dark|#[0-9a-fA-F]{3,8})"\s*$/.test(line)).join("\n") + "\n";
  if (colors === read(paths.palette)) return;
  host.writeFile(paths.palette, colors);
  host.log(`palette.toml follows ${id}`);
  publish();
}

function enqueue<T>(label: string, job: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    busy = label;
    publish();
    try {
      return await job();
    } finally {
      busy = null;
      publish();
    }
  });
  queue = next.catch(() => {});
  return next;
}

function reload() {
  themes = Library.load();
  publish();
}

function warmPreviews() {
  host.mkdir(paths.previews);
  const cached = new Set((list(paths.previews) ?? []).map((entry) => entry.name));
  const pending = themes.map((theme) => {
    const source = theme.files["preview.png"] ?? theme.backgrounds[0];
    if (!source) return null;
    const size = list(dirname(source))?.find((entry) => entry.name === basename(source))?.size ?? 0;
    let hash = 2166136261;
    for (const char of `${source}|${size}|${previewSize}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return { id: theme.id, source, file: `${theme.id}-${hash.toString(16)}.jpg` };
  }).filter((each): each is { id: string; source: string; file: string } => each !== null);

  const make = async (each: { id: string; source: string; file: string }) => {
    if (!cached.has(each.file)) {
      for (const stale of cached) if (stale.startsWith(`${each.id}-`) && /^[0-9a-f]+\.jpg$/.test(stale.slice(each.id.length + 1))) host.remove(`${paths.previews}/${stale}`);
      const result = await exec(["/usr/bin/sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", "-Z", String(previewSize), each.source, "--out", `${paths.previews}/${each.file}`]);
      if (result.status !== 0) return host.log(`preview for ${each.id} failed: ${result.stderr.trim()}`);
    }
    previews[each.id] = `${paths.previews}/${each.file}`;
  };
  pending.reduce((chain, each) => chain.then(() => make(each)).then(publish), Promise.resolve());
}

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

async function choose(name: string): Promise<{ report: ApplyReport }> {
  reload();
  const id = Library.normalize(name);
  const theme = themes.find((each) => each.id === id);
  if (!theme) throw new Failure(`no theme named ${name}`);
  try {
    return { report: await enqueue(`Applying ${theme.name}…`, () => apply(Library.theme(theme.id) ?? theme)) };
  } catch (error) {
    host.log(`Apply failed: ${message(error)}`);
    throw error;
  }
}

async function update(): Promise<{ themes: number }> {
  try {
    await enqueue("Updating themes…", () => Library.sync());
  } catch (error) {
    host.log(`Update failed: ${message(error)}`);
    throw error;
  } finally {
    reload();
    warmPreviews();
  }
  return { themes: themes.length };
}

function background(step: number): Gary.Json {
  if (busy) {
    enqueue("Changing background…", async () => showBackground(step)).catch((error) => host.log(`Background failed: ${message(error)}`));
    return { queued: step > 0 ? "next" : "previous" };
  }
  try {
    return showBackground(step);
  } catch (error) {
    return { error: message(error) };
  }
}

exec(["/usr/bin/printenv", "HOME"]).then((result) => {
  home = result.stdout.trim();
  paths = makePaths(home);
  searchPath = [
    "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", `${home}/.local/bin`, `${home}/.hunk/bin`,
    `${home}/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS`,
  ];
  templates = (list("templates") ?? []).filter((entry) => entry.name.endsWith(".tpl"))
    .map((entry) => ({ name: entry.name.slice(0, -4), text: host.readFile(`templates/${entry.name}`) }));
  const started = Date.now();
  reload();
  host.log(`loaded ${themes.length} themes in ${Date.now() - started} ms`);
  if (!themes.length) update().catch(() => {});
  syncPalette(read(paths.state));
  host.watchFile(paths.state, (text) => {
    syncPalette(text);
    publish();
  });
  warmPreviews();
});

function whenReady(body: () => Gary.Json): Gary.Json {
  if (!home) return { error: "Theme is starting" };
  return body();
}

function whenStarted<T>(body: () => Promise<T>): Promise<T> {
  return home ? body() : Promise.reject(new Failure("Theme is starting"));
}

module.exports = {
  onTopic(topic, value) {
    if (topic !== "sndrgrdn.dinky" || !home) return;
    const focused = ((value as Workspaces | null)?.displays ?? [])
      .map((display) => display.workspaces.find((each) => each.focused)?.number ?? "").join(",");
    if (focused === focusedWorkspaces) return;
    const first = focusedWorkspaces === "";
    focusedWorkspaces = focused;
    if (!first) followWorkspace();
  },

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
    set: (...words: string[]) => whenStarted(() => (words.length ? choose(words.join(" ")) : Promise.reject(new Failure("usage: set <theme>")))),
    background: (direction = "next") => whenReady(() => {
      if (direction !== "next" && direction !== "previous") return { error: "usage: background [next | previous]" };
      return background(direction === "next" ? 1 : -1);
    }),
    update: () => whenStarted(update),
    picker: () => whenReady(() => {
      reload();
      host.show();
      return {};
    }),
  },
} satisfies Gary.Service;
