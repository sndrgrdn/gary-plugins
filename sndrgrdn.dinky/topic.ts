export type Workspace = { number: number; focused: boolean; empty: boolean; layout: string };
export type Display = { uuid: string; workspaces: Workspace[] };
export type Topic = { displays: Display[]; app: string | null };
