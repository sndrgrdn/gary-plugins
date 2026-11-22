export default {
  render() {
    return <icon symbol="switch.2" color="foreground" action="toggle" tooltip="Control Center" />;
  },

  onAction(action) {
    if (action === "toggle") host.toggle();
  },
} satisfies Gary.BarWidget;
