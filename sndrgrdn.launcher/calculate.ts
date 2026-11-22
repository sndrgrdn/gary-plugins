import * as Calculator from "./oma-cast/Calculator";

type Rule = { name: string; rewrite: (query: string) => string | null };
export type Answer = Calculator.Calculation & { rules: string[] };

const identities = new Map([["+", "0"], ["-", "0"], ["−", "0"], ["*", "1"], ["×", "1"], ["/", "1"], ["÷", "1"], ["^", "1"]]);

function complete(query: string) {
  const trimmed = query.replace(/[\s(]+$/, "");
  const body = trimmed + (identities.get(trimmed.slice(-1)) ?? "");
  const depth = body.split("(").length - body.split(")").length;
  return body + ")".repeat(Math.max(0, depth));
}

const rules: readonly Rule[] = [
  { name: "times", rewrite: (query) => query.replace(/(\d)\s*x\s*(?=[\d.(])/g, "$1 * ") },
  { name: "complete", rewrite: complete },
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
