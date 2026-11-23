import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const plugin = fileURLToPath(new URL("..", import.meta.url));
const { paneTitles, scanPanes } = await import(join(plugin, "panes.ts"));

export function installedApps() {
  const roots = ["/Applications", "/System/Applications", join(homedir(), "Applications")].filter(existsSync);
  const list = (folder) => readdirSync(folder, { withFileTypes: true });
  return roots.flatMap((root) =>
    list(root).flatMap((entry) =>
      entry.name.endsWith(".app")
        ? [{ title: entry.name.slice(0, -4), path: join(root, entry.name) }]
        : entry.isDirectory()
          ? list(join(root, entry.name))
              .filter((inner) => inner.name.endsWith(".app"))
              .map((inner) => ({ title: inner.name.slice(0, -4), path: join(root, entry.name, inner.name) }))
          : [],
    ),
  );
}

export function settingsPanes() {
  return execFileSync(scanPanes[0], scanPanes.slice(1))
    .toString()
    .split("\n")
    .filter((line) => line)
    .map((line) => {
      const [id, title] = line.split("\t");
      return { id, title: paneTitles[id] ?? title };
    });
}
