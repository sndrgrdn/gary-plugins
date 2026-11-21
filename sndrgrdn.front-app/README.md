# Front App

A Gary plugin: bar-widget.

## Install

```sh
gary plugin add <git-url> --enable
```

## Develop

Gary reloads the plugin each time you save an entry file. Type-check it with `npx -p typescript tsc -p .`.
After you change `uses` or `subscribes` in `manifest.json`, run `gary plugin types .` to refresh `gary.d.ts`.
