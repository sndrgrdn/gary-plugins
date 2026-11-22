const samples = 30;
let cpu: number[] = [];

function percent(value: number | undefined) {
  return `${(value === undefined ? "--" : String(value)).padStart(3)}%`;
}

export default {
  onTopic({ topic, value }) {
    if (topic === "system") cpu = [...cpu, Math.round(100 * (1 - value.cpu.idle))].slice(-samples);
  },

  render(state) {
    const memory = state.system && Math.round((100 * state.system.memory.used) / state.system.memory.total);
    const color = state.system ? "foreground" : "dim";
    return (
      <row gap={state.theme.spacing.section} padding={[0, state.theme.spacing.item]}>
        <row key="cpu" gap={4}>
          <text key="label" color={color}>CPU</text>
          <chart key="chart" width={40} height={12} min={0} max={100} series={[{ values: cpu, color }]} />
          <text key="value" color={color}>{percent(cpu.at(-1))}</text>
        </row>
        <text key="memory" color={color}>{`MEM ${percent(memory)}`}</text>
      </row>
    );
  },
} satisfies Gary.BarWidget;
