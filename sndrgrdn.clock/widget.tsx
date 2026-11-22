const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");

const tokens: Record<string, (date: Date) => string | number> = {
  dddd: (date) => days[date.getDay()],
  ddd: (date) => days[date.getDay()].slice(0, 3),
  dd: (date) => pad(date.getDate()),
  d: (date) => date.getDate(),
  MMMM: (date) => months[date.getMonth()],
  MMM: (date) => months[date.getMonth()].slice(0, 3),
  MM: (date) => pad(date.getMonth() + 1),
  M: (date) => date.getMonth() + 1,
  yyyy: (date) => date.getFullYear(),
  HH: (date) => pad(date.getHours()),
  H: (date) => date.getHours(),
  mm: (date) => pad(date.getMinutes()),
};

function format(pattern: string, date: Date) {
  return pattern.replace(/'([^']*)'|dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|HH|H|mm/g, (token, quoted?: string) =>
    String(quoted ?? tokens[token](date)),
  );
}

export default {
  render(state) {
    const now = new Date(state.clock?.epoch ?? Date.now());
    const pattern = state.settings.format;
    const { spacing } = state.theme;
    if (typeof pattern === "string") return <text action="toggle" padding={[0, spacing.item]} color="foreground">{format(pattern, now)}</text>;
    return (
      <row gap={spacing.section} padding={[0, spacing.item]} action="toggle">
        <text key="date" color="foreground">{format("ddd dd MMM", now)}</text>
        <text key="time" color="bright_foreground">{format("HH:mm", now)}</text>
      </row>
    );
  },

  onAction(action) {
    if (action === "toggle") host.toggle();
  },
} satisfies Gary.BarWidget;
