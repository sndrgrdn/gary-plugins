# Power

A power icon at the end of the bar opens a menu to lock the screen, sleep, restart, shut down or log out, like the system menu in Omarchy.

![The power menu asking "Log out of this Mac?" with Cancel and Log out buttons](screenshot.png)

## Use

- Click the icon to open the menu. Escape or a click outside closes it.
- Lock and Sleep act at once. Restart, Shut down and Log out ask first.
- Up and down, or tab, move through the list, and return picks the item.
- In the question, left and right switch between Cancel and the action, return picks it, and escape goes back to the list.
- Restart, Shut down and Log out go through loginwindow, as the Apple menu does, so open apps can save their work or cancel.

The menu shows an error under the list when an action fails, such as a missing permission.

## Permissions

- Lock presses the Lock Screen shortcut, so it needs Accessibility.
- Restart, Shut down and Log out need permission to control loginwindow. macOS asks the first time you use one of them.

`gary onboarding` lists Accessibility if it is missing. The loginwindow permission is in System Settings under Privacy & Security, Automation, Gary.

## Install

This plugin ships in the `sndrgrdn/gary-plugins` package. Installing the package adds every plugin in it:

```sh
gary plugin install git:github.com/sndrgrdn/gary-plugins
```

To use only this plugin, turn the others off with `gary plugin disable <id>`. `gary plugin enable sndrgrdn.power` adds the icon to the end of `bar.right`.

## Develop

Gary reloads the plugin each time you save an entry file. It uses Effect from `gary:effect`. Run `npm install` once at the repository root for the `effect` types, then type-check it with `npx tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
