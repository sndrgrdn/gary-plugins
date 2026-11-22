export type Content = { text: string } | { image: string } | { files: string[] };
export type Entry = Content & { copied: number };
export type Topic = Entry[];
