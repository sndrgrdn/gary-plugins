const width = 272;
const label = 28;

export default {
  surface: { attach: true, margins: { top: 6 }, anchors: { top: true, right: true } },

  render(state) {
    const weather = state["sndrgrdn.weather"];
    const marks = weather?.hours.filter((_, index) => index % 3 === 0) ?? [];
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
            width={width - label}
            height={64}
            x={label / 2}
            series={[{ values: weather.hours.map((hour) => hour.temperature), color: "foreground", smooth: true }]}
          />
        )}
        {weather && (
          <row key="hours">
            {marks.map((mark, index) => [
              index > 0 && <spacer key={`gap-${mark.hour}`} />,
              <column key={mark.hour} width={label} gap={2}>
                <text key="temperature" width={label} align="center" fontSize={11}>{`${Math.round(mark.temperature)}°`}</text>
                <text key="hour" width={label} align="center" fontSize={11} style="dim">{mark.hour}</text>
              </column>,
            ])}
          </row>
        )}
      </column>
    );
  },
} satisfies Gary.Panel;
