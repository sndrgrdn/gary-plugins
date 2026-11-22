import { read, shown, symbol } from "./levels";

export default {
  surfaces: {
    osd: { anchors: { bottom: true }, margins: { bottom: 120 }, clickThrough: true, background: "none" },
  },

  render(state) {
    const level = state["sndrgrdn.control-center"]?.level ?? "volume";
    const now = read(state, level);
    const value = now ? shown(now) : 0;
    return (
      <row
        gap={12}
        padding={[12, 18]}
        radius={22}
        material="glass"
        background="alpha(panel, 0.35)"
        border={{ color: "border" }}
        animation="smooth"
      >
        <icon key="icon" symbol={now ? symbol(level, now) : "speaker.slash.fill"} fontSize={16} width={22} color="bright" />
        <progress key="level" value={value} width={180} color="foreground" />
        <text key="value" font="mono" width={28} align="trailing" color="bright">{Math.round(value * 100)}</text>
      </row>
    );
  },
} satisfies Gary.Overlay;
