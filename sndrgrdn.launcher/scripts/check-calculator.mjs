#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.TZ = "Europe/Amsterdam";
registerHooks({
  resolve(specifier, context, next) {
    const found = specifier.startsWith(".") && [".ts", ".js"].map((extension) => specifier + extension).find((candidate) => existsSync(fileURLToPath(new URL(candidate, context.parentURL))));
    return next(found || specifier, context);
  },
});

const plugin = fileURLToPath(new URL("..", import.meta.url));
const Calculator = await import(join(plugin, "oma-cast/Calculator.js"));
const { calculate } = await import(join(plugin, "calculate.ts"));

const env = {
  nowMs: Date.UTC(2026, 10, 20, 7, 43),
  localOffset: 60,
  hour12: false,
  rates: { base: "EUR", date: "2026-11-20", rates: { USD: 1.0989, GBP: 0.8421, JPY: 170.2, CHF: 0.93 } },
  zones: { "Asia/Tokyo": 540, "Europe/London": 0, "America/New_York": -300, "Europe/Amsterdam": 60 },
};

const probe = `2+2|2+|2 +|10 +|(2+3|3x3|10k|1e3|5 km to mi|5km to mi|5 km in miles|5 km is how many miles|convert 5 km to miles
how many feet in a mile|5km|5 km|1m|1 gb to mb|1 GB to MB|100mbps to MB/s|1 gib to mb|100 f to c|100f to c|100 °F to °C|37 c to f
60 mph to km/h|60 mph to kmh|1.5h to min|90 min to h|90 min to hours|2 hours in minutes|5 feet 3 inches to cm|5'10" to cm|1 cup to ml
2 tbsp to ml|1 lb to kg|10 stone to kg|16px to rem|2rem|10 usd to eur|10 usd in eur|$10 to eur|€20 to usd|20€ to usd|20 eur to dollars
10 dollars to euro|usd to eur|100 usd|$10 + €5|10 euro|20% of 50|20% off 500|15% tip on 42|half of 90|50 as % of 200|$100 + 10%|0xff
255 to hex|255 in binary|time in tokyo|tokyo time|3pm london to new york|now|today + 3 weeks|days until christmas|2 weeks ago|now to unix
sqrt 16|sqrt(16)|5!|2^10|pi|2pi|1/3|10 mod 3`.split(/[|\n]/);

const expected = {
  "2+": "2", "2 +": "2", "10 +": "10", "(2+3": "5", "2*(3+": "6", "sqrt(16": "4", "2^": "2", "(1+2)*(3": "9",
  "3x3": "9", "1920x1080": "2,073,600", "10k": "10,000", "2.5k": "2,500", "1e3": "1,000", "1.5e-3": "0.0015",
  "5 km is how many miles": "3.1069 mi", "convert 5 km to miles": "3.1069 mi", "convert 5 km": "3.1069 mi",
  "how many feet in a mile": "5,280 ft", "how many weeks in a year": "52.1775 weeks", "how many miles is 5 km": "3.1069 mi",
  "5km": "3.1069 mi", "5 km": "3.1069 mi", "1m": "3.2808 ft", "10 mi": "16.0934 km", "6 ft": "1.8288 m",
  "180 cm": "70.8661 in", "12 in": "30.48 cm", "70 kg": "154.3236 lb", "150 lb": "68.0389 kg", "500 g": "17.637 oz",
  "20 c": "68 °F", "20°C": "68 °F", "100f": "37.7778 °C", "2 L": "0.5283 gal", "1 gal": "3.7854 L", "330 ml": "11.1586 fl oz",
  "100 km/h": "62.1371 mph", "60 mph": "96.5606 km/h",
  "1 gb to mb": "1,000 MB", "1 gib to mb": "1,073.7418 MB", "100mbps to MB/s": "12.5 MB/s", "500 mb in gb": "0.5 GB",
  "100 usd": "€91.00", "10 euro": "$10.99", "$100": "€91.00", "€20": "$21.98", "£10": "€11.88", "10k usd": "€9,100.01",
  "15% tip on 42": "6.3", "half of 90": "45", "a quarter of 200": "50", "half of 5 km": "2.5 km",
  "5'10\" to cm": "177.8 cm", "5'10\"": "5.8333 ft", "6'": "1.8288 m",
  now: null, "42": null, "5": null, "1": null, km: null, "5 s": null, "+": null, "(": null, "-": null,
};

const commonWords = ["safari", "mail", "x", "1password", "notes", "a", "to", "in", "m", "s", "t", "h", "c", "f", "k", "g", "l", "b", "e", "is", "of", "on",
  "it", "at", "as", "pi", "how", "how many", "convert", "half", "tip", "the", "and", "music", "maps", "photos", "terminal", "finder", "messages", "calendar",
  "settings", "system settings", "app store", "preview", "zoom", "slack", "spotify", "chrome", "firefox", "ghostty", "xcode", "figma", "discord", "1", "2", "42"];

function appNames() {
  const roots = ["/Applications", "/System/Applications", join(homedir(), "Applications")].filter(existsSync);
  const list = (folder) => readdirSync(folder, { withFileTypes: true });
  return roots.flatMap((root) =>
    list(root).flatMap((entry) =>
      entry.name.endsWith(".app")
        ? [entry.name.slice(0, -4)]
        : entry.isDirectory()
          ? list(join(root, entry.name)).filter((inner) => inner.name.endsWith(".app")).map((inner) => inner.name.slice(0, -4))
          : [],
    ),
  );
}

const names = [...new Set(appNames())];
const prefixes = [...new Set(names.flatMap((name) => [...name].flatMap((_, at) => [name.slice(0, at + 1), name.slice(0, at + 1).toLowerCase()])))];
const quiet = [...new Set([...prefixes, ...commonWords])];
const show = (answer) => answer?.result ?? null;
const failures = [];
const count = (kind) => failures.filter((line) => line.startsWith(kind)).length;

const kept = probe.filter((query) => Calculator.evaluate(query, env));
for (const query of kept) {
  const before = Calculator.evaluate(query, env).result;
  const after = show(calculate(query, env));
  if (after !== before) failures.push(`baseline changed: ${query} → ${after}, was ${before}`);
}

const added = Object.entries(expected);
for (const [query, answer] of added) {
  const got = show(calculate(query, env));
  if (got !== answer) failures.push(`expected ${query} → ${answer}, got ${got}`);
}

const preexisting = [];
for (const query of quiet) {
  const answer = calculate(query, env);
  if (!answer) continue;
  if (Calculator.evaluate(query, env)) preexisting.push(`${query} → ${answer.result}`);
  else failures.push(`false trigger: ${JSON.stringify(query)} → ${answer.result} via ${answer.rules.join(", ")}`);
}

const stress = ["(".repeat(199), "1+".repeat(99), "how many ".repeat(22), "5 km is ".repeat(25), "1 ".repeat(100), "x".repeat(5000), `convert ${"9".repeat(195)}`];
const corpus = [...new Set([...probe, ...Object.keys(expected), ...quiet, ...stress])];
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const summary = ({ cold, times }) => {
  const sorted = [...times].sort((a, b) => a - b);
  const worst = corpus[times.indexOf(sorted.at(-1))];
  return `cold first call ${cold.toFixed(3)} ms, p50 ${percentile(sorted, 0.5).toFixed(4)} ms, p95 ${percentile(sorted, 0.95).toFixed(4)} ms, max ${sorted.at(-1).toFixed(3)} ms (${JSON.stringify(worst.length > 40 ? `${worst.slice(0, 40)}…` : worst)})`;
};

function timeNode() {
  const start = performance.now();
  calculate(corpus[0], env);
  const cold = performance.now() - start;
  corpus.forEach((query) => calculate(query, env));
  const times = corpus.map((query) => {
    const at = performance.now();
    calculate(query, env);
    return performance.now() - at;
  });
  return { cold, times, results: corpus.map((query) => show(calculate(query, env))) };
}

function timeJsc() {
  const jsc = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc";
  if (!existsSync(jsc)) return null;
  const folder = mkdtempSync(join(tmpdir(), "check-calculator-"));
  copyFileSync(join(plugin, "oma-cast/Calculator.js"), join(folder, "Calculator.js"));
  const source = stripTypeScriptTypes(readFileSync(join(plugin, "calculate.ts"), "utf8")).replace('"./oma-cast/Calculator"', '"./Calculator.js"');
  writeFileSync(join(folder, "calculate.js"), source);
  writeFileSync(
    join(folder, "driver.js"),
    `import { calculate } from "./calculate.js";
const env = ${JSON.stringify(env)};
const corpus = ${JSON.stringify(corpus)};
const show = (answer) => answer ? answer.result : null;
const start = preciseTime();
calculate(corpus[0], env);
const cold = (preciseTime() - start) * 1000;
corpus.forEach((query) => calculate(query, env));
const times = corpus.map((query) => { const at = preciseTime(); calculate(query, env); return (preciseTime() - at) * 1000; });
print(JSON.stringify({ cold, times, results: corpus.map((query) => show(calculate(query, env))) }));
`,
  );
  return JSON.parse(execFileSync(jsc, ["-m", join(folder, "driver.js")], { env: { ...process.env, TZ: "Europe/Amsterdam" }, maxBuffer: 64 << 20 }).toString());
}

const node = timeNode();
const jsc = timeJsc();
if (jsc) corpus.forEach((query, at) => jsc.results[at] !== node.results[at] && failures.push(`jsc differs: ${query} → ${jsc.results[at]}, node ${node.results[at]}`));

console.log(`(a) baseline kept: ${kept.length - count("baseline")}/${kept.length} answers of ${probe.length} probe inputs`);
console.log(`    added cases: ${added.length - count("expected")}/${added.length} pass`);
console.log(`(b) quiet inputs: ${quiet.length} (${names.length} apps, ${prefixes.length} prefixes, ${commonWords.length} common words), false triggers: ${count("false")}`);
console.log(`    already answered by oma-cast alone, unchanged: ${preexisting.length ? preexisting.join("; ") : "none"}`);
console.log(`(c) ${corpus.length} queries`);
console.log(`    node ${summary(node)}`);
console.log(`    jsc  ${jsc ? summary(jsc) : "not found"}`);
for (const line of failures) console.log(`FAIL ${line}`);
process.exit(failures.length ? 1 : 0);
