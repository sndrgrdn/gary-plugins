type Item = { id: string; name: string; mode: "light" | "dark"; current: boolean; preview: string | null; colors: Record<string, string> };
type Library = { themes: Item[]; current: string | null };
type Frame = { x: number; y: number; width: number; height: number };

const expanded = { width: 768, height: 475 };
const slice = { width: 84, height: 440 };
const gap = 10;
const step = slice.width + gap;
const topMargin = 30;
const chromeHeight = 104;
const dots = ["red", "yellow", "green", "cyan", "blue", "magenta"];
const stripes = ["background", "red", "yellow", "green", "cyan", "blue", "magenta", "foreground"];

let library: Library = { themes: [], current: null };
let query = "";
let selectedID: string | null = null;
let scrolled = 0;

function carouselRadius(width: number) {
  return Math.max(1, Math.min(16, Math.ceil((width - expanded.width) / (2 * step)) + 1));
}

function frame(relative: number, previewX: number, radius: number): Frame {
  if (relative === 0) return { x: previewX, y: 0, ...expanded };
  const distance = Math.abs(relative);
  const height = slice.height * Math.sqrt(Math.max(0.05, 1 - (distance / (radius + 0.6)) ** 2));
  const x = relative < 0 ? previewX - distance * step : previewX + expanded.width + gap + (distance - 1) * step;
  return { x, y: (expanded.height - height) / 2, width: slice.width, height };
}

function corner(frame: Frame) {
  return Math.min(18, Math.max(8, Math.min(frame.width, frame.height) * 0.12));
}

function matching() {
  const needle = query.toLowerCase();
  if (!needle) return library.themes;
  return library.themes.filter((theme) => theme.id.toLowerCase().includes(needle) || theme.name.toLowerCase().includes(needle));
}

function selected() {
  return matching().find((theme) => theme.id === selectedID);
}

function visible(radius: number) {
  const themes = matching();
  if (!themes.length) return [];
  const position = Math.max(0, themes.findIndex((theme) => theme.id === selectedID));
  if (themes.length >= 2 * radius + 2) {
    return Array.from({ length: 2 * radius + 1 }, (_, index) => {
      const relative = index - radius;
      return { relative, theme: themes[(position + relative + themes.length) % themes.length] };
    });
  }
  return themes.map((theme, index) => ({ relative: index - position, theme })).filter((each) => Math.abs(each.relative) <= radius);
}

function move(direction: number) {
  const themes = matching();
  if (!themes.length) return;
  const position = Math.max(0, themes.findIndex((theme) => theme.id === selectedID));
  selectedID = themes[(position + direction + themes.length) % themes.length].id;
}

function setQuery(next: string) {
  query = next;
  if (selected()) return;
  const all = library.themes.map((theme) => theme.id);
  const start = Math.max(0, selectedID ? all.indexOf(selectedID) : 0);
  const ids = new Set(matching().map((theme) => theme.id));
  selectedID = [...all.slice(start), ...all.slice(0, start)].find((id) => ids.has(id)) ?? selectedID;
}

function pick(theme: Item) {
  host.call("set", theme.id).catch((error) => host.log(`set ${theme.id} failed: ${error}`));
  host.hide();
}

function artwork(theme: Item, card: Frame): Gary.Node {
  const place = { x: (card.width - expanded.width) / 2, y: (card.height - expanded.height) / 2, ...expanded };
  if (theme.preview) return <image key="preview" path={theme.preview} fit="fill" animation="smooth" duration={0.35} {...place} />;
  return (
    <row key="stripes" gap={0} {...place}>
      {stripes.map((name) => (
        <row key={name} width={expanded.width / stripes.length} height={expanded.height} background={theme.colors[name] ?? "#808080"} />
      ))}
    </row>
  );
}

function card(theme: Item, relative: number, previewX: number, radius: number): Gary.Node {
  const chosen = relative === 0;
  const place = frame(relative, previewX, radius);
  return (
    <stack
      key={theme.id}
      {...place}
      radius={corner(place)}
      clip
      action={`pick:${theme.id}`}
      pressed={{ scale: 0.97 }}
      border={{ color: chosen ? theme.colors.accent ?? "accent" : "alpha(#ffffff, 0.12)", width: chosen ? 2.5 : 1 }}
      shadow={{ color: `alpha(#000000, ${chosen ? 0.45 : 0})`, radius: chosen ? 30 : 0, y: chosen ? 18 : 0 }}
      opacity={Math.abs(relative) >= radius ? 0 : 1}
      zIndex={chosen ? 100 : 50 - Math.min(Math.abs(relative), 40)}
    >
      {artwork(theme, place)}
      <row
        key="dim"
        width={place.width}
        height={place.height}
        background="background"
        opacity={chosen ? 0 : 0.42}
        hovered={{ opacity: chosen ? 0 : 0.2 }}
      />
    </stack>
  );
}

function caption(): Gary.Node {
  const theme = selected();
  const title: Gary.Node[] = theme
    ? [
      <text key="name" font="picker-title" color="#ffffff">{theme.name}</text>,
      <row key="dots" gap={5}>
        {dots.map((name) => (
          <row key={name} width={9} height={9} radius={4.5} background={theme.colors[name] ?? "#808080"} border={{ color: "alpha(#ffffff, 0.2)", width: 0.5 }} />
        ))}
      </row>,
    ]
    : [<text key="name" font="picker-title" color="alpha(#ffffff, 0.6)">No matches</text>];
  const filter: Gary.Node[] = query
    ? [
      <row key="divider" width={1} height={16} background="alpha(#ffffff, 0.2)" />,
      <row key="query" gap={5}>
        <icon key="search" symbol="magnifyingglass" fontSize={14} color="alpha(#ffffff, 0.75)" />
        <text key="text" font="picker-query" color="alpha(#ffffff, 0.75)">{query}</text>
      </row>,
    ]
    : [];
  return (
    <row
      key="caption"
      gap={12}
      height={40}
      padding={[0, 18]}
      radius={20}
      material="vibrant"
      colorScheme="dark"
      border={{ color: "alpha(#ffffff, 0.14)", width: 1 }}
      shadow={{ color: "alpha(#000000, 0.25)", radius: 12, y: 6 }}
      animation="none"
    >
      {title}
      {filter}
    </row>
  );
}

export default {
  surface: { anchors: { top: true, bottom: true, left: true, right: true }, exclusionMode: "ignore", background: "backdrop" },

  onTopic(topic, value) {
    if (topic !== "sndrgrdn.theme" || !value) return;
    library = value as unknown as Library;
    if (selectedID === null || !library.themes.some((theme) => theme.id === selectedID)) {
      selectedID = library.current ?? library.themes[0]?.id ?? null;
    }
  },

  render(state) {
    const width = Math.min((state.display?.width ?? 1728) - 80, expanded.width + 13 * step + 40);
    const radius = carouselRadius(width);
    const previewX = (width - expanded.width) / 2;
    const cards = visible(radius).sort((a, b) => Math.abs(a.relative) - Math.abs(b.relative));
    return (
      <column key="picker" gap={0} padding={[topMargin, 0, 0, 0]}>
        <stack key="carousel" width={width} height={expanded.height} animation="smooth" duration={0.35}>
          {cards.map(({ theme, relative }) => card(theme, relative, previewX, radius))}
        </stack>
        <column key="chrome" width={width} height={chromeHeight} padding={[26, 0, 0, 0]} align="center">
          {caption()}
        </column>
      </column>
    );
  },

  onKey(key) {
    if (key === "escape" && query) {
      setQuery("");
      return true;
    } else if (key === "enter") {
      const theme = selected();
      if (theme) pick(theme);
    } else if (key === "left" || key === "shift+tab") {
      move(-1);
    } else if (key === "right" || key === "tab") {
      move(1);
    } else if (key === "backspace") {
      setQuery(query.slice(0, -1));
    } else if ([...key].length === 1) {
      setQuery(query + key);
    }
  },

  onScroll(event) {
    const delta = Math.abs(event.x) > Math.abs(event.y) ? -event.x : -event.y;
    if (!event.precise) {
      if (delta) move(delta > 0 ? 1 : -1);
      return;
    }
    if (event.phase === "began") scrolled = 0;
    scrolled += delta;
    while (Math.abs(scrolled) >= 40) {
      move(scrolled > 0 ? 1 : -1);
      scrolled -= scrolled > 0 ? 40 : -40;
    }
  },

  onAction(action) {
    if (!action.startsWith("pick:")) return;
    const theme = matching().find((each) => each.id === action.slice(5));
    if (!theme) return;
    if (theme.id === selectedID) pick(theme);
    else selectedID = theme.id;
  },
} satisfies Gary.Menu;
