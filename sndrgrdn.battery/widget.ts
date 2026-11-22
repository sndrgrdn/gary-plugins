export default {
  render(state) {
    const battery = state.battery;
    if (!battery?.present || battery.percent === null) return { type: "row" };
    const percent = battery.percent;
    const color = battery.source === "ac" ? "green" : percent <= 20 ? "red" : "foreground";
    const filled = Math.ceil(percent / 20);
    return {
      type: "row",
      gap: 8,
      children: [
        {
          type: "row",
          key: "segments",
          gap: 2,
          children: [1, 2, 3, 4, 5].map((segment): Gary.Node => (
            { type: "row", key: String(segment), width: 4, height: 10, background: segment <= filled ? color : "muted" }
          )),
        },
        { type: "text", key: "percent", text: percent + "%", color: "foreground" },
      ],
    };
  },
} satisfies Gary.BarWidget;
