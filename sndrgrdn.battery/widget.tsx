export default {
  render(state) {
    const battery = state.battery;
    if (!battery?.present || battery.percent === null) return <row />;
    const percent = battery.percent;
    const color = battery.source === "ac" ? "green" : percent <= 20 ? "red" : "foreground";
    const filled = Math.ceil(percent / 20);
    return (
      <row gap={8}>
        <row key="segments" gap={2}>
          {[1, 2, 3, 4, 5].map((segment) => (
            <row key={String(segment)} width={4} height={10} background={segment <= filled ? color : "muted"} />
          ))}
        </row>
        <text key="percent" color="foreground">{percent}%</text>
      </row>
    );
  },
} satisfies Gary.BarWidget;
