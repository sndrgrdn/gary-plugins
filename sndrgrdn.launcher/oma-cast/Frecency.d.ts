export type SearchTerm = { term: string; at: number };
export type Visits = { anchor: number; openedAt: number; searchTerms: SearchTerm[] };

export function score(anchorSec: number | null | undefined, nowSec: number): number;
export function recordVisit(entry: Visits | null | undefined, nowMs: number, searchTerm?: string | null): Visits;
