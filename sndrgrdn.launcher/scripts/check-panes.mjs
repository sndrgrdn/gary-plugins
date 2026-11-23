#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const plugin = fileURLToPath(new URL("..", import.meta.url));
const Ranker = await import(join(plugin, "oma-cast/Ranker.js"));
const { installedApps, settingsPanes } = await import(join(plugin, "scripts/installed.mjs"));

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const spread = (times, digits) => {
  const sorted = [...times].sort((a, b) => a - b);
  return `p50 ${percentile(sorted, 0.5).toFixed(digits)} ms, max ${sorted.at(-1).toFixed(digits)} ms`;
};
const failures = [];

const scans = Array.from({ length: 10 }, () => {
  const at = performance.now();
  const panes = settingsPanes();
  return { ms: performance.now() - at, panes };
});
const panes = scans[0].panes;
if (scans.some(({ panes: again }) => JSON.stringify(again) !== JSON.stringify(panes))) failures.push("scans differ between runs");
if (!panes.length) failures.push("the scan found no settings panes");
for (const { id, title } of panes) if (/(Extension|Preferences|Settings)$/.test(title)) failures.push(`internal name: ${id} → ${title}`);

const apps = installedApps();
const candidates = [
  ...apps.map(({ title, path }) => ({ kind: "app", id: path, title, path, type: "application", frecency: 1, openedAt: null, searchTerms: [] })),
  ...panes.map(({ id, title }) => ({ kind: "pane", id, title, type: "preference", frecency: 1, openedAt: null, searchTerms: [] })),
];
const nowMs = Date.now();
const first = (query) => Ranker.rank(candidates, query, { nowMs })[0]?.candidate;

const expected = {
  keyboard: "Keyboard", displays: "Displays", sound: "Sound", mouse: "Mouse", wallpaper: "Wallpaper", privacy: "Privacy & Security",
  accessibility: "Accessibility", general: "General", wifi: "Wi‑Fi", battery: "Battery", headphones: "Headphones",
};
for (const [query, title] of Object.entries(expected)) {
  const got = first(query);
  if (got?.kind !== "pane" || got.title !== title) failures.push(`expected ${query} → pane ${title}, got ${got?.kind} ${got?.title}`);
}
const settingsApp = first("system settings");
if (settingsApp?.kind !== "app" || settingsApp.title !== "System Settings") failures.push(`expected system settings → the app, got ${settingsApp?.kind} ${settingsApp?.title}`);
const empty = Ranker.rank(candidates, "", { nowMs }).map((ranked) => ranked.candidate.kind);
if (empty.indexOf("pane") < empty.lastIndexOf("app")) failures.push("with no visits and no query, a pane lists above an app");

const names = [...apps.map((app) => app.title), ...panes.map((pane) => pane.title)];
const corpus = [...new Set(["", ...names.flatMap((name) => [...name].map((_, at) => name.slice(0, at + 1).toLowerCase()))])];

function timeNode() {
  corpus.forEach((query) => Ranker.rank(candidates, query, { nowMs }));
  return corpus.map((query) => {
    const at = performance.now();
    Ranker.rank(candidates, query, { nowMs });
    return performance.now() - at;
  });
}

function timeJsc() {
  const jsc = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc";
  if (!existsSync(jsc)) return null;
  const folder = mkdtempSync(join(tmpdir(), "check-panes-"));
  copyFileSync(join(plugin, "oma-cast/Ranker.js"), join(folder, "Ranker.js"));
  writeFileSync(
    join(folder, "driver.js"),
    `import { rank } from "./Ranker.js";
const candidates = ${JSON.stringify(candidates)};
const corpus = ${JSON.stringify(corpus)};
corpus.forEach((query) => rank(candidates, query, { nowMs: ${nowMs} }));
print(JSON.stringify(corpus.map((query) => { const at = preciseTime(); rank(candidates, query, { nowMs: ${nowMs} }); return (preciseTime() - at) * 1000; })));
`,
  );
  return JSON.parse(execFileSync(jsc, ["-m", join(folder, "driver.js")], { maxBuffer: 64 << 20 }).toString());
}

const jsc = timeJsc();
console.log(`(a) ${panes.length} settings panes: ${panes.map((pane) => pane.title).join(", ")}`);
console.log(`(b) scan over ${scans.length} runs: ${spread(scans.map((scan) => scan.ms), 0)}`);
console.log(`(c) ranking ${apps.length} apps and ${panes.length} panes for ${corpus.length} queries`);
console.log(`    node ${spread(timeNode(), 3)}`);
console.log(`    jsc  ${jsc ? spread(jsc, 3) : "not found"}`);
for (const line of failures) console.log(`FAIL ${line}`);
process.exit(failures.length ? 1 : 0);
