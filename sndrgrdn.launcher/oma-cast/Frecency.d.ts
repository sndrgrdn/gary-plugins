export type SearchTerm = { term: string; at: number };
export type Visits = { anchor: number; openedAt: number; searchTerms: SearchTerm[] };

export const LAMBDA: number;
export const VISIT_BONUS: number;
export const SEARCH_TERM_WINDOW_MS: number;
export const MAX_SEARCH_TERMS: number;
export function score(anchorSec: number | null | undefined, nowSec: number): number;
export function visit(anchorSec: number | null | undefined, nowSec: number): number;
export function recordVisit(entry: Visits | null | undefined, nowMs: number, searchTerm?: string | null): Visits;
