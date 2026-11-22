const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export default {
  render(state) {
    const now = new Date(state.clock?.epoch ?? Date.now());
    return (
      <row gap={0} action="toggle">
        <text key="date" color="foreground">{days[now.getDay()]} {pad(now.getDate())} {months[now.getMonth()]}</text>
        <text key="time" color="bright_foreground" width={51} padding={[0, 0, 0, 16]}>{pad(now.getHours())}:{pad(now.getMinutes())}</text>
      </row>
    );
  },

  onAction(action) {
    if (action === "toggle") host.toggle();
  },
} satisfies Gary.BarWidget;
