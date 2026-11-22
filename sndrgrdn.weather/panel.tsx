const width = 300;
const heroHeight = 32;

export default {
  surface: { attach: true, margins: { top: 8, right: 20 }, anchors: { top: true, right: true } },

  render(state) {
    const weather = state["sndrgrdn.weather"];
    const { spacing } = state.theme;
    return (
      <column padding={spacing.section} gap={spacing.section} width={width}>
        <row key="now" height={heroHeight}>
          <icon key="icon" symbol={weather?.icon ?? "cloud"} fontSize={20} width={28} color={weather ? "bright" : "dim"} />
          <column key="text" gap={0}>
            <text key="temperature" style="title" color={weather ? "bright" : "dim"}>{weather ? `${weather.temperature}°C` : "--°C"}</text>
            <text key="condition" fontSize={11} color="dim">{(weather ? `${weather.condition} · ${weather.place}` : "Loading forecast").toUpperCase()}</text>
          </column>
        </row>
        {weather && (
          <chart
            key="chart"
            width={width - 2 * spacing.section}
            height={96}
            padding={[0, spacing.item]}
            fontSize={11}
            series={[{ values: weather.hours.map((hour) => hour.temperature), color: "foreground", smooth: true }]}
            labels={weather.hours.map((hour, index) => (index % 3 === 0 ? `${Math.round(hour.temperature)}°\n${hour.hour}` : ""))}
          />
        )}
      </column>
    );
  },
} satisfies Gary.Panel;
