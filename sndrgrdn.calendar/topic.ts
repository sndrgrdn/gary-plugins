export type Event = { time: string | null; title: string };
export type Topic = { available: true; events: Event[] } | { available: false; reason: string };
