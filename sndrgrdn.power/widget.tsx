export default {
  render() {
    return <icon symbol="power" color="foreground" action="toggle" tooltip="Power" />;
  },

  onAction(action) {
    if (action === "toggle") host.toggle();
  },
} satisfies Gary.BarWidget;
