function percent(value: number | undefined) {
  return `${(value === undefined ? "--" : String(value)).padStart(3)}%`;
}

export default {
  render(state) {
    const load = state["sndrgrdn.system-load"];
    const color = load ? "foreground" : "dim";
    return (
      <row gap={6}>
        <text key="cpu" color={color}>CPU</text>
        <chart key="chart" width={40} height={12} min={0} max={100} series={[{ values: load?.cpu ?? [], color }]} />
        <text key="cpu-value" color={color}>{percent(load?.cpu.at(-1))}</text>
        <text key="memory" color={color} padding={[0, 0, 0, 6]}>{`MEM ${percent(load?.memory)}`}</text>
      </row>
    );
  },
} satisfies Gary.BarWidget;
