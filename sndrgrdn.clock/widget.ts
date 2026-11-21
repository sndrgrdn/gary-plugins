const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

module.exports = {
  render(state) {
    const now = new Date(state.clock?.epoch ?? Date.now());
    return {
      type: "row",
      gap: 0,
      children: [
        { type: "text", key: "date", text: `${days[now.getDay()]} ${pad(now.getDate())} ${months[now.getMonth()]}`, color: "foreground" },
        { type: "text", key: "time", text: `${pad(now.getHours())}:${pad(now.getMinutes())}`, color: "bright_foreground", width: 51, padding: [0, 0, 0, 16] },
      ],
    };
  },
} satisfies Gary.BarWidget;
