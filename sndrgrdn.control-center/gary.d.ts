declare namespace Gary {
  type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
  type Kind = "bar-widget" | "bar" | "panel" | "overlay" | "menu" | "service";
  type Key = "backspace" | "delete" | "down" | "end" | "enter" | "escape" | "home" | "left" | "pagedown" | "pageup" | "right" | "tab" | "up" | (string & {});
  interface ScrollEvent {
    x: number;
    y: number;
    precise: boolean;
    phase: "began" | "changed" | "ended" | "momentum" | "none";
    action?: string;
  }
  type StyleName = "active" | "bad" | "bright" | "button" | "button-hover" | "default" | "dim" | "good" | "hover" | "mono" | "panel" | "primary" | "primary-hover" | "secondary" | "selected" | "surface" | "title" | "tooltip" | (string & {});
  type FontName = "body" | "mono" | "strong" | "title" | (string & {});
  type ColorName = "accent" | "background" | "bad" | "bar" | "border" | "bright" | "control" | "dim" | "foreground" | "good" | "hover" | "on-accent" | "panel" | "secondary" | "selected" | (string & {});
  type Color = ColorName;
  type Paint = Color | { gradient: "linear" | "radial" | "angular"; colors: [Color, Color, ...Color[]]; angle?: number };

  interface StyleProps {
    width?: number;
    height?: number;
    minWidth?: number;
    gap?: number;
    radius?: number;
    fontSize?: number;
    opacity?: number;
    scale?: number;
    duration?: number;
    blur?: number;
    padding?: number | [number, number] | [number, number, number, number];
    x?: number;
    y?: number;
    zIndex?: number;
    rotation?: number;
    align?: "leading" | "center" | "trailing";
    animation?: "smooth" | "spring" | "none";
    material?: "vibrant" | "glass" | "none";
    colorScheme?: "dark" | "light";
    transition?: "opacity" | "scale" | "none";
    fit?: "fit" | "fill";
    clip?: boolean;
    shadow?: { color: Color; radius?: number; y?: number };
    border?: { color: Color; width?: number };
    blend?: "normal" | "multiply" | "screen" | "overlay" | "plusLighter" | "plusDarker" | "difference";
    loop?: { opacity?: [number, number]; scale?: [number, number]; rotation?: [number, number]; x?: [number, number]; y?: [number, number]; duration?: number; reverse?: boolean };
    background?: Paint;
    color?: Color;
    font?: FontName;
  }
  interface Style extends StyleProps {
    key?: string;
    style?: StyleName;
    action?: string;
    rightAction?: string;
    middleAction?: string;
    scrollAction?: string;
    tooltip?: string;
    hovered?: StyleProps;
    pressed?: StyleProps;
  }
  interface Row extends Style {
    type: "row";
    children?: Node[];
  }
  interface Column extends Style {
    type: "column";
    children?: Node[];
  }
  interface Stack extends Style {
    type: "stack";
    children?: Node[];
  }
  interface Scroll extends Style {
    type: "scroll";
    children?: Node[];
    reveal?: string;
  }
  interface Button extends Style {
    type: "button";
    children?: Node[];
    hover?: StyleName;
  }
  interface Text extends Style {
    type: "text";
    text: string | number;
  }
  interface Icon extends Style {
    type: "icon";
    symbol: string;
  }
  interface Image extends Style {
    type: "image";
    path: string;
  }
  interface Slider extends Style {
    type: "slider";
    value: number;
  }
  interface Progress extends Style {
    type: "progress";
    value: number;
  }
  interface Input extends Style {
    type: "input";
    value?: string | number;
    placeholder?: string;
    change?: string;
    submit?: string;
  }
  interface Spacer extends Style {
    type: "spacer";
  }
  interface Shape extends Style {
    type: "shape";
    viewBox?: [number, number];
    paths: { d: string; fill?: Paint; stroke?: Paint; lineWidth?: number; cap?: "butt" | "round" | "square"; join?: "miter" | "round" | "bevel"; dash?: number[]; trim?: [number, number] }[];
  }
  interface Chart extends Style {
    type: "chart";
    series: { values: number[]; mark?: "line" | "area" | "bar"; color?: Paint; smooth?: boolean }[];
    min?: number;
    max?: number;
    axes?: boolean;
  }
  interface Grid extends Style {
    type: "grid";
    columns: number;
    children?: Node[];
  }
  interface Shader extends Style {
    type: "shader";
    path: string;
    function: string;
    args?: number[];
    animated?: boolean;
  }
  type Node = Row | Column | Stack | Scroll | Button | Text | Icon | Image | Slider | Progress | Input | Spacer | Shape | Chart | Grid | Shader;

  type Child = Node | false | null | undefined | Child[];
  type TextChild = string | number | false | null | undefined;
  type ElementProps<N extends Node> = N extends Text
    ? Omit<Text, "type" | "text"> & ({ text: string | number; children?: never } | { text?: never; children: TextChild | TextChild[] })
    : "children" extends keyof N ? Omit<N, "type" | "children"> & { children?: Child } : Omit<N, "type">;
  function h(type: string | ((props: any) => Node), props: object | null, ...children: unknown[]): Node;
  function Fragment(props: { children?: Child }): Node[];
  namespace JSX {
    type Element = Node;
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicAttributes { key?: string }
    type Elements = { [N in Node as N["type"]]: ElementProps<N> };
    interface IntrinsicElements extends Elements {}
  }

  interface Display {
    id: string;
    index: number;
    main: boolean;
    width: number;
    height: number;
    notched: boolean;
    notch: { left: number; right: number } | null;
  }
  interface Theme {
    mode: "light" | "dark";
    colors: { [name: string]: string };
    palette: { [name: string]: string };
  }
  interface Topics {
    "wifi": WiFi;
    "bluetooth": Bluetooth;
    "focus": Focus;
    "audio": Audio;
    "brightness": Brightness;
    "sndrgrdn.control-center": import("./topic").Topic;
  }
  interface State extends Partial<Topics> {
    settings: { [key: string]: Json };
    theme: Theme;
    display?: Display;
    surface?: string;
  }
  type TopicEvent = { [K in keyof Topics]: { topic: K; value: Topics[K] } }[keyof Topics];

  type Edges<T> = { top?: T; bottom?: T; left?: T; right?: T };
  interface Surface {
    screen?: "main" | "focused" | "all" | number;
    anchors?: Edges<boolean>;
    width?: number | "fit";
    height?: number | "fit";
    margins?: number | Edges<number>;
    layer?: "desktop" | "below" | "normal" | "top" | "overlay" | "notch";
    exclusionMode?: "normal" | "ignore";
    clickThrough?: boolean;
    focusable?: boolean;
    background?: "solid" | "none" | "backdrop";
    attach?: boolean;
  }

  type ActionPayload = null | number | string;
  interface Storage {
    get(key: string): Json | undefined;
    set(key: string, value: Json | undefined): void;
  }
  interface Host {
    log(message: string): void;
    storage: Storage;
    publish(value: import("./topic").Topic): void;
    show(surface?: string): void;
    hide(surface?: string): void;
    toggle(surface?: string): void;
    call(method: string, ...args: string[]): Promise<Json | undefined>;
  }

  interface Module {
    render?(state: State): Node;
    onAction?(action: string, payload: ActionPayload, state: State): void;
    onKey?(key: Key, state: State): boolean | void;
    onScroll?(event: ScrollEvent, state: State): void;
    onHotkey?(id: string, state: State): void;
    onTopic?(event: TopicEvent, state: State): void;
    methods?: { [name: string]: (...args: string[]) => Json | void | Promise<Json | void> };
    surface?: SurfaceExport;
    surfaces?: { [name: string]: SurfaceExport };
  }
  type SurfaceExport = Surface | null | ((state: State) => Surface | null | undefined);
  interface Rendered extends Module {
    render(state: State): Node;
  }
  type BarWidget = Rendered;
  type Bar = Rendered;
  type Panel = Rendered;
  type Overlay = Rendered;
  type Menu = Rendered;
  type Service = Module;
}

declare const host: Gary.Host;
declare function setTimeout(callback: (...args: any[]) => void, ms?: number, ...args: any[]): number;
declare function setInterval(callback: (...args: any[]) => void, ms?: number, ...args: any[]): number;
declare function clearTimeout(id?: number): void;
declare function clearInterval(id?: number): void;
declare namespace Gary {
  type AudioScope = "output" | "input";
  interface Audio {
    devices: AudioDeviceSummary[];
    output: AudioDeviceState | null;
    input: AudioDeviceState | null;
    microphone: { pid: number; app: string | null; bundleId: string | null }[];
  }
  interface AudioDeviceSummary { id: string; name: string; transport: string; output: boolean; input: boolean }
  interface AudioDeviceState { id: string; name: string; transport: string; volume: number | null; muted: boolean | null }
  interface Host { audio: AudioApi }
  interface AudioApi {
    setVolume(volume: number, scope?: AudioScope): null;
    setMuted(muted: boolean, scope?: AudioScope): null;
    setDefaultDevice(id: string, scope?: AudioScope): null;
  }
}
declare namespace Gary {
  interface Bluetooth {
    available: boolean;
    permission: "allowed" | "denied" | "restricted" | "notDetermined";
    power: boolean | null;
    devices: BluetoothDevice[];
    missing: string[];
  }
  interface BluetoothDevice { address: string; name: string | null; connected: boolean; battery: number | null }
  interface Host { bluetooth: BluetoothApi }
  interface BluetoothApi {
    setPower(on: boolean): null;
    connect(address: string): Promise<"connected">;
    disconnect(address: string): Promise<"disconnected">;
    requestAccess(): Promise<string>;
  }
}
declare namespace Gary {
  interface Brightness { displays: BrightnessDisplay[]; missing: string[] }
  interface BrightnessDisplay { id: string; name: string | null; builtin: boolean; brightness: number | null; control: "displayservices" | "ddc" | null }
  interface Host { brightness: BrightnessApi }
  interface BrightnessApi { set(value: number, display?: string | null): null }
}
declare namespace Gary {
  interface Focus {
    available: boolean;
    active: boolean;
    reason?: string;
    mode?: string | null;
    name?: string | null;
    symbol?: string | null;
    source?: string | null;
  }
}
declare namespace Gary {
  type MediaKeyName = "volume-up" | "volume-down" | "mute" | "brightness-up" | "brightness-down";
  interface MediaKeyEvent { key: MediaKeyName; repeat: boolean; modifiers: ("shift" | "control" | "option" | "command")[] }
  interface Module { onMediaKey?(event: MediaKeyEvent, state: State): void }
  interface Host { mediakeys: { intercept(keys: MediaKeyName[]): boolean } }
}
declare namespace Gary {
  interface WiFi {
    available: boolean;
    location: "authorized" | "denied" | "restricted" | "notDetermined";
    interface?: string | null;
    power?: boolean;
    connected?: boolean;
    ssid?: string | null;
    bssid?: string | null;
    rssi?: number | null;
    noise?: number | null;
    channel?: number | null;
    transmitRate?: number | null;
  }
  interface WiFiNetwork { ssid: string | null; bssid: string | null; rssi: number; noise: number; channel: number | null; secure: boolean }
  interface Host { wifi: WiFiApi }
  interface WiFiApi {
    setPower(on: boolean): null;
    scan(): Promise<WiFiNetwork[]>;
    join(ssid: string, password?: string | null): Promise<"joined">;
    requestLocation(): Promise<string>;
  }
}

declare namespace Gary {
  interface Module {
    effect?: import("effect").Effect.Effect<void, unknown, import("effect").Scope.Scope>;
  }
}

declare module "gary:effect" {
  import type { Effect as E, Stream as S } from "effect";
  export {
    Cache, Cause, Context, Data, Deferred, Duration, Effect, Exit, Fiber, Layer, Option, PubSub, Queue, Ref, Schedule, Schema, Scope,
    Semaphore, Stream, SubscriptionRef, pipe,
  } from "effect";
  export interface HostError {
    readonly _tag: "HostError";
    readonly message: string;
  }
  type Lift<T> = T extends (...args: infer A) => infer R
    ? (...args: A) => E.Effect<Awaited<R>, HostError>
    : { readonly [K in keyof T]: Lift<T[K]> };
  export const host: Lift<Gary.Host>;
  export const fetch: typeof globalThis extends { fetch: infer F } ? Lift<F> : never;
  export const settings: Gary.State["settings"];
  export function topic<K extends keyof Gary.Topics>(name: K): S.Stream<Gary.Topics[K]>;
}
