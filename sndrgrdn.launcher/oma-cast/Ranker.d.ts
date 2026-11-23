import type { SearchTerm } from "./Frecency";

export type Candidate = { id: string; type: string; title: string; frecency?: number; openedAt?: number | null; searchTerms?: SearchTerm[] };

export function rank<C extends Candidate>(candidates: readonly C[], query: string, options?: { nowMs?: number }): { candidate: C }[];
