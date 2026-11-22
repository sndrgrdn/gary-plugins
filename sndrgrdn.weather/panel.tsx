const width = 272;

export default {
  surface: { attach: true, margins: { top: 6 }, anchors: { top: true, right: true } },

  render(state) {
    const weather = state["sndrgrdn.weather"];
    return (
      <column padding={14} gap={10} width={width + 28}>
        <row key="now" gap={12}>
          <icon key="icon" symbol={weather?.icon ?? "cloud"} fontSize={26} width={34} />
          <column key="text" gap={2}>
            <text key="temperature" style="title" color={weather ? "bright" : "dim"}>{weather ? `${weather.temperature}°C` : "--°C"}</text>
            <text key="condition" style="dim">{weather ? `${weather.condition} · ${weather.place}` : "Loading forecast"}</text>
          </column>
        </row>
        {weather && (
          <chart
            key="chart"
            width={width}
            height={96}
            fontSize={11}
            series={[{ values: weather.hours.map((hour) => hour.temperature), color: "foreground", smooth: true }]}
            labels={weather.hours.map((hour, index) => (index % 3 === 0 ? `${Math.round(hour.temperature)}°\n${hour.hour}` : ""))}
          />
        )}
      </column>
    );
  },
} satisfies Gary.Panel;
