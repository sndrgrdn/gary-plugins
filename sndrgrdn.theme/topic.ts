export type Item = { id: string; name: string; mode: "light" | "dark"; current: boolean; preview: string | null; colors: Record<string, string> };
export type Topic = { themes: Item[]; current: string | null };
