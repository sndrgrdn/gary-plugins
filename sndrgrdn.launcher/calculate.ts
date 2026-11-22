import * as Calculator from "./oma-cast/Calculator";

type Rule = { name: string; rewrite: (query: string) => string | null };
export type Answer = Calculator.Calculation & { rules: string[] };

const defaultTargets = new Map<string, string>([
  ["km", "mi"], ["mi", "km"], ["m", "ft"], ["ft", "m"], ["cm", "in"], ["in", "cm"], ["mm", "in"],
  ["kg", "lb"], ["lb", "kg"], ["g", "oz"], ["oz", "g"],
  ["°C", "°F"], ["°F", "°C"],
  ["L", "gal"], ["gal", "L"], ["mL", "fl oz"], ["fl oz", "mL"],
  ["km/h", "mph"], ["mph", "km/h"],
  ...Object.keys(Calculator.CURRENCIES).map((code): [string, string] => [code, "EUR"]),
  ["EUR", "USD"],
]);

const unitNames = new Map<string, string>([
  ...Object.values(Calculator.UNITS).flatMap((unit): [string, string][] => [[unit.name.toLowerCase(), unit.sym], [unit.plural.toLowerCase(), unit.sym]]),
  ...Object.entries(Calculator.CURRENCIES).flatMap(([code, currency]) => currency.names.map((name): [string, string] => [name, code])),
]);

const currencySymbols = new Map(Object.entries(Calculator.CURRENCIES).filter(([, currency]) => currency.symbol).map(([code, currency]) => [currency.symbol, code]));
const fractions = new Map([["half", 2], ["third", 3], ["quarter", 4]]);
const identities = new Map([["+", "0"], ["-", "0"], ["−", "0"], ["*", "1"], ["×", "1"], ["/", "1"], ["÷", "1"], ["^", "1"]]);
const decimalPrefixes = new Map([["k", "k"], ["m", "M"], ["g", "G"], ["t", "T"], ["p", "P"]]);

function unitSymbol(text: string) {
  return Calculator.UNITS[text]?.sym ?? unitNames.get(text.toLowerCase()) ?? Calculator.UNITS[text.toUpperCase()]?.sym;
}

function defaultTarget(query: string) {
  const code = currencySymbols.get(query.charAt(0));
  const amount = code ? query.slice(1).trim() : query;
  if (!/^-?\.?\d/.test(amount)) return null;
  const unit = amount.replace(/^.*\d(?:k(?![A-Za-z]))?/, "").trim();
  const target = code ? (unit ? undefined : defaultTargets.get(code)) : defaultTargets.get(unitSymbol(unit) ?? "");
  return target ? `${query} to ${target}` : null;
}

function complete(query: string) {
  const trimmed = query.replace(/[\s(]+$/, "");
  const body = trimmed + (identities.get(trimmed.slice(-1)) ?? "");
  const depth = body.split("(").length - body.split(")").length;
  return body + ")".repeat(Math.max(0, depth));
}

function howManyIn(query: string) {
  const match = /^how\s+many\s+(.+?)\s+(?:are\s+)?(?:in|is|per)\s+(.+?)\s*\??$/i.exec(query);
  if (!match) return null;
  const amount = match[2].replace(/^(?:a|an|one)\s+/i, "");
  return `${/^[\d.$€£¥]/.test(amount) ? amount : `1 ${amount}`} to ${match[1]}`;
}

const rules: readonly Rule[] = [
  { name: "convert", rewrite: (query) => /^convert\s+(.+)$/i.exec(query)?.[1] ?? null },
  { name: "how-many-in", rewrite: howManyIn },
  { name: "is-how-many", rewrite: (query) => query.replace(/^(.+?)\s+(?:is|are)\s+how\s+many\s+(.+?)\s*\??$/i, "$1 to $2") },
  { name: "tip", rewrite: (query) => query.replace(/^(.*?%)\s*tip\s+(?:on|for|of)\s+/i, "$1 of ") },
  {
    name: "fraction",
    rewrite: (query) => query.replace(/^(?:(?:a|one)\s+)?(half|third|quarter)\s+of\s+(.+)$/i, (_, word: string, rest: string) => `(${rest}) / ${fractions.get(word.toLowerCase())}`),
  },
  { name: "feet-inches", rewrite: (query) => query.replace(/(\d)\s*['′](?!['′])\s*/g, "$1 ft ").replace(/(\d)\s*(?:["″]|['′]{2})\s*/g, "$1 in ").trim() },
  {
    name: "data-case",
    rewrite: (query) =>
      query
        .replace(/(?<![A-Za-z])([kmgtp])(i?)b(?![A-Za-z])/g, (_, prefix: string, binary: string) => `${binary ? prefix.toUpperCase() : decimalPrefixes.get(prefix)}${binary}B`)
        .replace(/(?<![A-Za-z])([kmgtp])bps(?![A-Za-z])/g, (_, prefix: string) => `${decimalPrefixes.get(prefix)}bps`),
  },
  { name: "times", rewrite: (query) => query.replace(/(\d)\s*x\s*(?=[\d.(])/g, "$1 * ") },
  { name: "complete", rewrite: complete },
  { name: "default-target", rewrite: defaultTarget },
  { name: "shorthand", rewrite: (query) => (/^-?(?:\d+\.?\d*|\.\d+)(?:k|[eE][+-]?\d+)$/.test(query) ? `${query} * 1` : null) },
];

export function calculate(query: string, env: Calculator.Env): Answer | null {
  const input = query.trim();
  const applied: string[] = [];
  let current = input;
  let result = Calculator.evaluate(current, env);
  for (const rule of rules) {
    if (result) break;
    const next = rule.rewrite(current);
    if (next === null || next === current) continue;
    current = next;
    applied.push(rule.name);
    result = Calculator.evaluate(current, env);
  }
  return result && { ...result, input, rules: applied };
}
