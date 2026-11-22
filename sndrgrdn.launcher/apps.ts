import { Effect, host } from "gary:effect";

export interface App {
  readonly name: string;
  readonly key: string;
  readonly path: string;
  readonly bundle: string;
}

export interface Index {
  readonly apps: readonly App[];
  readonly skipped: readonly string[];
}

const roots = ["/Applications", "/System/Applications", "~/Applications"];
const bundleKey = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/;

const bundles: (folder: string, depth: number) => Effect.Effect<string[]> = Effect.fnUntraced(function* (folder, depth) {
  const entries = yield* host.list(folder).pipe(Effect.orElseSucceed((): Gary.FileEntry[] => []));
  const found: string[] = [];
  for (const entry of entries) {
    const path = `${folder}/${entry.name}`;
    if (entry.name.endsWith(".app")) found.push(path);
    else if (entry.type === "directory" && depth > 0) found.push(...(yield* bundles(path, depth - 1)));
  }
  return found;
});

const bundleId = (path: string) =>
  host.readFile(`${path}/Contents/Info.plist`).pipe(
    Effect.map((plist) => bundleKey.exec(plist)?.[1] ?? null),
    Effect.orElseSucceed(() => null),
  );

export const index = Effect.fn("Launcher.index")(function* () {
  const paths = (yield* Effect.forEach(roots, (root) => bundles(root, 1))).flat();
  const apps = new Map<string, App>();
  const skipped: string[] = [];
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf("/") + 1, -".app".length);
    const bundle = yield* bundleId(path);
    if (!bundle) skipped.push(name);
    else if (!apps.has(bundle)) apps.set(bundle, { name, key: name.toLowerCase(), path, bundle });
  }
  const sorted = [...apps.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { apps: sorted, skipped } satisfies Index;
});
