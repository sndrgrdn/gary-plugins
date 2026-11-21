declare namespace Gary {
  type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
  type Kind = "bar-widget" | "bar" | "panel" | "overlay" | "menu" | "service";
  type Key = "up" | "down" | "enter" | "escape" | "tab";
  type StyleName = "active" | "bad" | "bright" | "button" | "button-hover" | "default" | "dim" | "good" | "hover" | "mono" | "panel" | "primary" | "primary-hover" | "secondary" | "selected" | "surface" | "title" | (string & {});
  type FontName = "body" | "mono" | "strong" | "title" | (string & {});
  type ColorName = "accent" | "background" | "bad" | "bar" | "border" | "bright" | "control" | "dim" | "foreground" | "good" | "hover" | "on-accent" | "panel" | "secondary" | "selected" | (string & {});
  type Color = ColorName;

  interface Style {
    key?: string;
    style?: StyleName;
    action?: string;
    width?: number;
    height?: number;
    minWidth?: number;
    gap?: number;
    radius?: number;
    fontSize?: number;
    opacity?: number;
    padding?: number | [number, number] | [number, number, number, number];
    offset?: number;
    align?: "leading" | "center" | "trailing";
    animation?: "smooth" | "spring" | "none";
    material?: "vibrant" | "glass" | "none";
    background?: Color;
    color?: Color;
    font?: FontName;
  }
  interface Row extends Style {
    type: "row";
    children?: Node[];
  }
  interface Column extends Style {
    type: "column";
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
  type Node = Row | Column | Scroll | Button | Text | Icon | Image | Slider | Progress | Input | Spacer;

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
  interface State {
    settings: { [key: string]: Json };
    theme: Theme;
    display?: Display;

  }

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
    background?: "solid" | "none";
  }

  type ActionPayload = null | number | string;
  interface Storage {
    get(key: string): Json | undefined;
    set(key: string, value: Json | undefined): void;
  }
  interface Host {
    log(message: string): void;
    storage: Storage;
    publish(value: Json): void;
    show(): void;
    hide(): void;
    toggle(): void;
  }

  interface Module {
    render?(state: State): Node;
    onAction?(action: string, payload: ActionPayload, state: State): void;
    onKey?(key: Key, state: State): void;
    onHotkey?(id: string, state: State): void;
    onTopic?(topic: string, value: Json, state: State): void;
    methods?: { [name: string]: (...args: string[]) => Json | void };
    surface?: Surface | null | ((state: State) => Surface | null | undefined);
  }
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
declare var module: { exports: Gary.Module };
declare var exports: Gary.Module;
declare function setTimeout(callback: (...args: any[]) => void, ms?: number, ...args: any[]): number;
declare function setInterval(callback: (...args: any[]) => void, ms?: number, ...args: any[]): number;
declare function clearTimeout(id?: number): void;
declare function clearInterval(id?: number): void;
declare namespace Gary {
  interface State { clock?: Clock }
  interface Clock { epoch: number }
}
declare namespace Gary {
  interface Host { exec(argv: string[], callback: (result: ExecResult) => void): void }
  interface ExecResult { status: number; stdout: string; stderr: string }
}
declare namespace Gary {
  interface State { session?: Session }
  interface Session { locked: boolean }
}
