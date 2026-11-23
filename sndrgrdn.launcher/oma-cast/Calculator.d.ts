export type Env = {
  nowMs?: number;
  localOffset?: number;
  hour12?: boolean;
  rates?: { base: string; date: string; rates: { [code: string]: number } } | null;
  zones?: { [zone: string]: number };
};
export type Calculation = { input: string; result: string; copy: string };

export function evaluate(query: string, env?: Env): Calculation | null;
export function zoneList(): string[];
export const CURRENCIES: { [code: string]: { symbol: string; names: string[] } };
export const UNITS: { [symbol: string]: { sym: string; name: string; plural: string } };
