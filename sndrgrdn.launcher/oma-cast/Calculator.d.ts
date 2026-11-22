export type Rates = { base: string; date: string; rates: { [code: string]: number } };
export type Env = {
  nowMs?: number;
  localOffset?: number;
  hour12?: boolean;
  rates?: Rates | null;
  zones?: { [zone: string]: number };
  remToPxRate?: number;
  workHoursPerDay?: number;
};
export type Calculation = {
  kind: string;
  input: string;
  result: string;
  copy: string;
  value?: number;
  inputCaption: string;
  resultCaption: string;
};
export type HistoryEntry = { id: string; query: string; result: string; copy: string; kind: string; createdAt: number; pinned?: boolean };

export function evaluate(query: string, env?: Env): Calculation | null;
export function lex(input: string): unknown[];
export function words(n: number): string;
export function zoneList(): string[];
export function pushHistory(history: HistoryEntry[] | null | undefined, entry: Omit<HistoryEntry, "createdAt">, nowMs: number): HistoryEntry[];
export function filterHistory(history: HistoryEntry[] | null | undefined, query: string): HistoryEntry[];
export const HISTORY_LIMIT: number;
export const HISTORY_MAX_AGE_MS: number;
export const CURRENCIES: { [code: string]: { symbol: string; names: string[]; decimals?: number } };
export const UNITS: { [symbol: string]: unknown };
