import { host } from "gary:effect";

export default {
  render() {
    return <text action="open" fontSize={13} width={27} align="center" tooltip="Menu  ⌥⇧Space">{"\u{F1677}"}</text>;
  },

  onAction() {
    return host.toggle();
  },
} satisfies Gary.BarWidget;
